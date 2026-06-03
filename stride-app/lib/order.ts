import type { CartWithItems } from '@/lib/cart-details';
import { calcLineTotal } from '@/lib/cart-details';
import { normalizeSize } from '@/lib/format';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FLAT } from '@/constants/config';

export type ShippingMethod = 'courier' | 'pickup';

export function calcShipping(itemsTotal: number, method: ShippingMethod): number {
  if (method === 'pickup') return 0;
  return itemsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
}

export interface OrderItemSnapshot {
  productVariantId: string;
  sku: string;
  productName: string;
  colorwayName: string;
  sizeEu: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderSnapshot {
  items: OrderItemSnapshot[];
  itemsTotal: number;
}

export function buildOrderSnapshot(cart: CartWithItems): OrderSnapshot {
  const items: OrderItemSnapshot[] = cart.items.map((i) => {
    const v = i.productVariant;
    const unitPrice = v.price;
    return {
      productVariantId: v.id,
      sku: v.sku,
      productName: v.colorway.product.name,
      colorwayName: v.colorway.name,
      sizeEu: normalizeSize(v.sizeEu),
      imageUrl: v.colorway.images[0]?.url ?? null,
      unitPrice,
      quantity: i.quantity,
      lineTotal: calcLineTotal(unitPrice, i.quantity),
    };
  });
  const itemsTotal = items.reduce((acc, it) => acc + it.lineTotal, 0);
  return { items, itemsTotal };
}

export const ORDER_STATUS_META: Record<
  'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
  { label: string; badge: string }
> = {
  PENDING: { label: 'Оформлен', badge: 'badge-info' },
  PROCESSING: { label: 'Обрабатывается', badge: 'badge-warning' },
  SHIPPED: { label: 'В пути', badge: 'badge-info' },
  DELIVERED: { label: 'Доставлен', badge: 'badge-success' },
  CANCELLED: { label: 'Отменён', badge: 'badge-danger' },
};
