import { describe, it, expect } from 'vitest';
import { couponStatus } from '@/lib/coupon-status';

const NOW = new Date('2026-06-14T12:00:00.000Z');
const PAST = new Date('2020-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T23:59:59.999Z');

describe('couponStatus', () => {
  it('active: active + no expiry', () => {
    expect(couponStatus({ active: true, expiresAt: null }, NOW)).toBe('active');
  });
  it('active: active + future expiry', () => {
    expect(couponStatus({ active: true, expiresAt: FUTURE }, NOW)).toBe('active');
  });
  it('inactive: not active + no expiry', () => {
    expect(couponStatus({ active: false, expiresAt: null }, NOW)).toBe('inactive');
  });
  it('expired: past expiry overrides active', () => {
    expect(couponStatus({ active: true, expiresAt: PAST }, NOW)).toBe('expired');
  });
  it('expired: past expiry overrides inactive', () => {
    expect(couponStatus({ active: false, expiresAt: PAST }, NOW)).toBe('expired');
  });
  it('boundary: expiresAt exactly now is NOT expired', () => {
    expect(couponStatus({ active: true, expiresAt: new Date(NOW) }, NOW)).toBe('active');
  });
});
