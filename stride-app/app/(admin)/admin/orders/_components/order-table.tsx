'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/admin/icon';
import { formatPrice } from '@/lib/format';
import { orderStatusView } from '@/lib/order';
import { paymentStatusView } from '@/lib/order-admin';

export interface OrderRow {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  paymentStatus: string | null;
  paymentMethod: string;
  contactName: string;
  contactEmail: string;
  itemCount: number;
  totalAmount: number;
  coverImage: string | null;
  addedAgo: string;
}

export interface OrderTableProps {
  rows: OrderRow[];
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

export function OrderTable({ rows, page, totalPages, total, limit }: OrderTableProps) {
  const router = useRouter();
  const params = useSearchParams();

  function goPage(n: number) {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(n));
    router.push(`/admin/orders?${next.toString()}`);
  }

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-admin-surface-high">
            <tr>
              {['Заказ', 'Покупатель', 'Позиции', 'Сумма', 'Оплата', 'Статус'].map((h) => (
                <th key={h} className="px-6 py-4 text-[12px] font-semibold uppercase tracking-widest text-admin-on-surface-variant">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-outline-variant">
            {rows.map((row) => {
              const sv = orderStatusView(row.status, row.paymentStatus);
              const pv = paymentStatusView(row.paymentStatus);
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/admin/orders/${row.id}`)}
                  className="group hover:bg-admin-surface-high transition-colors cursor-pointer"
                >
                  {/* Заказ */}
                  <td className="px-6 py-4">
                    <a
                      href={`/admin/orders/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-admin-on-surface hover:underline tabular-nums"
                    >
                      #{row.orderNumber}
                    </a>
                    <div className="text-xs text-admin-on-surface-variant">{row.addedAgo}</div>
                  </td>
                  {/* Покупатель */}
                  <td className="px-6 py-4">
                    <div className="font-medium text-admin-on-surface truncate max-w-[200px]">{row.contactName}</div>
                    <div className="text-xs text-admin-on-surface-variant truncate max-w-[200px]">{row.contactEmail}</div>
                  </td>
                  {/* Позиции */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-admin-surface-high border border-admin-outline-variant p-1 overflow-hidden flex items-center justify-center shrink-0">
                        {row.coverImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
                          <img src={row.coverImage} alt="" className="object-contain w-full h-full" />
                        ) : (
                          <Icon name="image" className="text-admin-on-surface-variant" />
                        )}
                      </div>
                      <span className="text-admin-on-surface-variant text-sm tabular-nums">{row.itemCount} шт.</span>
                    </div>
                  </td>
                  {/* Сумма */}
                  <td className="px-6 py-4 font-bold text-admin-on-surface tabular-nums">{formatPrice(row.totalAmount)}</td>
                  {/* Оплата */}
                  <td className="px-6 py-4">
                    <span className={pv.badge}>{pv.label}</span>
                    <div className="text-[11px] text-admin-on-surface-variant mt-1 uppercase tracking-wider">
                      {row.paymentMethod === 'online' ? 'Онлайн' : 'При получении'}
                    </div>
                  </td>
                  {/* Статус */}
                  <td className="px-6 py-4">
                    <span className={sv.badge}>{sv.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      <div className="px-6 py-4 border-t border-admin-outline-variant flex items-center justify-between">
        <p className="text-xs text-admin-on-surface-variant">
          Показано {from}–{to} из {total}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <PagerBtn disabled={page <= 1} onClick={() => goPage(page - 1)} icon="chevron_left" />
            {pageItems(page, totalPages).map((it, i) =>
              it === '…' ? (
                <span key={`e${i}`} className="text-admin-on-surface-variant mx-1">…</span>
              ) : (
                <button
                  key={it}
                  type="button"
                  onClick={() => goPage(it)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg font-bold transition-colors',
                    it === page
                      ? 'bg-admin-primary text-admin-on-primary'
                      : 'text-admin-on-surface-variant hover:bg-admin-surface-high',
                  )}
                >
                  {it}
                </button>
              ),
            )}
            <PagerBtn disabled={page >= totalPages} onClick={() => goPage(page + 1)} icon="chevron_right" />
          </div>
        )}
      </div>
    </div>
  );
}

function PagerBtn({ disabled, onClick, icon }: { disabled: boolean; onClick: () => void; icon: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-admin-outline-variant text-admin-on-surface-variant hover:bg-admin-surface-high transition-colors disabled:opacity-30"
    >
      <Icon name={icon} />
    </button>
  );
}

// 1 … c-1 c c+1 … last
function pageItems(current: number, totalPages: number): (number | '…')[] {
  const set = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}
