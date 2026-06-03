'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { cancelOrder } from '@/app/actions/order';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async () => {
    if (!window.confirm('Отменить заказ? Это действие необратимо.')) return;
    setBusy(true);
    setError(null);
    const res = await cancelOrder(orderId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <Button variant="danger" size="md" onClick={onCancel} loading={busy}>Отменить заказ</Button>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
    </div>
  );
}
