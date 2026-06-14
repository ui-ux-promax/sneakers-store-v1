import { z } from 'zod';

// code (нормализованный UPPERCASE): начинается с буквы/цифры, далее буквы/цифры/-/_.
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]*$/;

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Код от 3 символов')
    .max(32, 'Код до 32 символов')
    .regex(CODE_RE, 'Код: латиница в верхнем регистре, цифры, - и _'),
  percent: z.coerce.number().int('Процент — целое число').min(1, 'От 1%').max(100, 'До 100%'),
  active: z.boolean().default(true), // вход всегда реальный boolean из RHF Switch
  expiresAt: z.string().trim().optional(), // '' → null в action; формат 'YYYY-MM-DD'
});

export type CouponValues = z.infer<typeof couponSchema>;
