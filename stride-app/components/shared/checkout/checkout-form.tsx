'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { calcShipping } from '@/lib/order';
import { FREE_SHIPPING_THRESHOLD } from '@/constants/config';
import { checkoutSchema, type CheckoutValues } from '@/services/dto/order.dto';
import { placeOrder } from '@/app/actions/order';
import { validateCoupon } from '@/app/actions/coupon';
import { AddressSuggest } from './address-suggest';
import type { CartDetails } from '@/services/dto/cart.dto';

type Defaults = { contactName: string; contactPhone: string; contactEmail: string };

export function CheckoutForm({ details, defaults }: { details: CartDetails; defaults: Defaults }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; percent: number; discount: number } | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, setCouponPending] = useState(false);
  const methods = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { ...defaults, shippingMethod: 'courier', paymentMethod: 'online', city: '', addressLine: '', addressComment: '' },
  });
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = methods;

  const shippingMethod = watch('shippingMethod');
  const shipping = calcShipping(details.totalAmount, shippingMethod);
  const discount = coupon?.discount ?? 0;
  const total = details.totalAmount - discount + shipping;

  const applyCoupon = async () => {
    setCouponError(null);
    setCouponPending(true);
    const res = await validateCoupon(couponInput);
    setCouponPending(false);
    if (!res.ok) { setCoupon(null); setValue('couponCode', ''); setCouponError(res.error); return; }
    setCoupon({ code: res.code, percent: res.percent, discount: res.discount });
    setValue('couponCode', res.code);
  };
  const removeCoupon = () => { setCoupon(null); setCouponInput(''); setValue('couponCode', ''); setCouponError(null); };

  const onSubmit = async (v: CheckoutValues) => {
    setError(null);
    const res = await placeOrder(v);
    if (!res.ok) { setError(res.error); return; }
    if (res.paymentUrl) { window.location.href = res.paymentUrl; return; }
    router.push(`/orders/${res.orderNumber}`);
    router.refresh();
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8" noValidate>
      <input type="hidden" {...register('couponCode')} />
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-display font-bold text-xl">Контактные данные</h2>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactName">Имя</label>
            <Input id="contactName" autoComplete="name" {...register('contactName')} />
            {errors.contactName && <p className="text-danger text-xs mt-1">{errors.contactName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactPhone">Телефон</label>
            <Input id="contactPhone" type="tel" autoComplete="tel" placeholder="+7…" {...register('contactPhone')} />
            {errors.contactPhone && <p className="text-danger text-xs mt-1">{errors.contactPhone.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="contactEmail">E-mail</label>
            <Input id="contactEmail" type="email" autoComplete="email" {...register('contactEmail')} />
            {errors.contactEmail && <p className="text-danger text-xs mt-1">{errors.contactEmail.message}</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          <h2 className="font-display font-bold text-xl">Адрес доставки</h2>
          <div className="relative">
            <label className="block text-sm font-medium mb-1" htmlFor="addressLine">Адрес</label>
            <Input id="addressLine" autoComplete="off" placeholder="Город, улица, дом, квартира" {...register('addressLine')} />
            <AddressSuggest />
            {errors.addressLine && <p className="text-danger text-xs mt-1">{errors.addressLine.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="addressComment">Комментарий к адресу</label>
            <textarea id="addressComment" className="inp min-h-20" {...register('addressComment')} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display font-bold text-xl">Способ доставки</h2>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="courier" {...register('shippingMethod')} />
            <span className="flex-1"><span className="font-semibold">Курьер</span><br /><span className="text-xs text-ink-muted">Бесплатно от {formatPrice(FREE_SHIPPING_THRESHOLD)} · 1–3 дня</span></span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="pickup" {...register('shippingMethod')} />
            <span className="flex-1"><span className="font-semibold">Самовывоз</span><br /><span className="text-xs text-ink-muted">Из пункта выдачи · бесплатно</span></span>
          </label>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display font-bold text-xl">Способ оплаты</h2>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="online" {...register('paymentMethod')} />
            <span className="flex-1"><span className="font-semibold">Картой онлайн</span><br /><span className="text-xs text-ink-muted">Visa, MasterCard, МИР</span></span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3 cursor-pointer">
            <input type="radio" value="cod" {...register('paymentMethod')} />
            <span className="flex-1"><span className="font-semibold">При получении</span><br /><span className="text-xs text-ink-muted">Наличными или картой курьеру</span></span>
          </label>
        </section>
      </div>

      <aside>
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4 lg:sticky lg:top-24">
          <h2 className="font-display font-bold text-xl">Ваш заказ</h2>
          {/* Промокод */}
          <div className="space-y-2">
            {!coupon ? (
              <>
                <div className="flex gap-2">
                  <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Промокод" />
                  <Button type="button" variant="secondary" size="md" className="shrink-0" loading={couponPending} onClick={applyCoupon}>Применить</Button>
                </div>
                {couponError && <p className="text-danger text-xs" role="alert">{couponError}</p>}
              </>
            ) : (
              <div className="flex justify-between items-center text-sm">
                <span className="text-success font-semibold">Промокод {coupon.code} ({coupon.percent}%)</span>
                <button type="button" onClick={removeCoupon} className="text-ink-muted hover:text-ink" aria-label="Убрать промокод">×</button>
              </div>
            )}
          </div>
          <ul className="space-y-3">
            {details.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 text-sm">
                <span className="text-ink-muted">{it.name} · {it.sizeEu} · {it.quantity} шт.</span>
                <span className="font-semibold tnum shrink-0">{formatPrice(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 text-sm border-t border-line pt-4">
            <div className="flex justify-between"><span className="text-ink-muted">Товары</span><span className="font-semibold tnum">{formatPrice(details.totalAmount)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between"><span className="text-ink-muted">Скидка</span><span className="font-semibold text-success tnum">−{formatPrice(discount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-ink-muted">Доставка</span><span className="font-semibold tnum">{shipping === 0 ? 'Бесплатно' : formatPrice(shipping)}</span></div>
          </div>
          <div className="flex justify-between items-baseline border-t border-line pt-4">
            <span className="text-lg font-semibold">Итого</span>
            <span className="font-display font-bold text-2xl tnum">{formatPrice(total)}</span>
          </div>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Оформить заказ →</Button>
        </div>
      </aside>
      </form>
    </FormProvider>
  );
}
