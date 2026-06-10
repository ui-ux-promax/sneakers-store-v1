'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui';
import { OtpInput } from './otp-input';
import { verifyEmailCode, resendVerificationCode } from '@/app/actions/verification';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { VERIFICATION_RESEND_COOLDOWN_MS } from '@/constants/config';

const MESSAGES: Record<string, string> = {
  wrong: 'Неверный код. Проверьте и попробуйте снова.',
  expired: 'Код истёк. Запросите новый.',
  locked: 'Слишком много попыток. Запросите новый код.',
  rate: 'Слишком часто. Подождите немного.',
  invalid: 'Код состоит из 6 цифр.',
  'no-session': 'Сессия истекла. Зарегистрируйтесь заново.',
};

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email[0]}***@${email.slice(at + 1)}`;
}

export function VerificationGate({ email, callbackUrl }: { email: string; callbackUrl?: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await verifyEmailCode({ code: value });
    setSubmitting(false);
    if (res.ok) {
      // Сессия заминчена сервером — жёстко уводим на callbackUrl (#4). Полный переход
      // (а не router.replace+refresh) даёт корректный хедер и не цепляет /login→/profile.
      window.location.assign(safeCallbackUrl(callbackUrl));
      return;
    }
    setError(MESSAGES[res.reason] ?? 'Не удалось подтвердить.');
    setCode('');
  };

  // Авто-сабмит при заполнении всех 6 цифр.
  useEffect(() => {
    if (code.length === 6 && !submitting) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError(null);
    const res = await resendVerificationCode();
    if (!res.ok) { setError(MESSAGES[res.error ?? ''] ?? 'Не удалось отправить код.'); return; }
    setCooldown(Math.round(VERIFICATION_RESEND_COOLDOWN_MS / 1000));
  };

  const block = (e: Event) => e.preventDefault();

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] rounded-2xl bg-white p-6 sm:p-8 shadow-xl"
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          aria-describedby="verify-desc"
        >
          <Dialog.Title className="text-lg font-display font-bold">Подтвердите почту</Dialog.Title>
          <p id="verify-desc" className="text-sm text-black/60 mt-1 mb-5">
            Код отправлен на {maskEmail(email)}. Введите 6 цифр из письма.
          </p>
          <OtpInput value={code} onChange={setCode} disabled={submitting} autoFocus />
          {error && <p className="text-danger text-sm mt-3 text-center" role="alert">{error}</p>}
          <Button
            type="button" variant="primary" size="lg" className="w-full mt-5"
            loading={submitting} disabled={code.length !== 6}
            onClick={() => submit(code)}
          >
            Подтвердить
          </Button>
          <button
            type="button" onClick={resend} disabled={cooldown > 0}
            className="w-full text-center text-sm text-black/60 mt-3 disabled:opacity-50 hover:text-black"
          >
            {cooldown > 0 ? `Отправить снова через ${cooldown}с` : 'Отправить код снова'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
