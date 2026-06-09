import { describe, it, expect, beforeEach } from 'vitest';
import { issueTicket, verifyTicket } from '@/lib/verification/ticket';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-key';
});

describe('verified-login ticket', () => {
  it('issue → verify возвращает userId', () => {
    const t = issueTicket('user-123');
    expect(verifyTicket(t)).toEqual({ userId: 'user-123' });
  });

  it('подделанная подпись → null', () => {
    const t = issueTicket('user-123');
    const tampered = t.slice(0, -2) + (t.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyTicket(tampered)).toBeNull();
  });

  it('истёкший тикет → null', () => {
    const t = issueTicket('user-123', Date.now() - 1000);
    expect(verifyTicket(t)).toBeNull();
  });

  it('мусор → null, не бросает', () => {
    expect(verifyTicket('garbage')).toBeNull();
  });
});
