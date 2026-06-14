'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { OrderStatus } from '@prisma/client';
import type { StatusSegment } from '@/lib/admin/analytics';

// Палитра donut по статусам — яркие тона, различимы в обеих темах.
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#3b82f6',
  PROCESSING: '#f59e0b',
  SHIPPED: '#8b5cf6',
  DELIVERED: '#b2f700',
  CANCELLED: '#ef4444',
};

export function StatusDonut({ segments, total }: { segments: StatusSegment[]; total: number }) {
  if (total === 0) {
    return <p className="text-sm text-admin-on-surface-variant">Заказов пока нет.</p>;
  }
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="count"
              nameKey="label"
              innerRadius={64}
              outerRadius={90}
              paddingAngle={2}
              strokeWidth={0}
            >
              {segments.map((s) => (
                <Cell key={s.status} fill={STATUS_COLOR[s.status]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-admin-head text-2xl font-bold text-admin-on-surface tabular-nums">{total}</span>
          <span className="text-xs text-admin-on-surface-variant">Всего</span>
        </div>
      </div>
      <div className="w-full space-y-2 mt-6">
        {segments.map((s) => (
          <div key={s.status} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLOR[s.status] }} />
              <span className="text-admin-on-surface-variant">{s.label}</span>
            </div>
            <span className="font-bold text-admin-on-surface tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
