'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { ImageUploader } from '@/components/admin/media/image-uploader';
import { categorySchema, type CategoryValues } from '@/services/dto/category.dto';
import { slugify } from '@/lib/slugify';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { createCategory, updateCategory } from '@/app/actions/admin/categories';

export interface CategoryFormInitial {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  coverImage: string | null;
  coverImagePublicId: string | null;
}

export function CategoryForm({ initial }: { initial?: CategoryFormInitial }) {
  const router = useRouter();
  const [cover, setCover] = React.useState<UploadedImage | null>(
    initial?.coverImage && initial.coverImagePublicId
      ? { publicId: initial.coverImagePublicId, url: initial.coverImage, width: 0, height: 0, format: '', bytes: 0 }
      : null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const slugDirty = React.useRef(Boolean(initial));

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: initial?.name ?? '',
      slug: initial?.slug ?? '',
      tagline: initial?.tagline ?? '',
    },
  });

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugDirty.current) setValue('slug', slugify(e.target.value));
  }

  async function onSubmit(values: CategoryValues) {
    setServerError(null);
    const payload = {
      ...values,
      coverImage: cover?.url,
      coverImagePublicId: cover?.publicId,
    };
    const res = initial ? await updateCategory(initial.id, payload) : await createCategory(payload);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/catalog');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Название</label>
        <Input {...register('name', { onChange: onNameChange })} placeholder="Беговые" />
        {errors.name && <p className="text-sm text-admin-error">{errors.name.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Slug</label>
        <Input
          {...register('slug', { onChange: () => { slugDirty.current = true; } })}
          placeholder="running"
        />
        {errors.slug && <p className="text-sm text-admin-error">{errors.slug.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Подпись</label>
        <Input {...register('tagline')} placeholder="Скорость и амортизация" />
        {errors.tagline && <p className="text-sm text-admin-error">{errors.tagline.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Обложка</label>
        <ImageUploader
          value={cover ? [cover] : []}
          onChange={(imgs) => setCover(imgs[0] ?? null)}
          folder="stride/categories"
          max={1}
        />
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/catalog')}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
