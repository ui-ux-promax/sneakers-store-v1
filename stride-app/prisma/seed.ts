import { prisma } from '../lib/prisma-client';
import { categories, products } from './seed-data';

// Neon HTTP-адаптер НЕ поддерживает транзакции. Поэтому НЕ используем createMany /
// вложенные create / $transaction. Каждая запись — одиночный upsert
// (`INSERT ... ON CONFLICT DO UPDATE` — один statement, без транзакции).
// Upsert делает сид ИДЕМПОТЕНТНЫМ: retry-обёртка prisma-client при потере ответа
// на транзиентной ошибке может повторить запись — с upsert это безвредно
// (повтор превращается в UPDATE), без unique-violation 23505.

async function down() {
  // Один statement → один HTTP-запрос. Чистит «снятые» товары перед пере-сидом.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "CartItem","Cart","ProductImage","ProductVariant","ProductColorway","Product","Category" RESTART IDENTITY CASCADE',
  );
}

async function up() {
  const categoryIdBySlug = new Map<string, string>();
  for (const c of categories) {
    const created = await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, tagline: c.tagline, sortOrder: c.sortOrder },
    });
    categoryIdBySlug.set(created.slug, created.id);
  }

  for (const item of products) {
    const categoryId = categoryIdBySlug.get(item.categorySlug);
    if (!categoryId) throw new Error(`Категория не найдена: ${item.categorySlug}`);

    const productData = {
      name: item.name,
      slug: item.slug,
      brand: item.brand,
      gender: item.gender,
      description: item.description,
      fitNote: item.fitNote,
      specs: item.specs,
      isBestseller: item.isBestseller,
      sortOrder: item.sortOrder,
      categoryId,
    };
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      create: productData,
      update: productData,
    });

    for (const cw of item.colorways) {
      const colorway = await prisma.productColorway.upsert({
        where: { productId_slug: { productId: product.id, slug: cw.slug } },
        create: {
          productId: product.id,
          name: cw.name,
          slug: cw.slug,
          swatchHex: cw.swatchHex,
          isDefault: cw.isDefault,
          sortOrder: cw.sortOrder,
        },
        update: { name: cw.name, swatchHex: cw.swatchHex, isDefault: cw.isDefault, sortOrder: cw.sortOrder },
      });

      for (const im of cw.images) {
        // У ProductImage нет натурального unique → детерминированный глобально-уникальный id.
        const imageId = `${item.slug}__${cw.slug}__img${im.sortOrder}`;
        await prisma.productImage.upsert({
          where: { id: imageId },
          create: { id: imageId, colorwayId: colorway.id, url: im.url, alt: im.alt, sortOrder: im.sortOrder },
          update: { url: im.url, alt: im.alt, sortOrder: im.sortOrder, colorwayId: colorway.id },
        });
      }

      for (const v of cw.variants) {
        const variantData = {
          colorwayId: colorway.id,
          sizeEu: v.sizeEu,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? undefined,
          stock: v.stock,
          active: true,
        };
        await prisma.productVariant.upsert({
          where: { sku: v.sku },
          create: variantData,
          update: variantData,
        });
      }
    }
  }
}

async function main() {
  await down();
  await up();
  const [categoryN, productN, colorwayN, imageN, variantN, soldOutN] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productColorway.count(),
    prisma.productImage.count(),
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { stock: 0 } }),
  ]);
  console.log(
    `Seed готов: categories=${categoryN} products=${productN} colorways=${colorwayN} ` +
      `images=${imageN} variants=${variantN} (variants stock=0: ${soldOutN})`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
