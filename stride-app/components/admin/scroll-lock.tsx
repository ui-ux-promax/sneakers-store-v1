'use client';

import { useEffect } from 'react';

/**
 * Жёстко глушит скролл документа (html + body), пока админка смонтирована — скроллит только
 * <main>. CSS `:has` делает это при SSR; этот эффект — гарантия на случай, если `:has`
 * не поддержан/перебит. Откат при размонтировании (уход на витрину).
 */
export function ScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);
  return null;
}
