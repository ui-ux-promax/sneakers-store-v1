import Link from 'next/link';

export interface BentoCategory { slug: string; name: string; tagline: string | null; count: number; }

export function CategoryBento({ categories }: { categories: BentoCategory[] }) {
  return (
    <section id="cats" className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="label">Категории</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight">Под твой темп</h2>
        </div>
        <Link href="/catalog" className="btn btn-md btn-ghost hidden sm:inline-flex">Весь каталог →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[180px]">
        {categories.map((c, i) => (
          <Link
            key={c.slug}
            href={`/catalog?category=${c.slug}`}
            className={`group relative rounded-2xl overflow-hidden bg-surface-soft border border-line p-5 flex flex-col justify-end ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
            aria-label={`${c.name} — ${c.count} моделей`}
          >
            <span className="label">{c.name}</span>
            <span className="font-display font-semibold text-xl">{c.tagline ?? c.name}</span>
            <span className="text-sm text-ink-muted mt-1 tnum">{c.count} моделей</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
