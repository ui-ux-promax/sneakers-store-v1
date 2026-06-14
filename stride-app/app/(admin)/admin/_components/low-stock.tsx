import { cn } from '@/lib/utils';
import type { LowStockRow } from '@/lib/admin/analytics';

export function LowStock({ rows }: { rows: LowStockRow[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-admin-head text-lg font-bold text-admin-on-surface">Низкий сток</h3>
        {rows.length > 0 && (
          <span className="px-3 py-1 bg-admin-error text-admin-on-error rounded-full font-bold text-xs">
            {rows.length} поз.
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-admin-on-surface-variant">Сток в норме.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => {
            const critical = row.tier === 'critical';
            return (
              <div
                key={row.id}
                className={cn(
                  'p-3 rounded-xl border flex justify-between items-center gap-2',
                  critical
                    ? 'border-admin-error bg-admin-error/10'
                    : 'border-admin-secondary-container bg-admin-secondary-container/30',
                )}
              >
                <div className="min-w-0">
                  <p className="font-bold text-admin-on-surface truncate">{row.productName}</p>
                  <p className="text-xs text-admin-on-surface-variant truncate">
                    {row.colorwayName} · EU {row.sizeEu} · {row.sku}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('font-admin-head text-xl font-bold tabular-nums', critical ? 'text-admin-error' : 'text-admin-on-surface')}>
                    {row.stock}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-admin-on-surface-variant">в наличии</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
