import { parseUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';
import { prisma } from '@/lib/prisma-client';
import { getResend } from '@/lib/email/resend-client';
import { logger } from '@/lib/logger';

export const metadata = { title: 'Отписка от рассылки' };

async function unsubscribe(token: string | undefined): Promise<boolean> {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return false;
  try {
    await prisma.subscriber.updateMany({
      where: { email: parsed.email },
      data: { unsubscribedAt: new Date() },
    });
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    const resend = getResend();
    if (audienceId && resend) {
      try { await resend.contacts.update({ email: parsed.email, audienceId, unsubscribed: true }); }
      catch (e) { logger.warn('audience_unsub_failed', { err: String(e) }); }
    }
    return true;
  } catch (e) {
    logger.error('unsubscribe_failed', e);
    return false;
  }
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await unsubscribe(token);
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold">
        {ok ? 'Вы отписались' : 'Ссылка недействительна'}
      </h1>
      <p className="text-black/60 mt-3">
        {ok ? 'Больше не будем присылать рассылку. Передумаете — подпишитесь снова в футере сайта.'
            : 'Не удалось обработать ссылку отписки. Возможно, она устарела.'}
      </p>
    </div>
  );
}
