import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui';
import { PriceTag } from './price-tag';
import { WishlistHeart } from '@/components/shared/wishlist/wishlist-heart';
import type { ProductCardData } from '@/lib/product-summary';

// Бежевый (surface-soft) плейсхолдер-блюр: пока фото грузится, карточка не «пыхает»
// пустым квадратом, а плавно проявляет изображение поверх фона в цвет витрины.
const BEIGE_BLUR =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='8'%3E%3Crect%20width='8'%20height='8'%20fill='%23f1ece1'/%3E%3C/svg%3E";

export function ProductCard({ data, wishlisted = false }: { data: ProductCardData; wishlisted?: boolean }) {
  const href = `/product/${data.slug}`;
  return (
    <article className="group rounded-2xl bg-surface border border-line overflow-hidden">
      <div className="relative aspect-square bg-surface-soft overflow-hidden">
        <WishlistHeart productId={data.id} initialActive={wishlisted} variant="card" />
        {data.badges[0] && (
          <span className="absolute top-3 left-3 z-10">
            <Badge tone={data.badges[0].tone}>{data.badges[0].label}</Badge>
          </span>
        )}
        <Link href={href} aria-label={data.name} className="absolute inset-0">
          {data.imageUrl ? (
            <Image
              src={data.imageUrl}
              alt={data.imageAlt}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              placeholder="blur"
              blurDataURL={BEIGE_BLUR}
              className={`object-cover transition-transform duration-300 group-hover:scale-105 ${data.soldOut ? 'opacity-50 grayscale' : ''}`}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-ink-muted text-xs">нет фото</div>
          )}
        </Link>
        {!data.soldOut && (
          <Link
            href={href}
            aria-label={`Выбрать размер: ${data.name}`}
            className="absolute bottom-3 right-3 z-10 btn btn-primary w-10 h-10 !p-0 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
          >
            <Plus className="w-5 h-5" />
          </Link>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-[11px] text-ink-muted uppercase tracking-wide">{data.categoryName}</p>
        <h3 className="font-semibold text-sm mt-0.5 leading-snug">
          <Link href={href} className="hover:underline underline-offset-2">{data.name}</Link>
        </h3>
        <PriceTag price={data.minPrice} compareAtPrice={data.minCompareAtPrice} className="mt-2" />
      </div>
    </article>
  );
}
