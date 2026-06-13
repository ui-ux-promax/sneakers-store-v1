'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { deleteAsset } from '@/lib/cloudinary/server';
import { slugify } from '@/lib/slugify';
import { categorySchema } from '@/services/dto/category.dto';

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/catalog/categories';

// Нормализация формы: пустой slug → derive из name; пустые строки → undefined.
function normalize(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name : '';
  const slugInput = typeof r.slug === 'string' ? r.slug.trim() : '';
  return {
    name,
    slug: slugInput || slugify(name),
    tagline: r.tagline ? String(r.tagline) : undefined,
    coverImage: r.coverImage ? String(r.coverImage) : undefined,
    coverImagePublicId: r.coverImagePublicId ? String(r.coverImagePublicId) : undefined,
  };
}

export async function createCategory(raw: unknown): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = categorySchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  try {
    await prisma.category.create({
      data: {
        name: v.name,
        slug: v.slug,
        tagline: v.tagline ?? null,
        coverImage: v.coverImage ?? null,
        coverImagePublicId: v.coverImagePublicId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Slug занят' };
    }
    throw e;
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function updateCategory(id: string, raw: unknown): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = categorySchema.safeParse(normalize(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля' };
  const v = parsed.data;

  const existing = await prisma.category.findUnique({ where: { id }, select: { coverImagePublicId: true } });
  if (!existing) return { ok: false, error: 'Категория не найдена' };

  try {
    await prisma.category.update({
      where: { id },
      data: {
        name: v.name,
        slug: v.slug,
        tagline: v.tagline ?? null,
        coverImage: v.coverImage ?? null,
        coverImagePublicId: v.coverImagePublicId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Slug занят' };
    }
    throw e;
  }

  // Старая обложка заменена/удалена → подчистить Cloudinary (best-effort, не блокирует).
  const oldPid = existing.coverImagePublicId;
  if (oldPid && oldPid !== v.coverImagePublicId) {
    try {
      await deleteAsset(oldPid);
    } catch {
      /* best-effort */
    }
  }
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cat = await prisma.category.findUnique({
    where: { id },
    select: { coverImagePublicId: true, _count: { select: { products: true } } },
  });
  if (!cat) return { ok: false, error: 'Категория не найдена' };
  if (cat._count.products > 0) {
    return { ok: false, error: `Нельзя удалить: ${cat._count.products} товаров` };
  }

  if (cat.coverImagePublicId) {
    try {
      await deleteAsset(cat.coverImagePublicId);
    } catch {
      /* best-effort */
    }
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

export async function moveCategory(id: string, dir: 'up' | 'down'): Promise<CategoryActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const target = await prisma.category.findUnique({ where: { id }, select: { id: true, sortOrder: true } });
  if (!target) return { ok: false, error: 'Категория не найдена' };

  const neighbour = await prisma.category.findFirst({
    where: dir === 'up' ? { sortOrder: { lt: target.sortOrder } } : { sortOrder: { gt: target.sortOrder } },
    orderBy: { sortOrder: dir === 'up' ? 'desc' : 'asc' },
    select: { id: true, sortOrder: true },
  });
  if (!neighbour) return { ok: true }; // край списка — no-op

  await prisma.$transaction([
    prisma.category.update({ where: { id: target.id }, data: { sortOrder: neighbour.sortOrder } }),
    prisma.category.update({ where: { id: neighbour.id }, data: { sortOrder: target.sortOrder } }),
  ]);
  revalidatePath(LIST_PATH);
  return { ok: true };
}
