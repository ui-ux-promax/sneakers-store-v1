import Link from 'next/link';
import { Heart } from 'lucide-react';

export function WishlistEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-12 text-center">
      <Heart className="w-10 h-10 mx-auto text-ink-muted" aria-hidden />
      <h2 className="mt-3 font-semibold text-lg">В избранном пока пусто</h2>
      <p className="mt-1 text-sm text-ink-muted">Нажимайте ♡ на товарах, чтобы сохранить их сюда.</p>
      <Link href="/catalog" className="btn btn-primary btn-md mt-5 inline-flex">Смотреть каталог</Link>
    </div>
  );
}
