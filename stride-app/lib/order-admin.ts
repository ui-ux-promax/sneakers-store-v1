import type { OrderStatus } from '@prisma/client';

// Управляемый пайплайн: следующий статус «вперёд». Терминальные → null.
const ORDER_FLOW: Record<OrderStatus, OrderStatus | null> = {
  PENDING: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
  DELIVERED: null,
  CANCELLED: null,
};

export function nextOrderStatus(s: OrderStatus): OrderStatus | null {
  return ORDER_FLOW[s];
}

// Отмена с возвратом стока разрешена только до отгрузки (сток списан при оформлении).
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['PENDING', 'PROCESSING']);

export function canCancelOrder(s: OrderStatus): boolean {
  return CANCELLABLE.has(s);
}

// Текст кнопки «вперёд»; ключ — ТЕКУЩИЙ статус заказа.
export const FORWARD_ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Взять в обработку',
  PROCESSING: 'Отметить отгруженным',
  SHIPPED: 'Отметить доставленным',
  DELIVERED: '',
  CANCELLED: '',
};

// Бейдж/лейбл статуса платежа. Payment.status — сырая строка ('pending'|'succeeded'|'canceled').
export const PAYMENT_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Ожидает оплаты', badge: 'badge badge-warning' },
  succeeded: { label: 'Оплачен', badge: 'badge badge-success' },
  canceled: { label: 'Отменён', badge: 'badge badge-danger' },
};

// Безопасный вид статуса платежа: null/COD → «Без оплаты», неизвестное значение → как есть.
export function paymentStatusView(status?: string | null): { label: string; badge: string } {
  if (!status) return { label: 'Без оплаты', badge: 'badge badge-info' };
  return PAYMENT_STATUS_META[status] ?? { label: status, badge: 'badge badge-info' };
}

// Кортежи для readEnumParam (валидация значений URL-фильтров).
export const ORDER_STATUS_VALUES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const satisfies readonly OrderStatus[];

export const PAYMENT_STATUS_VALUES = ['pending', 'succeeded', 'canceled'] as const;
