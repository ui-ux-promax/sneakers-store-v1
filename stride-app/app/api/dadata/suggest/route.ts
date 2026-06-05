import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = process.env.DADATA_TOKEN;
  if (!token) return NextResponse.json({ suggestions: [] });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') return NextResponse.json({ suggestions: [] });

    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count: 5, language: 'ru' }),
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
