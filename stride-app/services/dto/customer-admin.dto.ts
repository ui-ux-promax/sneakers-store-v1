import { z } from 'zod';

// Передаём ЦЕЛЕВУЮ роль (не «toggle») — action сверит её с текущей и применит guarded-переход,
// что устраняет гонку «состояние на клиенте устарело».
export const roleChangeSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['ADMIN', 'CUSTOMER']),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;
