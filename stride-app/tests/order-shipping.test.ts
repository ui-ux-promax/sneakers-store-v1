import { describe, it, expect } from 'vitest';
import { calcShipping, orderStatusView } from '@/lib/order';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT } from '@/constants/config';

describe('calcShipping', () => {
  it('самовывоз — всегда 0', () => {
    expect(calcShipping(0, 'pickup')).toBe(0);
    expect(calcShipping(FREE_SHIPPING_THRESHOLD + 1, 'pickup')).toBe(0);
  });
  it('курьер ниже порога — флэт-ставка', () => {
    expect(calcShipping(FREE_SHIPPING_THRESHOLD - 1, 'courier')).toBe(SHIPPING_FLAT);
    expect(calcShipping(0, 'courier')).toBe(SHIPPING_FLAT);
  });
  it('курьер на пороге и выше — бесплатно', () => {
    expect(calcShipping(FREE_SHIPPING_THRESHOLD, 'courier')).toBe(0);
    expect(calcShipping(FREE_SHIPPING_THRESHOLD + 1000, 'courier')).toBe(0);
  });
});

describe('orderStatusView', () => {
  it('PENDING + платёж pending → «Ожидает оплаты»', () => {
    expect(orderStatusView('PENDING', 'pending')).toEqual({ label: 'Ожидает оплаты', badge: 'badge badge-warning' });
  });
  it('PENDING без платежа (COD) → «Оформлен»', () => {
    expect(orderStatusView('PENDING', null).label).toBe('Оформлен');
    expect(orderStatusView('PENDING').label).toBe('Оформлен');
  });
  it('PENDING + платёж succeeded → «Оформлен» (не перехватываем)', () => {
    expect(orderStatusView('PENDING', 'succeeded').label).toBe('Оформлен');
  });
  it('прочие статусы — из меты', () => {
    expect(orderStatusView('PROCESSING', 'succeeded').label).toBe('Обрабатывается');
    expect(orderStatusView('CANCELLED', 'canceled').label).toBe('Отменён');
  });
});
