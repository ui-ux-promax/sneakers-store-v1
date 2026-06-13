'use client';

import * as React from 'react';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { Icon } from '@/components/admin/icon';
import { useWatch, type Control, type UseFieldArrayReturn, type UseFormRegister, type UseFormSetValue, type UseFormGetValues, type FieldValues } from 'react-hook-form';
import { suggestSku } from '@/lib/sku';

// Размерный грид по умолчанию: 35.0 … 48.0 с шагом 0.5
const GRID_SIZES = Array.from({ length: (48 - 35) * 2 + 1 }, (_, i) => 35 + i * 0.5);

export interface VariantMatrixProps {
  ci: number; // индекс расцветки
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldArray: UseFieldArrayReturn<any, `colorways.${number}.variants`, 'key'>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValues: UseFormGetValues<any>;
  referencedVariantIds: Set<string>; // variants, удаление которых заблокировано (в заказах)
}

export function VariantMatrix({ ci, control, register, fieldArray, setValue, getValues, referencedVariantIds }: VariantMatrixProps) {
  const { fields, append, remove } = fieldArray;
  const base = `colorways.${ci}.variants` as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchedVariants = (useWatch({ control, name: base }) as any[] | undefined) ?? [];

  function activeSizes(): Set<number> {
    const vs = (getValues(base) as { sizeEu: number }[]) ?? [];
    return new Set(vs.map((v) => Number(v.sizeEu)));
  }

  function toggleSize(size: number) {
    const current = getValues(base) as { id?: string; sizeEu: number }[];
    const idx = current.findIndex((v) => Number(v.sizeEu) === size);
    if (idx >= 0) {
      if (current[idx].id && referencedVariantIds.has(current[idx].id!)) return; // нельзя убрать referenced
      remove(idx);
    } else {
      const product = getValues() as { brand: string; name: string; colorways: { slug: string }[] };
      append({
        sizeEu: size,
        sku: suggestSku({ brand: product.brand, productName: product.name, colorwaySlug: product.colorways[ci]?.slug ?? '', sizeEu: size }),
        price: 0,
        compareAtPrice: null,
        stock: 0,
        active: true,
      });
    }
  }

  function bulkPrice(value: number) {
    (getValues(base) as unknown[]).forEach((_, i) => setValue(`${base}.${i}.price`, value));
  }
  function bulkStock(value: number) {
    (getValues(base) as unknown[]).forEach((_, i) => setValue(`${base}.${i}.stock`, value));
  }

  const selected = activeSizes();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {GRID_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => toggleSize(size)}
            className={
              'px-2.5 py-1 rounded-lg text-xs border ' +
              (selected.has(size)
                ? 'bg-admin-primary text-admin-on-primary border-admin-primary'
                : 'border-admin-outline-variant text-admin-on-surface-variant hover:bg-admin-surface-high')
            }
          >
            {size}
          </button>
        ))}
      </div>

      {fields.length > 0 && (
        <>
          <div className="flex gap-2 items-center">
            <BulkInput label="Цена всем" onApply={bulkPrice} />
            <BulkInput label="Остаток всем" onApply={bulkStock} />
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => {
              const row = f as unknown as { key: string; id?: string; sizeEu: number };
              const id = row.id;
              const locked = Boolean(id && referencedVariantIds.has(id));
              return (
                <div key={row.key} className="grid grid-cols-[60px_1fr_110px_110px_90px_auto_auto] gap-2 items-center">
                  <span className="text-sm text-admin-on-surface-variant">{String(row.sizeEu)}</span>
                  <Input placeholder="SKU" {...register(`${base}.${i}.sku`)} />
                  <Input type="number" placeholder="Цена" {...register(`${base}.${i}.price`, { valueAsNumber: true })} />
                  <Input type="number" placeholder="Старая цена" {...register(`${base}.${i}.compareAtPrice`, { setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v)) })} />
                  <Input type="number" placeholder="Сток" {...register(`${base}.${i}.stock`, { valueAsNumber: true })} />
                  <Switch
                    checked={Boolean(watchedVariants[i]?.active ?? true)}
                    onCheckedChange={(c) => setValue(`${base}.${i}.active`, c, { shouldDirty: true })}
                  />
                  <button
                    type="button"
                    aria-label="Удалить размер"
                    disabled={locked}
                    title={locked ? 'В заказах — только деактивация' : undefined}
                    onClick={() => remove(i)}
                    className="text-admin-on-surface-variant hover:text-admin-error disabled:opacity-30"
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function BulkInput({ label, onApply }: { label: string; onApply: (v: number) => void }) {
  const [v, setV] = React.useState('');
  return (
    <div className="flex items-center gap-1">
      <Input className="w-28" type="number" placeholder={label} value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="button" variant="outline" size="sm" onClick={() => onApply(Number(v) || 0)}>OK</Button>
    </div>
  );
}
