import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-20 text-center">
      <h1 className="font-display font-bold text-3xl">Товар не найден</h1>
      <p className="text-ink-muted mt-2">Возможно, модель снята с продажи.</p>
      <Link href="/catalog" className="btn btn-md btn-primary mt-6">В каталог</Link>
    </div>
  );
}
