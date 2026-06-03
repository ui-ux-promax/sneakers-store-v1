'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui';

// Вход через Google. После успешного OAuth Auth.js вернёт на '/', сработает events.signIn
// (слияние гостевой корзины). При коллизии email с credentials-аккаунтом Auth.js редиректит
// на /login?error=OAuthAccountNotLinked (dangerous-linking выключен) — обрабатывает LoginForm.
export function GoogleButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      onClick={() => signIn('google', { redirectTo: '/' })}
    >
      Войти через Google
    </Button>
  );
}
