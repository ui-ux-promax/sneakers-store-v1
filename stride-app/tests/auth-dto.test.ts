import { describe, it, expect } from 'vitest';
import { registerFormSchema, verifyCodeSchema } from '@/services/dto/auth.dto';

const base = { name: 'Neo', email: 'a@b.com', password: 'secret123', confirmPassword: 'secret123', agree: true };

describe('registerFormSchema (клиентская форма регистрации)', () => {
  it('валидные данные проходят', () => {
    expect(registerFormSchema.safeParse(base).success).toBe(true);
  });

  it('пароли не совпадают — ошибка на поле confirmPassword', () => {
    const r = registerFormSchema.safeParse({ ...base, confirmPassword: 'different' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(issue?.message).toBe('Пароли не совпадают');
    }
  });

  it('согласие не отмечено (agree=false) — ошибка', () => {
    expect(registerFormSchema.safeParse({ ...base, agree: false }).success).toBe(false);
  });

  it('короткий пароль — ошибка (наследует правила registerSchema)', () => {
    expect(registerFormSchema.safeParse({ ...base, password: '123', confirmPassword: '123' }).success).toBe(false);
  });
});

describe('verifyCodeSchema', () => {
  it('6 цифр — ок', () => {
    expect(verifyCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });
  it('меньше 6 / буквы — ошибка', () => {
    expect(verifyCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});
