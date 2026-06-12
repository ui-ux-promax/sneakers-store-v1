'use client';

import * as React from 'react';
import { Icon } from '@/components/admin/icon';
import { buildImageUrl } from '@/lib/cloudinary/url';
import type { UploadedImage } from '@/lib/cloudinary/types';

interface ImagePreviewCardProps {
  image: UploadedImage;
  index: number;
  total: number;
  onRemove: (index: number) => void;
  onAltChange: (index: number, alt: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}

export function ImagePreviewCard({
  image,
  index,
  total,
  onRemove,
  onAltChange,
  onMove,
}: ImagePreviewCardProps) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-2 flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- preview only, not LCP */}
      <img
        src={buildImageUrl(image.publicId, 'thumb')}
        alt={image.alt ?? ''}
        width={160}
        height={160}
        className="w-full aspect-square object-cover rounded-lg bg-admin-surface-high"
      />
      <input
        type="text"
        value={image.alt ?? ''}
        onChange={(e) => onAltChange(index, e.target.value)}
        placeholder="alt-текст"
        className="w-full text-xs bg-admin-surface border border-admin-outline-variant rounded-md px-2 py-1 text-admin-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Сдвинуть влево"
            className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            aria-label="Сдвинуть вправо"
            className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
          >
            <Icon name="chevron_right" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label="Удалить"
          className="text-admin-error hover:opacity-80"
        >
          <Icon name="delete" />
        </button>
      </div>
    </div>
  );
}
