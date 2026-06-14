'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Switch } from '@/components/admin/ui/switch';
import { couponSchema, type CouponValues } from '@/services/dto/coupon-admin.dto';
import { normalizeCouponCode } from '@/lib/coupon';
import { createCoupon, updateCoupon } from '@/app/actions/admin/coupons';

export interface CouponFormInitial {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  expiresAt: string | null; // ISO; срезаем до YYYY-MM-DD для <input type="date">
}

export function CouponForm({ initial }: { initial?: CouponFormInitial }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: initial?.code ?? '',
      percent: initial?.percent ?? 10,
      active: initial?.active ?? true,
      expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '',
    },
  });

  const active = watch('active');

  async function onSubmit(values: CouponValues) {
    setServerError(null);
    const res = initial ? await updateCoupon(initial.id, values) : await createCoupon(values);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.push('/admin/marketing');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Код</label>
        <Input
          {...register('code', {
            onBlur: (e) => setValue('code', normalizeCouponCode(e.target.value)),
          })}
          placeholder="STRIDE10"
          autoCapitalize="characters"
        />
        {errors.code && <p className="text-sm text-admin-error">{errors.code.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Скидка, %</label>
        <Input type="number" min={1} max={100} {...register('percent')} placeholder="10" />
        {errors.percent && <p className="text-sm text-admin-error">{errors.percent.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-admin-on-surface">Действует до</label>
        <Input type="date" {...register('expiresAt')} />
        <p className="text-xs text-admin-on-surface-variant">Пусто — бессрочный.</p>
        {errors.expiresAt && <p className="text-sm text-admin-error">{errors.expiresAt.message}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={active} onCheckedChange={(v) => setValue('active', v)} />
        <span className="text-sm font-medium text-admin-on-surface">Активен</span>
      </div>

      {serverError && <p className="text-sm text-admin-error">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/marketing')}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
