import { describe, it, expect } from 'vitest';
import { formatAddedAgo } from '@/lib/relative-time';

const now = new Date('2026-06-13T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 24 * 60 * 60 * 1000;

describe('formatAddedAgo', () => {
  it('today for <1 day', () => {
    expect(formatAddedAgo(ago(2 * 60 * 60 * 1000), now)).toBe('Добавлен сегодня');
  });
  it('yesterday for 1 day', () => {
    expect(formatAddedAgo(ago(1 * DAY), now)).toBe('Добавлен вчера');
  });
  it('days for <7', () => {
    expect(formatAddedAgo(ago(3 * DAY), now)).toBe('Добавлен 3 дн. назад');
  });
  it('weeks for <31', () => {
    expect(formatAddedAgo(ago(14 * DAY), now)).toBe('Добавлен 2 нед. назад');
  });
  it('months for <365', () => {
    expect(formatAddedAgo(ago(60 * DAY), now)).toBe('Добавлен 2 мес. назад');
  });
  it('years otherwise', () => {
    expect(formatAddedAgo(ago(400 * DAY), now)).toBe('Добавлен 1 г. назад');
  });
});
