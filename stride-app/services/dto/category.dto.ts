import { z } from 'zod';

// slug: латиница/цифры, дефис только между сегментами (без ведущих/конечных/двойных).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(100, 'Название до 100 символов'),
  slug: z
    .string()
    .trim()
    .min(1, 'Укажите slug')
    .max(100, 'Slug до 100 символов')
    .regex(SLUG_RE, 'Slug: только латиница, цифры и дефис'),
  tagline: z.string().trim().max(200, 'Подпись до 200 символов').optional(),
  coverImage: z.string().url('Некорректный URL обложки').optional(),
  coverImagePublicId: z.string().optional(),
});

export type CategoryValues = z.infer<typeof categorySchema>;
