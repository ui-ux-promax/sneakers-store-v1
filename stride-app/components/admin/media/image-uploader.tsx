'use client';

import * as React from 'react';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { validateImageFile } from '@/lib/cloudinary/validate';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { ImagePreviewCard } from './image-preview-card';

interface ImageUploaderProps {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  folder?: string;
  max?: number;
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export function ImageUploader({
  value,
  onChange,
  folder = 'stride/uploads',
  max = 8,
}: ImageUploaderProps) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const disabled = !CLOUD_NAME;
  const full = value.length >= max;

  async function uploadOne(file: File): Promise<UploadedImage> {
    const signRes = await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({}));
      throw new Error(body.message ?? 'Не удалось получить подпись загрузки');
    }
    const { signature, timestamp, apiKey, cloudName, folder: signedFolder } = await signRes.json();

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', signedFolder);
    form.append('signature', signature);

    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!upRes.ok) {
      const body = await upRes.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? 'Cloudinary отклонил загрузку');
    }
    const data = await upRes.json();
    return {
      publicId: data.public_id,
      url: data.secure_url,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = max - value.length;
    const picked = Array.from(files).slice(0, remaining);

    for (const f of picked) {
      const v = validateImageFile({ type: f.type, size: f.size });
      if (!v.ok) {
        setError(v.error);
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: UploadedImage[] = [];
      for (const f of picked) {
        uploaded.push(await uploadOne(f));
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove(index: number) {
    const img = value[index];
    onChange(value.filter((_, i) => i !== index));
    // Best-effort delete from Cloudinary; ignore the outcome (covers the basic orphan case).
    void fetch('/api/admin/media/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId: img.publicId }),
    }).catch(() => {});
  }

  function handleMove(index: number, dir: -1 | 1) {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function handleAltChange(index: number, alt: string) {
    onChange(value.map((img, i) => (i === index ? { ...img, alt } : img)));
  }

  if (disabled) {
    return (
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 text-admin-on-surface-variant text-sm">
        Cloudinary не настроен. Задайте NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY и
        CLOUDINARY_API_SECRET, чтобы включить загрузку изображений.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading && !full) handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-admin-outline-variant rounded-xl p-6 flex flex-col items-center gap-3 text-admin-on-surface-variant"
      >
        <Icon name="cloud_upload" className="text-4xl" />
        <p className="text-sm">Перетащите изображения сюда или выберите файлы</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          disabled={full}
          onClick={() => inputRef.current?.click()}
        >
          {full ? `Достигнут лимит (${max})` : 'Выбрать файлы'}
        </Button>
      </div>

      {error && <p className="text-sm text-admin-error">{error}</p>}

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {value.map((img, i) => (
            <ImagePreviewCard
              key={img.publicId}
              image={img}
              index={i}
              total={value.length}
              onRemove={handleRemove}
              onAltChange={handleAltChange}
              onMove={handleMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
