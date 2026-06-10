import { NextResponse } from 'next/server';
import type { RateLimitResult } from './rate-limit';

// reset — epoch-ms (от Upstash). Date.now() допустим в рантайме.
export function retryAfterSeconds(reset: number): number {
  return Math.max(0, Math.ceil((reset - Date.now()) / 1000));
}

// 429 для API-роутов: тело { message, retryAfterSec } + заголовок Retry-After (сек).
export function tooManyRequests(result: RateLimitResult, message = 'Слишком много запросов'): NextResponse {
  const retryAfterSec = retryAfterSeconds(result.reset);
  return NextResponse.json(
    { message, retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
