import Link from 'next/link';

const links = [
  { label: 'Новинки', href: '/catalog?sort=new' },
  { label: 'Беговые', href: '/catalog?category=running' },
  { label: 'Лайфстайл', href: '/catalog?category=lifestyle' },
  { label: 'Платформы', href: '/catalog?category=platform' },
  { label: 'Каталог', href: '/catalog' },
];

export function MainNav() {
  return (
    <nav className="hidden md:flex items-center gap-5 ml-4" aria-label="Основная навигация">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm font-medium text-ink-muted hover:text-ink transition-colors">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
