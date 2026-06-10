import { createElement } from 'react';
import { prisma } from '@/lib/prisma-client';
import { sendEmail } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import { generateCode, hashCode, verifyCodeHash } from '@/lib/verification/code';
import { VERIFICATION_CODE_TTL_MS, VERIFICATION_MAX_ATTEMPTS } from '@/constants/config';
import { logger } from '@/lib/logger';

export type ConfirmStatus = 'ok' | 'wrong' | 'expired' | 'locked';

// Генерит и шлёт новый код. Старые коды этого email удаляются (один активный на email).
export async function issueCode(email: string): Promise<void> {
  await prisma.emailVerificationCode.deleteMany({ where: { email } });
  const code = generateCode();
  const codeHash = await hashCode(code);
  await prisma.emailVerificationCode.create({
    data: { email, codeHash, expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS) },
  });

  // В dev без Resend печатаем код в лог, чтобы пройти флоу локально/в CI без реальной почты.
  if (process.env.NODE_ENV !== 'production' && !process.env.RESEND_API_KEY) {
    logger.info('verification_code_dev', { email, code });
  }

  await sendEmail({
    to: email,
    subject: 'Код подтверждения STRIDE',
    react: createElement(VerificationCodeEmail, { code }),
  });
}

export async function confirmCode(email: string, code: string): Promise<{ status: ConfirmStatus }> {
  const row = await prisma.emailVerificationCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) return { status: 'expired' };

  if (row.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return { status: 'locked' };
  }

  const valid = await verifyCodeHash(code, row.codeHash);
  if (!valid) {
    await prisma.emailVerificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { status: 'wrong' };
  }

  // Одноразовость: условие consumedAt:null в where закрывает гонку двойного сабмита.
  await prisma.emailVerificationCode.update({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return { status: 'ok' };
}
