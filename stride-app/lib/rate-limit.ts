import { logger } from './logger';

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
  if (!isRateLimitConfigured()) return NOOP_RESULT;
  logger.debug('rate_limit_noop_phase1');
  return NOOP_RESULT;
}
