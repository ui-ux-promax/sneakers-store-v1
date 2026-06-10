'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui';
import { useCartStore } from '@/store';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCountdown } from '@/hooks/use-countdown';

export interface PanelColorway { slug: string; name: string; thumbUrl: string | null; }
export interface PanelVariant { id: string; sizeEu: string; stock: number; active: boolean; price: number; compareAtPrice: number | null; }

interface Props {
  productName: string;
  colorways: PanelColorway[];
  activeColorwaySlug: string;
  activeColorwayName: string;
  variants: PanelVariant[];
  fitNote: string | null;
  productSlug: string;
}

export function PurchasePanel({ productName, colorways, activeColorwaySlug, activeColorwayName, variants, fitNote, productSlug }: Props) {
  const [sizeId, setSizeId] = useState<string | null>(null);
  const addCartItem = useCartStore((s) => s.addCartItem);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const { seconds: cooldown, start: startCooldown } = useCountdown();

  const selected = variants.find((v) => v.id === sizeId) ?? null;
  const available = variants.filter((v) => v.active && v.stock > 0);
  const minPrice = available.length ? Math.min(...available.map((v) => v.price)) : (variants[0]?.price ?? 0);
  const shownPrice = selected?.price ?? minPrice;
  const shownCompare = selected?.compareAtPrice ?? null;
  const soldOut = available.length === 0;

  const onAdd = async () => {
    if (!selected || cooldown > 0) return;
    setAdding(true);
    try {
      await addCartItem({ productVariantId: selected.id });
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        startCooldown(Number(e.response.data?.retryAfterSec) || 0);
      }
      /* прочие ошибки — стор выставит error */
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Цена / скидка / наличие */}
      <div className="flex items-end flex-wrap gap-x-3 gap-y-1">
        <p className="font-display font-bold text-[28px] tnum leading-none">{formatPrice(shownPrice)}</p>
        {shownCompare && shownCompare > shownPrice && (
          <>
            <p className="text-ink-muted text-base font-medium line-through tnum mb-0.5">{formatPrice(shownCompare)}</p>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warm text-ink mb-1">−{Math.round((1 - shownPrice / shownCompare) * 100)}%</span>
          </>
        )}
      </div>
      <p className={cn('text-xs font-semibold', soldOut ? 'text-danger' : 'text-success')}>
        {soldOut ? 'Распродано' : 'В наличии'}
      </p>

      {/* Расцветки (свотчи-фото → ?color=) */}
      <div>
        <p className="font-semibold text-sm">Цвет: <span className="text-ink-muted font-normal">{activeColorwayName}</span></p>
        <div className="flex gap-2.5 mt-2">
          {colorways.map((cw) => (
            <Link key={cw.slug} href={`/product/${productSlug}?color=${cw.slug}`} scroll={false} aria-current={cw.slug === activeColorwaySlug ? 'true' : undefined} aria-label={`Цвет ${cw.name}`}
              className={cn('w-11 h-11 rounded-xl overflow-hidden bg-surface-soft', cw.slug === activeColorwaySlug ? 'ring-2 ring-offset-2 ring-[hsl(var(--color-text))]' : 'border border-line hover:border-ink')}>
              {cw.thumbUrl && <Image src={cw.thumbUrl} alt={cw.name} width={44} height={44} className="object-contain p-1 w-full h-full" />}
            </Link>
          ))}
        </div>
      </div>

      {/* Размеры EU */}
      <div>
        <p className="font-semibold text-sm">Размер <span className="text-ink-muted font-normal">EU</span></p>
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 mt-2" role="group" aria-label="Выбор размера">
          {variants.map((v) => {
            const disabled = !v.active || v.stock <= 0;
            return (
              <button key={v.id} type="button" className="size tnum" aria-pressed={v.id === sizeId} disabled={disabled}
                onClick={() => setSizeId(v.id)}>{v.sizeEu}</button>
            );
          })}
        </div>
        {fitNote && <p className="text-xs text-ink-muted mt-2">{fitNote}</p>}
      </div>

      {/* Add to cart */}
      <Button variant="primary" size="lg" className="w-full" disabled={!selected || soldOut || cooldown > 0} loading={adding} onClick={onAdd}>
        {added ? 'Добавлено ✓' : cooldown > 0 ? `Подождите ${cooldown} сек` : !selected ? 'Выберите размер' : `В корзину · ${formatPrice(shownPrice)}`}
      </Button>
      {cooldown > 0 && (
        <p className="text-danger text-xs" role="alert">Слишком часто. Попробуйте через {cooldown} сек</p>
      )}
    </div>
  );
}
