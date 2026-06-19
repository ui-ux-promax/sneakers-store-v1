'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/admin/ui/select';
import { slugify } from '@/lib/slugify';
import { productSchema, type ProductValues, GENDER_VALUES } from '@/services/dto/product.dto';
import { createProduct, updateProduct } from '@/app/actions/admin/products';
import { ColorwayCard } from './colorway-card';
import { SpecsEditor } from './specs-editor';

export interface ProductFormInitial extends ProductValues {
  id: string;
}

const GENDER_LABELS: Record<(typeof GENDER_VALUES)[number], string> = {
  MEN: 'Мужские', WOMEN: 'Женские', UNISEX: 'Унисекс', KIDS: 'Детские',
};

const EMPTY: ProductValues = {
  name: '', slug: '', brand: '', gender: 'UNISEX', categoryId: '',
  description: '', fitNote: '', specs: [], isBestseller: false, active: false, sortOrder: 0, colorways: [],
};
const VALIDATION_ERROR = 'Проверьте поля товара, расцветок, изображений и размеров';

export function ProductForm({
  initial,
  categories,
  brands,
  referencedVariantIds = [],
}: {
  initial?: ProductFormInitial;
  categories: { id: string; name: string }[];
  brands: string[];
  referencedVariantIds?: string[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const slugDirty = React.useRef(Boolean(initial));
  const refSet = React.useMemo(() => new Set(referencedVariantIds), [referencedVariantIds]);

  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? EMPTY,
  });
  const { register, handleSubmit, control, setValue, getValues, watch, formState: { errors, isSubmitting } } = form;
  // RHF: специфичный Control<ProductValues> не присваивается пропу Control<any> детей — каст на границе.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyControl = control as unknown as Control<any>;

  const colorways = useFieldArray({ control, name: 'colorways', keyName: 'key' });
  const watchedColorways = watch('colorways');

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugDirty.current) setValue('slug', slugify(e.target.value));
  }

  function makeDefault(index: number) {
    const cws = getValues('colorways');
    cws.forEach((_, i) => setValue(`colorways.${i}.isDefault`, i === index));
  }

  function addColorway() {
    const isFirst = getValues('colorways').length === 0;
    colorways.append({ name: '', slug: '', swatchHex: undefined, isDefault: isFirst, images: [], variants: [] });
  }

  async function onSubmit(values: ProductValues) {
    setServerError(null);
    const res = initial ? await updateProduct(initial.id, values) : await createProduct(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/catalog/products');
  }

  function onInvalid() {
    setServerError(VALIDATION_ERROR);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8 max-w-4xl">
      {/* Скаляры */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Название" error={errors.name?.message}>
          <Input {...register('name', { onChange: onNameChange })} placeholder="Air Max 90" />
        </Field>
        <Field label="Slug" error={errors.slug?.message}>
          <Input {...register('slug', { onChange: () => { slugDirty.current = true; } })} placeholder="air-max-90" />
        </Field>
        <Field label="Бренд" error={errors.brand?.message}>
          <Input list="brand-list" {...register('brand')} placeholder="Nike" />
          <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Пол" error={errors.gender?.message}>
          <Select value={watch('gender')} onValueChange={(v) => setValue('gender', v as ProductValues['gender'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENDER_VALUES.map((g) => <SelectItem key={g} value={g}>{GENDER_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Категория" error={errors.categoryId?.message}>
          <Select value={watch('categoryId')} onValueChange={(v) => setValue('categoryId', v)}>
            <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Порядок (sortOrder)" error={errors.sortOrder?.message}>
          <Input type="number" {...register('sortOrder', { valueAsNumber: true })} />
        </Field>
      </div>

      <Field label="Описание" error={errors.description?.message}>
        <textarea {...register('description')} rows={4} className="w-full rounded-lg border border-admin-outline-variant bg-admin-surface px-3 py-2 text-sm" />
      </Field>
      <Field label="Примечание по посадке" error={errors.fitNote?.message}>
        <Input {...register('fitNote')} placeholder="Маломерит на полразмера" />
      </Field>

      <div className="space-y-2">
        <label className="text-sm font-medium text-admin-on-surface">Характеристики</label>
        <SpecsEditor control={anyControl} register={register} />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch('isBestseller')} onCheckedChange={(c) => setValue('isBestseller', c)} /> Хит продаж
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch('active')} onCheckedChange={(c) => setValue('active', c)} /> Активен (виден на витрине)
        </label>
      </div>

      {/* Расцветки */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-admin-head text-lg text-admin-on-surface">Расцветки</h3>
          <Button type="button" variant="outline" size="sm" onClick={addColorway}>Добавить расцветку</Button>
        </div>
        {colorways.fields.map((f, ci) => (
          <ColorwayCard
            key={f.key}
            ci={ci}
            control={anyControl}
            register={register}
            setValue={setValue}
            getValues={getValues}
            isDefault={Boolean(watchedColorways?.[ci]?.isDefault)}
            onMakeDefault={() => makeDefault(ci)}
            onRemove={() => colorways.remove(ci)}
            removable={colorways.fields.length > 0}
            referencedVariantIds={refSet}
          />
        ))}
        {typeof errors.colorways?.message === 'string' && <p className="text-sm text-admin-error">{errors.colorways.message}</p>}
        {typeof errors.active?.message === 'string' && <p className="text-sm text-admin-error">{errors.active.message}</p>}
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>{initial ? 'Сохранить' : 'Создать'}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/catalog/products')}>Отмена</Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-admin-on-surface">{label}</label>
      {children}
      {error && <p className="text-sm text-admin-error">{error}</p>}
    </div>
  );
}
