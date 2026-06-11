'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui';
import { safeCallbackUrl } from '@/lib/safe-redirect';

// Официальный многоцветный логотип Google G (lucide не содержит бренд-иконок).
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// Вход через Google. После успешного OAuth Auth.js вернёт на callbackUrl (или '/'), сработает
// events.signIn (слияние гостевой корзины). При коллизии email с credentials-аккаунтом Auth.js
// редиректит на /login?error=OAuthAccountNotLinked (dangerous-linking выключен) — обрабатывает
// LoginForm. callbackUrl (#4) читаем из URL и санитизируем — same-origin относительный путь.
export function GoogleButton() {
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'));
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full flex items-center justify-center gap-2"
      onClick={() => signIn('google', { redirectTo: callbackUrl })}
    >
      <GoogleIcon />
      Войти через Google
    </Button>
  );
}
