import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { checkDadataRateLimit, extractClientIp } from '@/lib/rate-limit';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = process.env.DADATA_TOKEN;
  if (!token) return NextResponse.json({ suggestions: [] });

  try {
    const ip = extractClientIp({ headers: req.headers });
    const rl = await checkDadataRateLimit(ip);
    if (!rl.success) return tooManyRequests(rl, 'Слишком много запросов к подсказкам адреса');

    const { query } = await req.json();
    if (!query || typeof query !== 'string') return NextResponse.json({ suggestions: [] });
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return NextResponse.json({ suggestions: [] });
    if (normalizedQuery.length > 120) {
      return NextResponse.json({ suggestions: [] }, { status: 400 });
    }

    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: normalizedQuery, count: 5, language: 'ru' }),
    });
    if (!res.ok) {
      logger.error('dadata_suggest_upstream_failed', new Error(`status ${res.status}`));
      return NextResponse.json({ suggestions: [] });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    logger.error('dadata_suggest_failed', e);
    return NextResponse.json({ suggestions: [] });
  }
}
