'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';
import { productSchema, type ProductValues } from '@/services/dto/product.dto';
import { productDenormFromColorways } from '@/lib/product-aggregates';

export type ProductActionResult = { ok: true; id: string } | { ok: false; error: string };

const LIST_PATH = '/admin/catalog/products';

function firstError(error: import('zod').ZodError): string {
  return error.issues[0]?.message ?? 'Проверьте поля';
}

// Денорм из дерева формы: порядок расцветок = индекс массива (как при записи sortOrder).
function denormOf(v: ProductValues): { minPrice: number; discountPct: number } {
  return productDenormFromColorways(
    v.colorways.map((c, i) => ({
      isDefault: c.isDefault,
      sortOrder: i,
      variants: c.variants.map((vr) => ({ price: vr.price, compareAtPrice: vr.compareAtPrice ?? null, active: vr.active })),
    })),
  );
}

function specsToJson(v: ProductValues): Prisma.InputJsonValue {
  return Object.fromEntries(v.specs.map((s) => [s.key, s.value]));
}

function scalarData(v: ProductValues) {
  return {
    name: v.name,
    slug: v.slug,
    brand: v.brand,
    gender: v.gender,
    categoryId: v.categoryId,
    description: v.description ?? null,
    fitNote: v.fitNote ?? null,
    specs: specsToJson(v),
    isBestseller: v.isBestseller,
    active: v.active,
    sortOrder: v.sortOrder,
    ...denormOf(v),
  };
}

function mapP2002(e: unknown): ProductActionResult | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return { ok: false, error: 'SKU занят: проверьте артикулы вариантов' };
  }
  return null;
}

export async function createProduct(raw: unknown): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;

  try {
    const id = await prisma.$transaction(async (txn) => {
      const product = await txn.product.create({ data: scalarData(v) });
      for (let ci = 0; ci < v.colorways.length; ci++) {
        const c = v.colorways[ci];
        const cw = await txn.productColorway.create({
          data: {
            productId: product.id,
            name: c.name,
            slug: c.slug,
            swatchHex: c.swatchHex ?? null,
            isDefault: c.isDefault,
            sortOrder: ci,
          },
        });
        if (c.images.length > 0) {
          await txn.productImage.createMany({
            data: c.images.map((img, ii) => ({
              colorwayId: cw.id,
              url: img.url,
              publicId: img.publicId ?? null,
              alt: img.alt ?? null,
              sortOrder: ii,
            })),
          });
        }
        for (const vr of c.variants) {
          await txn.productVariant.create({
            data: {
              colorwayId: cw.id,
              sizeEu: vr.sizeEu,
              sku: vr.sku,
              price: vr.price,
              compareAtPrice: vr.compareAtPrice ?? null,
              stock: vr.stock,
              active: vr.active,
            },
          });
        }
      }
      return product.id;
    });
    revalidatePath(LIST_PATH);
    return { ok: true, id };
  } catch (e) {
    const mapped = mapP2002(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function updateProduct(id: string, raw: unknown): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      colorways: {
        select: { id: true, images: { select: { id: true } }, variants: { select: { id: true } } },
      },
    },
  });
  if (!existing) return { ok: false, error: 'Товар не найден' };

  const existingColorwayIds = new Set(existing.colorways.map((c) => c.id));
  const existingVariantIds = new Set(existing.colorways.flatMap((c) => c.variants.map((vr) => vr.id)));
  const incomingColorwayIds = new Set(v.colorways.map((c) => c.id).filter(Boolean) as string[]);
  const incomingVariantIds = new Set(
    v.colorways.flatMap((c) => c.variants.map((vr) => vr.id).filter(Boolean) as string[]),
  );

  const removedColorwayIds = [...existingColorwayIds].filter((cid) => !incomingColorwayIds.has(cid));
  const removedVariantIds = [...existingVariantIds].filter((vid) => !incomingVariantIds.has(vid));

  // Guard: нельзя удалить variant, на который ссылается заказ.
  if (removedVariantIds.length > 0) {
    const refs = await prisma.orderItem.findMany({
      where: { productVariantId: { in: removedVariantIds } },
      select: { productVariantId: true },
      take: 1,
    });
    if (refs.length > 0) {
      return { ok: false, error: 'Вариант используется в заказах — деактивируйте вместо удаления' };
    }
  }

  try {
    await prisma.$transaction(async (txn) => {
      await txn.product.update({ where: { id }, data: scalarData(v) });

      if (removedColorwayIds.length > 0) {
        // cascade удалит images+variants удаляемых расцветок (variants проверены guard'ом).
        await txn.productColorway.deleteMany({ where: { id: { in: removedColorwayIds } } });
      }
      if (removedVariantIds.length > 0) {
        // variants выживших расцветок, которых нет во входе (cascade'нутые уже исчезли — idempotent).
        await txn.productVariant.deleteMany({ where: { id: { in: removedVariantIds } } });
      }

      for (let ci = 0; ci < v.colorways.length; ci++) {
        const c = v.colorways[ci];
        let colorwayId: string;
        if (c.id && existingColorwayIds.has(c.id)) {
          await txn.productColorway.update({
            where: { id: c.id },
            data: { name: c.name, slug: c.slug, swatchHex: c.swatchHex ?? null, isDefault: c.isDefault, sortOrder: ci },
          });
          colorwayId = c.id;
        } else {
          const created = await txn.productColorway.create({
            data: { productId: id, name: c.name, slug: c.slug, swatchHex: c.swatchHex ?? null, isDefault: c.isDefault, sortOrder: ci },
          });
          colorwayId = created.id;
        }

        // Картинки: на них нет входящих FK → полная замена.
        await txn.productImage.deleteMany({ where: { colorwayId } });
        if (c.images.length > 0) {
          await txn.productImage.createMany({
            data: c.images.map((img, ii) => ({
              colorwayId,
              url: img.url,
              publicId: img.publicId ?? null,
              alt: img.alt ?? null,
              sortOrder: ii,
            })),
          });
        }

        // Варианты: diff-upsert (НЕ replace — FK OrderItem).
        for (const vr of c.variants) {
          const data = {
            sizeEu: vr.sizeEu,
            sku: vr.sku,
            price: vr.price,
            compareAtPrice: vr.compareAtPrice ?? null,
            stock: vr.stock,
            active: vr.active,
          };
          if (vr.id && existingVariantIds.has(vr.id)) {
            await txn.productVariant.update({ where: { id: vr.id }, data });
          } else {
            await txn.productVariant.create({ data: { colorwayId, ...data } });
          }
        }
      }
    });
    revalidatePath(LIST_PATH);
    return { ok: true, id };
  } catch (e) {
    const mapped = mapP2002(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function deleteProduct(id: string): Promise<ProductActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, colorways: { select: { images: { select: { publicId: true } }, variants: { select: { id: true } } } } },
  });
  if (!product) return { ok: false, error: 'Товар не найден' };

  const variantIds = product.colorways.flatMap((c) => c.variants.map((vr) => vr.id));
  if (variantIds.length > 0) {
    const refs = await prisma.orderItem.findMany({
      where: { productVariantId: { in: variantIds } },
      select: { productVariantId: true },
      take: 1,
    });
    if (refs.length > 0) {
      return { ok: false, error: 'Товар есть в заказах — деактивируйте вместо удаления' };
    }
  }

  await prisma.product.delete({ where: { id } }); // cascade: colorways → images + variants

  // Best-effort чистка Cloudinary (не блокирует).
  const publicIds = product.colorways.flatMap((c) => c.images.map((im) => im.publicId).filter(Boolean) as string[]);
  for (const pid of publicIds) {
    try {
      await deleteAsset(pid);
    } catch {
      /* best-effort */
    }
  }
  revalidatePath(LIST_PATH);
  return { ok: true, id };
}
