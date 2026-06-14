'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/admin/ui/dialog';
import { nextOrderStatus, canCancelOrder, FORWARD_ACTION_LABEL } from '@/lib/order-admin';
import { advanceOrderStatus, cancelOrderByAdmin } from '@/app/actions/admin/orders';

export function OrderStatusActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const forward = nextOrderStatus(status);
  const cancellable = canCancelOrder(status);

  async function handleForward() {
    if (!forward) return;
    setBusy(true);
    const res = await advanceOrderStatus({ orderId, toStatus: forward });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function handleCancel() {
    setBusy(true);
    const res = await cancelOrderByAdmin(orderId);
    setBusy(false);
    setConfirmCancel(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  if (!forward && !cancellable) {
    return (
      <p className="text-sm text-admin-on-surface-variant">
        {status === 'CANCELLED' ? 'Заказ отменён.' : 'Заказ завершён.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {forward && (
        <Button onClick={handleForward} loading={busy}>
          <Icon name="arrow_forward" className="text-[18px]" /> {FORWARD_ACTION_LABEL[status]}
        </Button>
      )}
      {cancellable && (
        <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={busy}>
          <Icon name="cancel" className="text-[18px]" /> Отменить заказ
        </Button>
      )}

      {/* Подтверждение отмены (своё, т.к. AlertModal хардкодит «Удалить»). */}
      <Dialog open={confirmCancel} onOpenChange={(open) => !open && setConfirmCancel(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить заказ?</DialogTitle>
            <DialogDescription>
              Сток вернётся на склад, популярность товаров скорректируется. Если заказ был оплачен онлайн —
              верните деньги вручную в кабинете ЮKassa (автоматический рефанд не выполняется).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy}>
              Назад
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={busy}>
              Отменить заказ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ошибка действия. */}
      <Dialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Не удалось выполнить</DialogTitle>
            <DialogDescription>{error}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setError(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
