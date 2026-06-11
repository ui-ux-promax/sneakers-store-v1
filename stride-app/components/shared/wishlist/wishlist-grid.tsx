import { ProductCard } from '@/components/shared/product-card';
import type { ProductCardData } from '@/lib/product-summary';

export function WishlistGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-1 min-[450px]:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted />)}
    </div>
  );
}
