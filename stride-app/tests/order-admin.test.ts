import { describe, it, expect } from 'vitest';
import {
  nextOrderStatus,
  canCancelOrder,
  FORWARD_ACTION_LABEL,
  PAYMENT_STATUS_META,
  paymentStatusView,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
} from '@/lib/order-admin';

describe('order-admin transitions', () => {
  it('nextOrderStatus follows the pipeline', () => {
    expect(nextOrderStatus('PENDING')).toBe('PROCESSING');
    expect(nextOrderStatus('PROCESSING')).toBe('SHIPPED');
    expect(nextOrderStatus('SHIPPED')).toBe('DELIVERED');
    expect(nextOrderStatus('DELIVERED')).toBeNull();
    expect(nextOrderStatus('CANCELLED')).toBeNull();
  });

  it('canCancelOrder only for pre-shipment statuses', () => {
    expect(canCancelOrder('PENDING')).toBe(true);
    expect(canCancelOrder('PROCESSING')).toBe(true);
    expect(canCancelOrder('SHIPPED')).toBe(false);
    expect(canCancelOrder('DELIVERED')).toBe(false);
    expect(canCancelOrder('CANCELLED')).toBe(false);
  });

  it('forward labels are keyed by current status', () => {
    expect(FORWARD_ACTION_LABEL.PENDING).toMatch(/обработ/i);
    expect(FORWARD_ACTION_LABEL.PROCESSING).toMatch(/отгру/i);
    expect(FORWARD_ACTION_LABEL.SHIPPED).toMatch(/достав/i);
    expect(FORWARD_ACTION_LABEL.DELIVERED).toBe('');
    expect(FORWARD_ACTION_LABEL.CANCELLED).toBe('');
  });

  it('payment meta maps known statuses', () => {
    expect(PAYMENT_STATUS_META.succeeded.label).toMatch(/оплач/i);
    expect(PAYMENT_STATUS_META.pending.label).toMatch(/ожида/i);
    expect(PAYMENT_STATUS_META.canceled.label).toMatch(/отмен/i);
  });

  it('paymentStatusView falls back for null/unknown', () => {
    expect(paymentStatusView(null).label).toMatch(/без оплаты/i);
    expect(paymentStatusView(undefined).label).toMatch(/без оплаты/i);
    expect(paymentStatusView('succeeded').label).toMatch(/оплач/i);
    expect(paymentStatusView('weird').label).toBe('weird');
  });

  it('value tuples expose all enum members', () => {
    expect(ORDER_STATUS_VALUES).toContain('DELIVERED');
    expect(ORDER_STATUS_VALUES).toHaveLength(5);
    expect(PAYMENT_STATUS_VALUES).toEqual(['pending', 'succeeded', 'canceled']);
  });
});
