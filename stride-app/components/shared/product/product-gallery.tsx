'use client';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface GalleryImage { url: string; alt: string }

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) return <div className="rounded-[24px] border border-line bg-surface-soft aspect-[4/3] grid place-items-center text-ink-muted">нет фото</div>;
  const main = images[Math.min(active, images.length - 1)];
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 min-w-0">
      {images.length > 1 && (
        <div className="flex sm:flex-col gap-2.5 sm:w-[84px] sm:shrink-0 overflow-x-auto" role="list" aria-label="Фотографии модели">
          {images.map((img, i) => (
            <button key={i} className="thumb aspect-square w-[72px] sm:w-full shrink-0" aria-current={i === active} aria-label={`Фото ${i + 1}`} onClick={() => setActive(i)}>
              <Image src={img.url} alt={img.alt} width={84} height={84} className="object-contain p-1.5 w-full h-full" />
            </button>
          ))}
        </div>
      )}
      <figure className={cn('relative flex-1 min-w-0 rounded-[24px] border border-line bg-surface-soft overflow-hidden aspect-[4/3]')}>
        <Image src={main.url} alt={main.alt || productName} fill className="object-contain p-6" priority />
      </figure>
    </div>
  );
}
