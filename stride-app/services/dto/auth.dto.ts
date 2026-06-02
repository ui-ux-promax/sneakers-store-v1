import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(72, 'Слишком длинный'),
  name: z.string().trim().min(1).max(80).optional(),
});
export type RegisterValues = z.infer<typeof registerSchema>;

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
