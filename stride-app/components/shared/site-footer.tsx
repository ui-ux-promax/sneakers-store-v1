import { NewsletterForm } from './newsletter-form';

const columns = [
  { title: 'Магазин', links: ['Новинки', 'Беговые', 'Лайфстайл', 'Платформы'] },
  { title: 'Помощь', links: ['Доставка', 'Возврат', 'Размерная сетка', 'Контакты'] },
  { title: 'Мы рядом', links: ['Telegram', 'VK', 'YouTube'] },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20 pb-8">
      <div className="rounded-[28px] overflow-hidden text-white bg-footer">
        <div className="p-8 sm:p-12">
          <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm">S</span>
                <span className="font-display font-bold text-lg">STRIDE</span>
              </div>
              <p className="text-white/70 text-sm max-w-xs leading-relaxed mt-3">Подпишись на дропы и забирай новые модели первым. Без спама.</p>
              <NewsletterForm />
            </div>
            {columns.map((col) => (
              <div key={col.title}>
                <p className="font-semibold text-sm mb-3">{col.title}</p>
                <ul className="space-y-2 text-sm text-white/70">
                  {col.links.map((l) => (
                    <li key={l}><a href="#" className="hover:text-white">{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 mt-8 pt-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-white/70">
            <p>© 2026 STRIDE. Все цены в рублях.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white">Политика конфиденциальности</a>
              <a href="#" className="hover:text-white">Условия</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
