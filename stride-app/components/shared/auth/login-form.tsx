'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ensureVerificationGate } from '@/app/actions/verification';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { Button, Input } from '@/components/ui';
import { PasswordInput } from './password-input';
import { loginSchema, type LoginValues } from '@/services/dto/auth.dto';

// Сообщения по кодам ошибок Auth.js, прилетающим в ?error= при OAuth-редиректе на /login.
const OAUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: 'Этот email уже зарегистрирован через пароль. Войдите паролем.',
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oauthError = params.get('error');
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'));
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERRORS[oauthError] ?? 'Не удалось войти через Google') : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (v: LoginValues) => {
    setError(null);
    const res = await signIn('credentials', { ...v, redirect: false });
    if (res?.error) {
      // Возможно, почта не верифицирована — поднимем гейт (без раскрытия существования email).
      // callbackUrl уходит в pending-cookie: гейт уведёт туда после верификации (#4).
      const gate = await ensureVerificationGate(v.email, callbackUrl);
      if (gate.gated) { router.refresh(); return; }
      setError('Неверный email или пароль');
      return;
    }
    // Жёсткая навигация, а не router.push+refresh: refresh переспрашивал бы /login,
    // а authorized() уводит залогиненного с /login → /profile (гость терял callbackUrl, #4).
    // Полный переход на callbackUrl отдаёт и корректный хедер (сессия), и точку назначения.
    window.location.assign(callbackUrl);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label mb-2 block">Email</label>
        <Input id="email" type="email" autoComplete="email" className={errors.email ? 'err' : ''} {...register('email')} />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="label mb-2 block">Пароль</label>
        <PasswordInput id="password" autoComplete="current-password" error={!!errors.password} {...register('password')} />
        {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
      </div>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Войти
      </Button>
    </form>
  );
}
