'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// На клиенте — useLayoutEffect (скрыть оверлеи до paint при горячем кеше шрифта);
// на сервере — useEffect-«заглушка», без React-warning «useLayoutEffect does nothing on the server».
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Единый сигнал готовности админки к показу (иконочный шрифт Material Symbols загружен).
 *
 * Пока шрифт не пришёл, глифы рендерятся текстом лигатур (`dashboard`, `payments`…),
 * а Recharts/иконки выглядят полу-собранными. Оба гейта — сайдбара (SidebarSkeletonGate)
 * и контента (ContentReadyGate) — висят, пока этот сигнал не станет `ready`.
 *
 * Модульный синглтон: measure-polling запускается ОДИН раз; после готовности `resolved`
 * остаётся true → при последующих (клиентских) навигациях гейты не показывают оверлей,
 * и работает обычный per-route loading.tsx. Так оверлеи закрывают только первый
 * холодный заход, потом «растворяются».
 *
 * На сервере `resolved` всегда false (whenReady зовётся только в клиентском эффекте) —
 * детерминизм SSR=первый клиентский кадр, без hydration-mismatch.
 */
let resolved = false;
let pending: Promise<void> | null = null;

/**
 * Реально ли доступен иконочный глиф? Меряем ширину тест-лигатуры: загруженный глиф
 * Material Symbols ≈ квадрат (≈ font-size), fallback-текст «settings» заметно шире.
 * (document.fonts.check ненадёжен: до объявления @font-face возвращает true.)
 */
function glyphReady(): boolean {
  const probe = document.createElement('span');
  probe.textContent = 'settings';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;' +
    "font-family:'Material Symbols Outlined';font-weight:400;font-size:48px;line-height:1;";
  document.body.appendChild(probe);
  const w = probe.offsetWidth;
  document.body.removeChild(probe);
  return w > 0 && w < 80; // глиф ≈ 48px; текст «settings» ≈ 190px
}

function whenReady(): Promise<void> {
  if (resolved) return Promise.resolve();
  if (pending) return pending;

  pending = new Promise<void>((resolve) => {
    const root = document.querySelector<HTMLElement>('.admin-root');
    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    const MAX_WAIT = 20000; // аварийная страховка от полного провала CDN — не ограничитель нормы

    const elapsed = () =>
      (typeof performance !== 'undefined' ? performance.now() : 0) - start;

    const finish = () => {
      resolved = true;
      root?.classList.add('ms-ready'); // снять FOUT-гард: показать иконки во всей админке
      resolve();
    };

    const poll = () => {
      if (glyphReady() || elapsed() > MAX_WAIT) {
        finish();
        return;
      }
      setTimeout(poll, 90);
    };

    document.fonts?.load("48px 'Material Symbols Outlined'").catch(() => {});
    poll();
  });

  return pending;
}

/** Готова ли админка к показу (шрифт загружен). false до готовности, затем true. */
export function useAdminReady(): boolean {
  // Ленивый init читает модульный флаг (не DOM): сервер=false, первый клиентский кадр=false.
  const [ready, setReady] = useState<boolean>(() => resolved);

  useIsomorphicLayoutEffect(() => {
    if (resolved) {
      setReady(true);
      return;
    }
    let cancelled = false;
    whenReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
