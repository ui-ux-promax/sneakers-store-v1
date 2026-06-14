'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/admin/ui/dialog';
import { changeUserRole } from '@/app/actions/admin/customers';

export function RoleToggle({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const target: UserRole = currentRole === 'ADMIN' ? 'CUSTOMER' : 'ADMIN';
  const promoting = target === 'ADMIN';

  async function handleConfirm() {
    setBusy(true);
    const res = await changeUserRole({ userId, role: target });
    setBusy(false);
    setConfirm(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div>
      <Button
        variant={promoting ? 'primary' : 'outline'}
        className="w-full"
        onClick={() => setConfirm(true)}
        disabled={busy}
      >
        <Icon name={promoting ? 'shield_person' : 'person_remove'} className="text-[18px]" />
        {promoting ? 'Назначить администратором' : 'Снять роль администратора'}
      </Button>

      {/* Подтверждение */}
      <Dialog open={confirm} onOpenChange={(open) => !open && setConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promoting ? 'Назначить администратором?' : 'Снять роль администратора?'}</DialogTitle>
            <DialogDescription>
              {promoting
                ? 'Пользователь получит полный доступ к админ-панели.'
                : 'Пользователь потеряет доступ к админ-панели и станет обычным клиентом.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>
              Назад
            </Button>
            <Button variant={promoting ? 'primary' : 'danger'} onClick={handleConfirm} loading={busy}>
              {promoting ? 'Назначить' : 'Снять роль'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ошибка (в т.ч. текст guard: «себя» / «последнего администратора»). */}
      <Dialog open={error !== null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Не удалось изменить роль</DialogTitle>
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
