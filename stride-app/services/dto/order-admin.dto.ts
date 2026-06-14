import { z } from 'zod';

// Forward-переходы: цель — только следующий шаг пайплайна. CANCELLED идёт отдельным action,
// PENDING никогда не таргет (назад не откатываем). orderId — cuid строкой.
export const orderStatusUpdateSchema = z.object({
  orderId: z.string().min(1),
  toStatus: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
});

export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
