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

  const coupons = [
    { code: 'STRIDE10', percent: 10, active: true, expiresAt: null },
    { code: 'WELCOME15', percent: 15, active: true, expiresAt: null },
    { code: 'EXPIRED', percent: 50, active: true, expiresAt: new Date('2020-01-01') }, // для e2e-негатива
  ];
  for (const c of coupons) {
    await prisma.coupon.upsert({ where: { code: c.code }, update: c, create: c });
  }
  console.log(`Seeded ${coupons.length} coupons`);

  // Demo-отзывы: seed не создаёт заказы, поэтому пишем напрямую (verified-гейт только на write-пути
  // submitReview). Demo-юзеры неаутентифицируемы (passwordHash null) и НЕ должны линковаться через OAuth —
  // домен @seed.invalid (RFC 2606) гарантированно недоставляем. Чистим перед пере-сидом для идемпотентности.
  const demoUsers = [
    { email: 'review-demo-1@seed.invalid', name: 'Алексей' },
    { email: 'review-demo-2@seed.invalid', name: 'Марина' },
  ];
  await prisma.review.deleteMany({ where: { user: { email: { in: demoUsers.map((u) => u.email) } } } });
  await prisma.user.deleteMany({ where: { email: { in: demoUsers.map((u) => u.email) } } });
  const reviewUserIdByEmail = new Map<string, string>();
  for (const u of demoUsers) {
    const created = await prisma.user.upsert({
      where: { email: u.email }, update: { name: u.name }, create: { email: u.email, name: u.name },
    });
    reviewUserIdByEmail.set(u.email, created.id);
  }

  const demoReviews = [
    { slug: 'stride-velocity-trail', email: 'review-demo-1@seed.invalid', rating: 5, body: 'Отличная амортизация, беру второй раз.' },
    { slug: 'stride-velocity-trail', email: 'review-demo-2@seed.invalid', rating: 4, body: 'Хорошие, но размер чуть великоват.' },
  ];
  for (const r of demoReviews) {
    const product = await prisma.product.findUnique({ where: { slug: r.slug }, select: { id: true } });
    const reviewUserId = reviewUserIdByEmail.get(r.email);
    if (!product || !reviewUserId) continue;
    await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: reviewUserId } },
      update: { rating: r.rating, body: r.body },
      create: { productId: product.id, userId: reviewUserId, rating: r.rating, body: r.body },
    });
  }
  console.log(`Seeded ${demoReviews.length} reviews`);
}

async function main() {
  await down();
  await up();
  const [categoryN, productN, colorwayN, imageN, variantN, soldOutN, couponN, reviewN] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productColorway.count(),
    prisma.productImage.count(),
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { stock: 0 } }),
    prisma.coupon.count(),
    prisma.review.count(),
  ]);
  console.log(
    `Seed готов: categories=${categoryN} products=${productN} colorways=${colorwayN} ` +
      `images=${imageN} variants=${variantN} (variants stock=0: ${soldOutN}) coupons=${couponN} reviews=${reviewN}`,
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
