import { z } from 'zod';

export const checkoutSchema = z.object({
  contactName: z.string().trim().min(1, 'Укажите имя').max(80),
  contactPhone: z.string().trim().min(5, 'Укажите телефон').max(20),
  contactEmail: z.string().trim().email('Некорректный email'),
  shippingMethod: z.enum(['courier', 'pickup']),
  city: z.string().trim().max(100).optional(),
  addressLine: z.string().trim().min(1, 'Укажите адрес').max(200),
  addressComment: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(['cod', 'online']),
  couponCode: z.string().trim().max(40).optional(),
});
export type CheckoutValues = z.infer<typeof checkoutSchema>;
