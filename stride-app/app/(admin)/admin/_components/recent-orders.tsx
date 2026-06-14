import Link from 'next/link';
import { formatPrice, formatDateTime } from '@/lib/format';
import { orderStatusView } from '@/lib/order';
import type { RecentOrderRow } from '@/lib/admin/analytics';

export function RecentOrders({ rows }: { rows: RecentOrderRow[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <div className="p-6 pb-3">
        <h3 className="font-admin-head text-lg font-bold text-admin-on-surface">Последние заказы</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-admin-on-surface-variant">Заказов нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-surface-high border-y border-admin-outline-variant">
              <tr>
                {['Заказ', 'Клиент', 'Статус', 'Сумма'].map((h) => (
                  <th key={h} className="px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-admin-on-surface-variant">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-outline-variant">
              {rows.map((row) => {
                const sv = orderStatusView(row.status, row.paymentStatus);
                return (
                  <tr key={row.id} className="hover:bg-admin-surface-high transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/admin/orders/${row.id}`} className="font-bold text-admin-on-surface hover:underline tabular-nums">
                        #{row.orderNumber}
                      </Link>
                      <div className="text-[11px] text-admin-on-surface-variant tabular-nums">{formatDateTime(row.createdAt)}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-admin-on-surface truncate max-w-[160px]">{row.contactName}</div>
                      {row.email && <div className="text-[11px] text-admin-on-surface-variant truncate max-w-[160px]">{row.email}</div>}
                    </td>
                    <td className="px-6 py-3"><span className={sv.badge}>{sv.label}</span></td>
                    <td className="px-6 py-3 font-bold text-admin-on-surface tabular-nums">{formatPrice(row.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
