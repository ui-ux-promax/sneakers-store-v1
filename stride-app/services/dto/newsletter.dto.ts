import { z } from 'zod';
import { NEWSLETTER_SOURCES } from '@/constants/config';

export const newsletterSchema = z.object({
  email: z.string().email('Некорректный email'),
  source: z.enum(NEWSLETTER_SOURCES).optional(),
});
export type NewsletterValues = z.infer<typeof newsletterSchema>;
