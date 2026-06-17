'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
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
  const [zooming, setZooming] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);

  if (!images.length) {
    return <div className="rounded-[24px] border border-line bg-surface-soft aspect-square grid place-items-center text-ink-muted">нет фото</div>;
  }
  const idx = Math.min(active, images.length - 1);
  const main = images[idx];
  const multi = images.length > 1;
  // листание по кругу (в лайтбоксе и стрелками)
  const step = (dir: number) => setActive((i) => (((Math.min(i, images.length - 1) + dir) % images.length) + images.length) % images.length);

  // Курсор-зум: transform-origin пишем напрямую в DOM (transient — без ре-рендера на каждое движение).
  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = zoomRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };
  // Зум только на устройствах с точным указателем и hover (мышь) — не на тач.
  const enterZoom = () => { if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setZooming(true); };
  const leaveZoom = () => setZooming(false);
  const openLightbox = () => { setZooming(false); setOpen(true); };

  // Стрелки в лайтбоксе — оконный слушатель (надёжнее, чем onKeyDown на Dialog.Content:
  // не зависит от того, какой именно элемент держит фокус внутри focus-trap Radix).
  useEffect(() => {
    if (!open || !multi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // step стабилен по поведению (functional setState); images.length константна в рамках mount (key=colorway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, multi, images.length]);

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 min-w-0">
      {multi && (
        <div className="flex sm:flex-col gap-2.5 sm:w-[84px] sm:shrink-0 overflow-x-auto sm:overflow-visible" role="list" aria-label="Фотографии модели">
          {images.map((img, i) => (
            <button
              key={i}
              className={cn('thumb aspect-square w-[72px] sm:w-full shrink-0', i === idx && 'shadow-[0_0_0_3px_hsl(var(--color-primary)/0.45)]')}
              aria-current={i === idx}
              aria-label={`Фото ${i + 1}`}
              onClick={() => setActive(i)}
            >
              <Image src={img.url} alt={img.alt} width={84} height={84} className="object-cover w-full h-full" />
            </button>
          ))}
        </div>
      )}

      <figure
        className="group relative flex-1 min-w-0 rounded-[24px] border border-line bg-surface-soft overflow-hidden aspect-square cursor-zoom-in"
        role="button"
        tabIndex={0}
        aria-label="Открыть фото на весь экран"
        onMouseMove={onMove}
        onMouseEnter={enterZoom}
        onMouseLeave={leaveZoom}
        onClick={openLightbox}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(); } }}
      >
        {/* бейджи поверх главного кадра */}
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
        {/* подсказка-«развернуть» (визуальная — весь кадр кликабелен) */}
        <span className="absolute top-4 right-4 z-10 w-10 h-10 grid place-items-center rounded-full bg-surface/80 backdrop-blur text-ink pointer-events-none transition-transform group-hover:scale-105">
          <Maximize2 className="w-5 h-5" />
        </span>

        {/* кадр заполняет квадрат (object-cover); курсор-зум через transform на обёртке */}
        <div
          ref={zoomRef}
          className={cn('absolute inset-0 [will-change:transform] transition-transform duration-300', zooming ? 'scale-[1.9] duration-100' : 'scale-100')}
        >
          <Image src={main.url} alt={main.alt || productName} fill className="object-cover" sizes="(min-width: 1024px) 600px, (min-width: 640px) 58vw, 100vw" priority />
        </div>

        {multi && (
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-xs font-medium px-2.5 py-1 rounded-full bg-surface/85 backdrop-blur border border-line text-ink tnum">
            {idx + 1} / {images.length}
          </span>
        )}
      </figure>

      {/* Лайтбокс: полноэкранный просмотр (object-contain — показываем кадр целиком) */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-8 focus:outline-none"
            aria-label={`${productName}: просмотр фото`}
            onClick={() => setOpen(false)}
          >
            <Dialog.Title className="sr-only">{productName}</Dialog.Title>
            <Dialog.Close
              className="absolute top-4 right-4 z-10 w-10 h-10 grid place-items-center rounded-full bg-surface/90 backdrop-blur hover:bg-surface transition"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </Dialog.Close>
            {/* Клик по самому фото не закрывает — закрывает только пустая область (Content). */}
            <div className="relative w-full max-w-[1000px] aspect-[4/3]" onClick={(e) => e.stopPropagation()}>
              <Image src={main.url} alt={main.alt || productName} fill className="object-contain" sizes="100vw" />
            </div>
            {multi && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 grid place-items-center rounded-full bg-surface/90 backdrop-blur hover:bg-surface transition"
                  aria-label="Предыдущее фото"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(1); }}
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
    </div>
  );
}
