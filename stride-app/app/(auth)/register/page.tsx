import { Suspense } from 'react';
import Link from 'next/link';
import { RegisterForm } from '@/components/shared/auth/register-form';
import { GoogleButton } from '@/components/shared/auth/google-button';
import { safeCallbackUrl } from '@/lib/safe-redirect';

export const metadata = { title: 'Регистрация' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const raw = (await searchParams).callbackUrl;
  const cb = safeCallbackUrl(Array.isArray(raw) ? raw[0] : raw);
  // Сохраняем callbackUrl при переходе на /login, чтобы редирект пережил навигацию (#4).
  const loginHref = cb === '/' ? '/login' : `/login?callbackUrl=${encodeURIComponent(cb)}`;

  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-12 sm:py-20 min-h-[calc(100vh-280px)] flex items-center justify-center">
      <div className="auth-card">
        <h1 className="font-display font-bold text-2xl mb-6">Регистрация</h1>
        {/* RegisterForm/GoogleButton читают ?callbackUrl= через useSearchParams — нужен Suspense при пререндере (Next 15). */}
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
        <div className="flex items-center gap-3 my-5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-muted">или</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Suspense fallback={null}>
          <GoogleButton />
        </Suspense>
        <div className="mt-6 pt-6 border-t border-line text-center text-sm text-ink-muted">
          Уже есть аккаунт? <Link href={loginHref} className="auth-link text-ink">Войти</Link>
        </div>
      </div>
    </main>
  );
}
