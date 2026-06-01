import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm text-ink-muted flex-wrap pt-5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {it.href ? <Link href={it.href} className="hover:text-ink">{it.label}</Link> : <span className="text-ink font-semibold">{it.label}</span>}
          {i < items.length - 1 && <span aria-hidden>/</span>}
        </span>
      ))}
    </nav>
  );
}
