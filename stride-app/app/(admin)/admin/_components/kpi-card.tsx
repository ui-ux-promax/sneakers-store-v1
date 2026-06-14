import { Icon } from '@/components/admin/icon';
import { cn } from '@/lib/utils';
import type { Trend } from '@/lib/admin/analytics';

// value — уже отформатированная строка (₽ через formatPrice или число штук). trend — из computeTrend.
export function KpiCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  trend: Trend;
}) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 hover:border-admin-primary transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-admin-surface-high flex items-center justify-center group-hover:bg-admin-primary transition-colors">
          <Icon name={icon} className="text-admin-on-surface group-hover:text-admin-on-primary" />
        </div>
        <TrendBadge trend={trend} />
      </div>
      <p className="text-xs text-admin-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
      <h3 className="font-admin-head text-2xl font-bold text-admin-on-surface tabular-nums">{value}</h3>
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.pct === null) {
    return <span className="text-xs font-bold text-admin-on-surface-variant">новое</span>;
  }
  if (trend.dir === 'flat') {
    return <span className="text-xs font-bold text-admin-on-surface-variant">—</span>;
  }
  const up = trend.dir === 'up';
  return (
    <span className={cn('text-xs font-bold inline-flex items-center gap-0.5', up ? 'text-admin-on-surface' : 'text-admin-error')}>
      <Icon name={up ? 'trending_up' : 'trending_down'} className="text-[16px]" />
      {up ? '+' : ''}{trend.pct}%
    </span>
  );
}
