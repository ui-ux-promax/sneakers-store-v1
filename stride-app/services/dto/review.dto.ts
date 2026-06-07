import { z } from 'zod';

export const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});
export type ReviewValues = z.infer<typeof reviewSchema>;
