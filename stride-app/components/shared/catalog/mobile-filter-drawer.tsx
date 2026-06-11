'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCatalogUrl } from '@/hooks/use-catalog-url';
import { FilterControls } from './filter-controls';
import { ResetButton } from './active-filter-chips';
import { Button } from '@/components/ui';
import type { CatalogResult } from '@/lib/find-products';

// Группы фильтров, считающиеся «активными» по числу выбранных значений (бейдж на кнопке).
const GROUPS = ['category', 'brand', 'gender', 'color', 'size'];

// Только <md: кнопка «Фильтры» (в sticky-тулбаре) открывает выезжающую слева панель
// с теми же фасетами, что и инлайн-сайдбар. С md+ кнопка скрыта (md:hidden).
export function MobileFilterDrawer({ facets, total }: { facets: CatalogResult['facets']; total: number }) {
  const [open, setOpen] = useState(false);
  const { getList, get } = useCatalogUrl();

  let activeCount = GROUPS.reduce((n, k) => n + getList(k).length, 0);
  if (get('priceFrom') || get('priceTo')) activeCount += 1;
  if (get('inStock') === '1') activeCount += 1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-sm btn-secondary md:hidden" aria-label="Открыть фильтры">
        <SlidersHorizontal className="w-4 h-4" aria-hidden />
        Фильтры
        {activeCount > 0 && (
          <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tnum">{activeCount}</span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col bg-surface shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="font-display font-semibold text-lg">Фильтры</Dialog.Title>
            <Dialog.Close className="w-9 h-9 grid place-items-center rounded-full hover:bg-surface-soft" aria-label="Закрыть фильтры">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <FilterControls facets={facets} showHeading={false} />
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-4">
            <ResetButton className="text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink" />
            <div className="flex-1" />
            <Button type="button" variant="primary" size="md" onClick={() => setOpen(false)}>Показать {total}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
