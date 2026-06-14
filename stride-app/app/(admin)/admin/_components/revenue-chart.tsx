'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPrice } from '@/lib/format';

export function RevenueChart({ data }: { data: { label: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--admin-primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--admin-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--admin-outline-variant)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--admin-on-surface-variant)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: 'var(--admin-on-surface-variant)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          formatter={(value: number) => [formatPrice(value), 'Выручка']}
          contentStyle={{
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-outline-variant)',
            borderRadius: 12,
            color: 'var(--admin-on-surface)',
          }}
          labelStyle={{ color: 'var(--admin-on-surface-variant)' }}
        />
        <Area type="monotone" dataKey="revenue" stroke="var(--admin-primary)" strokeWidth={3} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
