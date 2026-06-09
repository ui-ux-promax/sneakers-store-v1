import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';
import { salesDeltaByProduct } from '@/lib/product-aggregates';

// Двигает денормализованный Product.salesCount (популярность каталога). Один update на товар
// (агрегируем quantity по productId). sign=+1 при оформлении заказа, sign=-1 при отмене —
// симметрично стоку. Best-effort: сбой логируется, но НЕ пробрасывается (популярность ≠
// деньги/сток; заказ уже создан/отменён, ломать его из-за счётчика нельзя).
export async function adjustSalesCount(
  items: { productId: string; quantity: number }[],
  sign: 1 | -1,
): Promise<void> {
  const delta = salesDeltaByProduct(items);
  for (const [productId, qty] of delta) {
    try {
      await prisma.product.update({
        where: { id: productId },
        data: { salesCount: { increment: sign * qty } },
      });
    } catch (e) {
      logger.error('sales_count_adjust_failed', e, { productId, sign });
    }
  }
}
