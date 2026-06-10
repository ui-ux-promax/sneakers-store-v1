// ВАЖНО: этот модуль НЕ импортирует logger. auth.config.ts (бандлится в edge-middleware)
// dynamic-import'ит checkLoginRateLimit отсюда; logger → request-context использует eval('require')
// для node:async_hooks, что запрещено в Edge Runtime (build падает). Поэтому здесь логов нет.

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const NOOP_RESULT: RateLimitResult = { success: true, remaining: -1, reset: 0 };

function getEnv(primary: string, fallback: string): string | undefined {
  return process.env[primary] || process.env[fallback] || undefined;
}

export function isRateLimitConfigured(): boolean {
  return Boolean(getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL') && getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'));
}

export function extractClientIp(req: { headers: Headers }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// Фаза 1: rate-limit заглушён (fail-open). Если Upstash не сконфигурирован — всегда success.
// Полноценные лимитеры (@upstash/ratelimit sliding window, prefix 'stride-app:*') добавляются в Фазе 2.
export async function checkCartRateLimit(_ip: string): Promise<RateLimitResult> {
  return NOOP_RESULT;
}

// Лимитер для auth-операций (регистрация/логин) — строже корзины. Точка подключения:
// при сконфигурированном Upstash здесь включится реальный sliding-window. Пока fail-open (NOOP),
// поэтому основная защита от argon2-DoS — дешёвая проверка дубликата ДО хэша в registerUser
// (см. docs/TROUBLESHOOTING.md). Без Upstash полноценного троттлинга нет — это осознанно.
export async function checkAuthRateLimit(_ip: string): Promise<RateLimitResult> {
  return NOOP_RESULT;
}

// ---------------------------------------------------------------------------
// Login rate-limit: sliding window, 5 attempts per 5 minutes per IP+email key.
// Fail-open: if Upstash env vars are absent, always returns success.
// ---------------------------------------------------------------------------
let loginLimiter: { limit(key: string): Promise<{ success: boolean; remaining: number; reset: number }> } | null | false = null;

async function getLoginLimiter(): Promise<typeof loginLimiter> {
  if (loginLimiter !== null) return loginLimiter;
  if (!isRateLimitConfigured()) { loginLimiter = false; return loginLimiter; }
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL')!;
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')!;
  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');
  loginLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '5 m'),
    prefix: 'stride-app:login',
  });
  return loginLimiter;
}

export async function checkLoginRateLimit(key: string): Promise<RateLimitResult> {
  const l = await getLoginLimiter();
  if (!l) return { success: true, remaining: -1, reset: 0 }; // fail-open
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

// ---------------------------------------------------------------------------
// P2.2c limiters: verify-code (per email+IP), resend-code (per email), newsletter (per IP).
// Same lazy + fail-open pattern as login limiter.
// ---------------------------------------------------------------------------
type Limiter = { limit(key: string): Promise<{ success: boolean; remaining: number; reset: number }> } | null | false;

async function makeLimiter(slot: { v: Limiter }, points: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string): Promise<Limiter> {
  if (slot.v !== null) return slot.v;
  if (!isRateLimitConfigured()) { slot.v = false; return slot.v; }
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL')!;
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')!;
  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');
  slot.v = new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(points, window), prefix });
  return slot.v;
}

const verifySlot = { v: null as Limiter };
const resendSlot = { v: null as Limiter };
const newsletterSlot = { v: null as Limiter };

export async function checkVerifyRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(verifySlot, 10, '10 m', 'stride-app:verify');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export async function checkResendRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(resendSlot, 5, '1 h', 'stride-app:resend');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export async function checkNewsletterRateLimit(key: string): Promise<RateLimitResult> {
  const l = await makeLimiter(newsletterSlot, 5, '10 m', 'stride-app:newsletter');
  if (!l) return { success: true, remaining: -1, reset: 0 };
  const r = await l.limit(key);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
