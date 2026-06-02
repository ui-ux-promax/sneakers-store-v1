import Link from 'next/link';
import { PackageOpen } from 'lucide-react';

export function EmptyCart() {
  return (
    <div className="bg-surface border border-line rounded-2xl text-center py-16 px-5">
      <PackageOpen className="w-16 h-16 mx-auto text-ink-muted" aria-hidden />
      <h2 className="font-display font-bold text-2xl mt-4">Корзина пустая</h2>
      <p className="text-ink-muted mt-2 max-w-md mx-auto">Добавьте хотя бы один товар, чтобы совершить заказ</p>
      <Link href="/catalog" className="btn btn-lg btn-primary mt-6">← Перейти в каталог</Link>
    </div>
  );
}
