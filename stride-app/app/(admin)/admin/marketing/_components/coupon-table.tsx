'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { Switch } from '@/components/admin/ui/switch';
import { AlertModal } from '@/components/admin/ui/alert-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/admin/ui/dialog';
import type { CouponStatus } from '@/lib/coupon-status';
import { deleteCoupon, toggleCoupon } from '@/app/actions/admin/coupons';

export interface CouponRow {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  status: CouponStatus;
  expiresLabel: string;
  createdLabel: string;
}

const STATUS_META: Record<CouponStatus, { label: string; cls: string }> = {
  active: { label: 'Активен', cls: 'bg-admin-primary text-admin-on-primary' },
  inactive: { label: 'Выключен', cls: 'bg-admin-surface-high text-admin-on-surface-variant' },
  expired: { label: 'Истёк', cls: 'bg-admin-error/15 text-admin-error' },
};

export function CouponTable({ rows }: { rows: CouponRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<CouponRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [blockMsg, setBlockMsg] = React.useState<string | null>(null);

  async function handleToggle(row: CouponRow, next: boolean) {
    setPending(row.id);
    const res = await toggleCoupon(row.id, next);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
    setPending(null);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deleteCoupon(toDelete.id);
    setDeleting(false);
    setToDelete(null);
    if (!res.ok) setBlockMsg(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
        <div className="hidden md:block">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Скидка</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Активен</TableHead>
              <TableHead>Действует до</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium font-mono">{row.code}</TableCell>
                <TableCell>{row.percent}%</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold w-fit inline-block ${STATUS_META[row.status].cls}`}>
                    {STATUS_META[row.status].label}
                  </span>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.active}
                    disabled={pending === row.id}
                    onCheckedChange={(v) => handleToggle(row, v)}
                  />
                </TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.expiresLabel}</TableCell>
                <TableCell className="text-admin-on-surface-variant">{row.createdLabel}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/marketing/${row.id}/edit`}>Изменить</Link>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setToDelete(row)}>
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>

        <div className="md:hidden divide-y divide-admin-outline-variant">
          {rows.map((row) => (
            <div key={row.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono font-medium text-admin-on-surface">{row.code}</span>
                  <div className="text-sm text-admin-on-surface-variant tabular-nums">{row.percent}% скидка</div>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold w-fit ${STATUS_META[row.status].cls}`}>
                  {STATUS_META[row.status].label}
                </span>
              </div>

              <div className="text-xs text-admin-on-surface-variant tabular-nums space-y-0.5">
                <div>Действует до: {row.expiresLabel}</div>
                <div>Создан: {row.createdLabel}</div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-admin-on-surface-variant">
                  <Switch
                    checked={row.active}
                    disabled={pending === row.id}
                    onCheckedChange={(v) => handleToggle(row, v)}
                  />
                  Активен
                </label>
                <div className="flex gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/marketing/${row.id}/edit`}>Изменить</Link>
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setToDelete(row)}>
                    Удалить
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AlertModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Удалить купон?"
        description={toDelete ? `«${toDelete.code}» будет удалён безвозвратно.` : undefined}
      />

      <Dialog open={blockMsg !== null} onOpenChange={(open) => !open && setBlockMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Не удалось</DialogTitle>
            <DialogDescription>{blockMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setBlockMsg(null)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
