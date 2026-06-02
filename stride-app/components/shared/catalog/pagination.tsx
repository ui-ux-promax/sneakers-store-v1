'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const { setPage } = useCatalogUrl();
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const cell = 'w-9 h-9 grid place-items-center rounded-lg border border-line hover:border-ink tnum';
  return (
    <nav className="flex justify-center mt-10" aria-label="Пагинация">
      <div className="flex items-center gap-1.5 text-sm">
        <button className={cell} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Назад"><ChevronLeft className="w-4 h-4" /></button>
        {pages.map((p) => (
          <button key={p} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}
            className={p === page ? 'w-9 h-9 grid place-items-center rounded-lg bg-ink text-white font-semibold tnum' : cell}>{p}</button>
        ))}
        <button className={cell} disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Вперёд"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </nav>
  );
}
