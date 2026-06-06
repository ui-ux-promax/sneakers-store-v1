import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma-client';
import { getProductBySlug } from '@/lib/get-product';
import { productCardInclude, buildProductCardData } from '@/lib/product-summary';
import { normalizeSize } from '@/lib/format';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD } from '@/constants/config';
import { ProductCard } from '@/components/shared/product-card';
import { Breadcrumbs } from '@/components/shared/product/breadcrumbs';
import { ProductGallery } from '@/components/shared/product/product-gallery';
import { PurchasePanel } from '@/components/shared/product/purchase-panel';
import { SpecsTable } from '@/components/shared/product/specs-table';
import { auth } from '@/auth';
import { canReview } from '@/lib/review';
import { RatingStars } from '@/components/shared/product/rating-stars';
import { ReviewsSection } from '@/components/shared/product/reviews-section';
import type { ReviewItem } from '@/components/shared/product/review-list';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findFirst({ where: { slug, active: true }, select: { name: true, description: true } });
  if (!product) return { title: 'Товар не найден', robots: { index: false, follow: false } };
  return { title: product.name, description: product.description ?? undefined, alternates: { canonical: `/product/${slug}` } };
}

export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { color } = await searchParams;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const active = product.colorways.find((c) => c.slug === color) ?? product.colorways.find((c) => c.isDefault) ?? product.colorways[0];
  if (!active) notFound();

  const now = new Date();
  const relatedRaw = await prisma.product.findMany({
    where: { active: true, categoryId: product.categoryId, NOT: { id: product.id } },
    take: 4, orderBy: { sortOrder: 'asc' }, include: productCardInclude,
  });
  const related = relatedRaw.map((p) => buildProductCardData(p, now, { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD }));

  const [agg, reviewRows, session] = await Promise.all([
    prisma.review.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
    }),
    auth(),
  ]);
  const reviews: ReviewItem[] = reviewRows.map((r) => ({
    id: r.id, rating: r.rating, body: r.body, createdAt: r.createdAt,
    authorName: r.user.name?.trim() ? r.user.name : 'Покупатель',
  }));
  const avg = agg._avg.rating ?? 0;
  const count = agg._count;
  const eligible = session?.user?.id ? await canReview(session.user.id, product.id) : false;
  const reviewState: 'eligible' | 'guest' | 'not-eligible' =
    !session?.user?.id ? 'guest' : eligible ? 'eligible' : 'not-eligible';

  const galleryImages = active.images.map((im) => ({ url: im.url, alt: im.alt ?? product.name }));
  const panelColorways = product.colorways.map((cw) => ({ slug: cw.slug, name: cw.name, thumbUrl: cw.images[0]?.url ?? null }));
  const panelVariants = active.variants.map((v) => ({
    id: v.id, sizeEu: normalizeSize(v.sizeEu as unknown as number), stock: v.stock, active: v.active,
    price: v.price, compareAtPrice: v.compareAtPrice,
  }));
  const specs = (product.specs ?? null) as Record<string, string> | null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pb-16">
      <Breadcrumbs items={[
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog' },
        { label: product.category.name, href: `/catalog?category=${product.category.slug}` },
        { label: product.name },
      ]} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 mt-6">
        {/* key по расцветке: при смене ?color= галерея/панель пересоздаются (сброс выбранного размера) */}
        <ProductGallery key={active.slug} images={galleryImages} productName={product.name} />
        <div>
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">{product.category.name} · {product.brand}</p>
          <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight mt-1">{product.name}</h1>
          {count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex"><RatingStars value={avg} count={count} /></a>
          )}
          <div className="mt-5">
            <PurchasePanel
              key={active.slug}
              productName={product.name}
              productSlug={product.slug}
              colorways={panelColorways}
              activeColorwaySlug={active.slug}
              activeColorwayName={active.name}
              variants={panelVariants}
              fitNote={product.fitNote}
            />
          </div>
        </div>
      </div>

      {/* Описание + specs */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 mt-12">
        <div>
          <h2 className="font-display font-bold text-2xl">Об этой модели</h2>
          {product.description && <p className="text-ink-muted mt-3 leading-relaxed">{product.description}</p>}
        </div>
        <SpecsTable specs={specs} />
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display font-bold text-2xl mb-5">С этим смотрят</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {related.map((p) => <ProductCard key={p.slug} data={p} />)}
          </div>
        </section>
      )}

      <ReviewsSection
        productId={product.id} slug={product.slug}
        avg={avg} count={count} reviews={reviews} state={reviewState}
      />

      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: product.name,
        image: galleryImages.map((g) => g.url), description: product.description ?? undefined, brand: product.brand,
        ...(count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: count } } : {}),
        offers: { '@type': 'AggregateOffer', priceCurrency: 'RUB', availability: active.variants.some((v) => v.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', lowPrice: Math.min(...active.variants.map((v) => v.price)) },
      }) }} />
    </div>
  );
}
