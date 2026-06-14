import { Icon } from '@/components/admin/icon';
import { formatPrice } from '@/lib/format';
import type { BestSeller } from '@/lib/admin/analytics';

export function BestSellers({ items }: { items: BestSeller[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Топ продаж за период</h3>
      {items.length === 0 ? (
        <p className="text-sm text-admin-on-surface-variant">Продаж за период нет.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-4 p-3 rounded-xl bg-admin-surface-low border border-admin-outline-variant"
            >
              <div className="w-14 h-14 bg-white rounded-lg p-1 border border-admin-outline-variant flex items-center justify-center shrink-0 overflow-hidden">
                {item.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
                  <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Icon name="image" className="text-admin-on-surface-variant" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-admin-on-surface truncate">{item.name}</p>
                <p className="text-xs text-admin-on-surface-variant">{item.brand}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-admin-on-surface tabular-nums">{formatPrice(item.revenue)}</p>
                <p className="text-xs text-admin-on-surface-variant tabular-nums">{item.units} шт.</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
