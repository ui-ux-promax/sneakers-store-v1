'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Sparkles, Footprints, Sun, Layers, LayoutGrid,
  ChevronRight, X, User, Heart, ShoppingCart, ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavLink {
  label: string;
  sub: string;
  href: string;
  Icon: LucideIcon;
  active: (path: string, sp: ReadonlyURLSearchParams) => boolean;
}

const links: NavLink[] = [
  { label: 'Новинки', sub: 'Свежий дроп сезона', href: '/catalog?sort=new', Icon: Sparkles, active: (p, sp) => p === '/catalog' && sp.get('sort') === 'new' },
  { label: 'Беговые', sub: 'Лёгкие, с амортизацией', href: '/catalog?category=running', Icon: Footprints, active: (p, sp) => p === '/catalog' && sp.get('category') === 'running' },
  { label: 'Лайфстайл', sub: 'На каждый день', href: '/catalog?category=lifestyle', Icon: Sun, active: (p, sp) => p === '/catalog' && sp.get('category') === 'lifestyle' },
  { label: 'Платформы', sub: 'Объёмная подошва', href: '/catalog?category=platform', Icon: Layers, active: (p, sp) => p === '/catalog' && sp.get('category') === 'platform' },
  { label: 'Каталог', sub: 'Все модели и фильтры', href: '/catalog', Icon: LayoutGrid, active: (p, sp) => p === '/catalog' && !sp.get('category') && !sp.get('sort') },
];

const pills = [
  { label: 'Профиль', href: '/profile', Icon: User },
  { label: 'Избранное', href: '/wishlist', Icon: Heart },
  { label: 'Корзина', href: '/cart', Icon: ShoppingCart },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sp = useSearchParams();
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startY: 0, dy: 0, moved: false });

  // Свайп ручки вниз → закрыть. Тащим Content 1:1, отпустили: за порогом закрываем, иначе — назад.
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startY: e.clientY, dy: 0, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (contentRef.current) contentRef.current.style.transition = 'none';
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 3) d.moved = true;
    d.dy = dy > 0 ? dy : dy * 0.25; // вверх — резинка
    if (contentRef.current) contentRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const el = contentRef.current;
    if (d.dy > 90 || !d.moved) {
      if (el) { el.style.transition = ''; el.style.transform = ''; }
      setOpen(false);
      return;
    }
    if (el) {
      el.style.transition = 'transform .28s cubic-bezier(.16,1,.3,1)';
      el.style.transform = '';
      window.setTimeout(() => { if (el) el.style.transition = ''; }, 300);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="md:hidden w-10 h-10 grid place-items-center rounded-full hover:bg-surface-soft -ml-2"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
      >
        <span className="relative block w-6 h-[18px]" aria-hidden="true">
          <span className={cn('absolute left-0 top-0 h-0.5 w-6 rounded-full bg-ink transition-all duration-300 [transition-timing-function:cubic-bezier(.65,.05,.36,1)]', open && 'top-[8px] rotate-45')} />
          <span className={cn('absolute left-0 top-[8px] h-0.5 w-6 rounded-full bg-ink transition-all duration-200', open && 'opacity-0 scale-x-50')} />
          <span className={cn('absolute left-0 top-[16px] h-0.5 w-6 rounded-full bg-ink transition-all duration-300 [transition-timing-function:cubic-bezier(.65,.05,.36,1)]', open && 'top-[8px] -rotate-45')} />
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[85vh] flex-col rounded-t-[28px] bg-surface shadow-[0_-18px_50px_-12px_hsl(220_13%_10%/0.35)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          {/* ручка-хваталка: свайп вниз или тап закрывает */}
          <div
            className="flex cursor-grab touch-none justify-center pt-3 pb-1.5 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="h-1.5 w-11 rounded-full bg-line" aria-hidden="true" />
          </div>

          <div className="flex shrink-0 items-center justify-between px-5 pb-2">
            <Dialog.Title className="font-display font-bold text-xl tracking-tight">Меню</Dialog.Title>
            <Dialog.Close className="w-9 h-9 grid place-items-center rounded-full hover:bg-surface-soft -mr-1" aria-label="Закрыть меню">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-2">
            <nav aria-label="Основная навигация">
              <ul className="space-y-1.5">
                {links.map((l, i) => {
                  const isActive = l.active(pathname, sp);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                        style={{ animationDelay: `${110 + i * 50}ms`, animationFillMode: 'both' }}
                        className={cn(
                          'group flex min-h-[54px] items-center gap-3.5 rounded-[18px] border border-transparent px-3.5 py-2 transition-colors duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2',
                          isActive ? 'border-primary/55 bg-primary/[0.16]' : 'hover:bg-surface-soft',
                        )}
                      >
                        <span className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-[14px] transition-colors duration-200',
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-surface-soft text-ink',
                        )}>
                          <l.Icon className="w-[22px] h-[22px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-display font-bold text-[18px] leading-tight tracking-tight">{l.label}</span>
                          <span className="block text-xs text-ink-muted mt-0.5">{l.sub}</span>
                        </span>
                        <ChevronRight className="ml-auto w-[22px] h-[22px] text-ink-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="grid grid-cols-3 gap-2.5 mt-4 px-1">
                {pills.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-1.5 py-3 text-xs font-semibold transition-colors hover:border-ink hover:bg-surface-soft"
                  >
                    <p.Icon className="w-[22px] h-[22px]" />
                    {p.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>

          <div className="shrink-0 border-t border-line px-4 pt-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <Link href="/catalog" onClick={() => setOpen(false)} className="btn btn-lg btn-primary w-full">
              Смотреть каталог
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="text-[11px] leading-snug text-center text-ink-muted mt-3">
              Бесплатная доставка по России от 10 000 ₽ · Возврат 14 дней
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
