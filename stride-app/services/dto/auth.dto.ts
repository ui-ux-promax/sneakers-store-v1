import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(72, 'Слишком длинный'),
  name: z.string().trim().min(1).max(80).optional(),
});
export type RegisterValues = z.infer<typeof registerSchema>;

// Клиентская схема формы регистрации: поверх серверной registerSchema добавляет подтверждение
// пароля и обязательное согласие. На сервер (registerUser) уходят только поля registerSchema.
export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string(),
    agree: z.literal(true, { errorMap: () => ({ message: 'Необходимо согласие с условиями' }) }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const profileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  birthdate: z.string().trim().optional(),
});
export type ProfileValues = z.infer<typeof profileSchema>;

// 6-значный код верификации почты (только цифры).
export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Код состоит из 6 цифр'),
});
export type VerifyCodeValues = z.infer<typeof verifyCodeSchema>;
