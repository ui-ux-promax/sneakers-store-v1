import { describe, it, expect } from 'vitest';
import { newsletterSchema } from '@/services/dto/newsletter.dto';

describe('newsletterSchema', () => {
  it('валидный email — ок', () => {
    expect(newsletterSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('невалидный email — ошибка', () => {
    expect(newsletterSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
  it('source опционален', () => {
    const r = newsletterSchema.safeParse({ email: 'a@b.com', source: 'footer' });
    expect(r.success).toBe(true);
  });
});
