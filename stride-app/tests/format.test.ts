import { describe, it, expect } from 'vitest';
import { formatPrice, normalizeSize, formatDateTime, formatDate } from '@/lib/format';

describe('formatPrice', () => {
  it('форматирует рубли с неразрывным пробелом-разделителем тысяч и знаком ₽', () => {
    expect(formatPrice(12990)).toBe('12 990 ₽');
    expect(formatPrice(0)).toBe('0 ₽');
    expect(formatPrice(1000000)).toBe('1 000 000 ₽');
  });
});

describe('formatDateTime', () => {
  it('абсолютная дата+время в МСК, формат дд.мм.гггг чч:мм', () => {
    // 10:01 UTC → 13:01 МСК (UTC+3).
    expect(formatDateTime(new Date('2026-06-14T10:01:00Z'))).toBe('14.06.2026 13:01');
  });
  it('фиксирует МСК независимо от смещения входной даты', () => {
    // 23:30 UTC 31 декабря → 02:30 МСК 1 января следующего года.
    expect(formatDateTime(new Date('2025-12-31T23:30:00Z'))).toBe('01.01.2026 02:30');
  });
});

describe('normalizeSize', () => {
  it('целые размеры — без дробной части', () => {
    expect(normalizeSize(42)).toBe('42');
    expect(normalizeSize('42.0')).toBe('42');
  });
  it('полуразмеры — с .5', () => {
    expect(normalizeSize(42.5)).toBe('42.5');
    expect(normalizeSize('42.50')).toBe('42.5');
  });
});

describe('formatDate', () => {
  it('renders date-only in MSK as dd.mm.yyyy', () => {
    // 2026-06-14T20:00:00Z → 14.06.2026 в МСК (UTC+3)
    expect(formatDate(new Date('2026-06-14T20:00:00.000Z'))).toBe('14.06.2026');
  });

  it('rolls to next day when UTC time crosses midnight MSK', () => {
    // 2026-06-14T22:30:00Z → 15.06.2026 в МСК
    expect(formatDate(new Date('2026-06-14T22:30:00.000Z'))).toBe('15.06.2026');
  });
});
