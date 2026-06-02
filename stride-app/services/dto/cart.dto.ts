import { z } from 'zod';

export const createCartItemSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.number().int().positive().max(99).optional(),
});
export type CreateCartItemValues = z.infer<typeof createCartItemSchema>;

export const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(99),
});
export type UpdateQuantityValues = z.infer<typeof updateQuantitySchema>;

// Плоская позиция корзины для клиента (Zustand-стор).
export interface CartStateItem {
  id: string;
  quantity: number;
  name: string;
  productSlug: string;
  colorwayName: string;
  sizeEu: string;
  imageUrl: string | null;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  available: boolean;
  disabled?: boolean;
}

export interface CartDetails {
  items: CartStateItem[];
  totalAmount: number;
}
