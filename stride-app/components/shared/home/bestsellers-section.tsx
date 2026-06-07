import Link from 'next/link';
import { ProductCard } from '@/components/shared/product-card';
import type { ProductCardData } from '@/lib/product-summary';

export function BestsellersSection({ products, wishlistedIds }: { products: ProductCardData[]; wishlistedIds: Set<string> }) {
  return (
    <section id="best" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="label">Выбор недели</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight">Бестселлеры</h2>
        </div>
        <Link href="/catalog" className="btn btn-md btn-ghost">Смотреть все →</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted={wishlistedIds.has(p.id)} />)}
      </div>
    </section>
  );
}
