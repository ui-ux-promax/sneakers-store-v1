'use client';

import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue, type UseFormGetValues } from 'react-hook-form';
import { Input } from '@/components/admin/ui/input';
import { Button } from '@/components/admin/ui/button';
import { ImageUploader } from '@/components/admin/media/image-uploader';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { VariantMatrix } from './variant-matrix';

export interface ColorwayCardProps {
  ci: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValues: UseFormGetValues<any>;
  isDefault: boolean;
  onMakeDefault: () => void;
  onRemove: () => void;
  removable: boolean;
  referencedVariantIds: Set<string>;
}

export function ColorwayCard({
  ci, control, register, setValue, getValues, isDefault, onMakeDefault, onRemove, removable, referencedVariantIds,
}: ColorwayCardProps) {
  const variantsArray = useFieldArray({ control, name: `colorways.${ci}.variants` as const, keyName: 'key' });

  // Картинки храним как UploadedImage[] в поле формы; ImageUploader уже умеет upload/reorder/alt/delete.
  const images = (useWatch({ control, name: `colorways.${ci}.images` }) as UploadedImage[] | undefined) ?? [];

  return (
    <div className="border border-admin-outline-variant rounded-xl p-4 space-y-4 bg-admin-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="defaultColorway" checked={isDefault} onChange={onMakeDefault} />
            Основная
          </label>
          {removable && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Удалить расцветку</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Название</label>
          <Input placeholder="Чёрный" {...register(`colorways.${ci}.name`)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Slug</label>
          <Input placeholder="black" {...register(`colorways.${ci}.slug`)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-admin-on-surface">Цвет (HEX)</label>
          <Input placeholder="#000000" {...register(`colorways.${ci}.swatchHex`)} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-admin-on-surface">Галерея</label>
        <ImageUploader
          value={images}
          onChange={(imgs) => setValue(`colorways.${ci}.images`, imgs, { shouldDirty: true })}
          folder="stride/products"
          max={8}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-admin-on-surface">Размеры и варианты</label>
        <VariantMatrix
          ci={ci}
          control={control}
          register={register}
          fieldArray={variantsArray}
          setValue={setValue}
          getValues={getValues}
          referencedVariantIds={referencedVariantIds}
        />
      </div>
    </div>
  );
}
