'use client';
import Image from 'next/image';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GalleryImage { url: string; alt: string }

export function ProductGallery({
  images,
  productName,
  isNew = false,
  discountPct = null,
}: {
  images: GalleryImage[];
  productName: string;
  isNew?: boolean;
  discountPct?: number | null;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  if (!images.length) return <div className="rounded-[24px] border border-line bg-surface-soft aspect-square grid place-items-center text-ink-muted">нет фото</div>;
  const idx = Math.min(active, images.length - 1);
  const main = images[idx];
  const multi = images.length > 1;
  // листание в лайтбоксе по кругу
  const step = (dir: number) => setActive((i) => (((Math.min(i, images.length - 1) + dir) % images.length) + images.length) % images.length);
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 min-w-0">
      {multi && (
        <div className="flex sm:flex-col gap-2.5 sm:w-[84px] sm:shrink-0 overflow-x-auto" role="list" aria-label="Фотографии модели">
          {images.map((img, i) => (
            <button key={i} className="thumb aspect-square w-[72px] sm:w-full shrink-0" aria-current={i === active} aria-label={`Фото ${i + 1}`} onClick={() => setActive(i)}>
              <Image src={img.url} alt={img.alt} width={84} height={84} className="object-contain p-1.5 w-full h-full" />
            </button>
          ))}
        </div>
      )}
      <figure className={cn('relative flex-1 min-w-0 rounded-[24px] border border-line bg-surface-soft overflow-hidden aspect-square')}>
        {/* бейджи поверх главного кадра, слева сверху */}
        {(isNew || discountPct != null) && (
          <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-1.5">
            {discountPct != null && (
              <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-warm text-ink">−{discountPct}%</span>
            )}
            {isNew && (
              <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary text-primary-foreground">Новинка</span>
            )}
          </div>
        )}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            className="absolute top-4 right-4 z-10 w-10 h-10 grid place-items-center rounded-full bg-surface/80 backdrop-blur hover:bg-surface transition"
            aria-label="Открыть фото на весь экран"
          >
            <Maximize2 className="w-5 h-5" />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-8 focus:outline-none"
              aria-label={`${productName}: просмотр фото`}
            >
              <Dialog.Title className="sr-only">{productName}</Dialog.Title>
              <Dialog.Close
                className="absolute top-4 right-4 z-10 w-10 h-10 grid place-items-center rounded-full bg-surface/90 backdrop-blur hover:bg-surface transition"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </Dialog.Close>
              <div className="relative w-full max-w-[1000px] aspect-[4/3]">
                <Image src={main.url} alt={main.alt || productName} fill className="object-contain" sizes="100vw" priority />
              </div>
              {multi && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 grid place-items-center rounded-full bg-surface/90 backdrop-blur hover:bg-surface transition"
                    aria-label="Предыдущее фото"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 grid place-items-center rounded-full bg-surface/90 backdrop-blur hover:bg-surface transition"
                    aria-label="Следующее фото"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <span className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 text-xs font-medium px-2.5 py-1 rounded-full bg-surface/90 backdrop-blur text-ink tnum">
                    {idx + 1} / {images.length}
                  </span>
                </>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Image src={main.url} alt={main.alt || productName} fill className="object-contain" sizes="(min-width: 640px) 560px, 100vw" priority />
      </figure>
    </div>
  );
}
