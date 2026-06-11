// Граница безопасности: редирект только на same-origin путь.
// callbackUrl приходит из ?callbackUrl= — middleware NextAuth кладёт туда
// АБСОЛЮТНЫЙ request.nextUrl.href (напр. https://site/checkout), поэтому у
// http(s)-URL берём только path+query+hash, отбрасывая origin. Это и есть
// защита: любой чужой origin просто выкидывается, остаётся только путь.
// Контрол-символы (\r \n \t) и бэкслеш парсер браузера/Auth.js нормализует
// в cross-origin (//evil) → режем их до разбора. На подозрительный ввод — домой.

// Контрол-символы (U+0000–U+001F вкл. \r \n \t, DEL U+007F) и бэкслеш — их
// парсер схлопывает в чужой origin, поэтому отвергаем до любого разбора.
function hasUnsafeChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || s[i] === '\\') return true;
  }
  return false;
}

export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (hasUnsafeChars(raw)) return '/';

  let candidate = raw;
  // Абсолютный http(s)-URL (его подставляет middleware) → оставляем только путь, origin отбрасываем.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      candidate = u.pathname + u.search + u.hash;
    } catch {
      return '/';
    }
  }

  // Должен начинаться ровно с одного слэша.
  if (candidate[0] !== '/') return '/';
  // //host и /\host — protocol-relative / обход.
  if (candidate[1] === '/' || candidate[1] === '\\') return '/';
  // Остаточный scheme-разделитель (напр. в query) → перестраховка.
  if (candidate.includes('://')) return '/';
  return candidate;
}
