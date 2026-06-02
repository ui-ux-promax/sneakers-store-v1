'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const links = [
  { label: 'Новинки', href: '/catalog?sort=new' },
  { label: 'Беговые', href: '/catalog?category=running' },
  { label: 'Лайфстайл', href: '/catalog?category=lifestyle' },
  { label: 'Платформы', href: '/catalog?category=platform' },
  { label: 'Каталог', href: '/catalog' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="md:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft -ml-2" aria-label="Открыть меню" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-surface border-b border-line p-4 flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface-soft">{l.label}</Link>
          ))}
        </div>
      )}
    </>
  );
}
