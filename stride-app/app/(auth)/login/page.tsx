import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from '@/components/shared/auth/login-form';
import { GoogleButton } from '@/components/shared/auth/google-button';

export const metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-12 sm:py-20 min-h-[calc(100vh-280px)] flex items-center justify-center">
      <div className="auth-card">
        <h1 className="font-display font-bold text-2xl mb-2">Вход</h1>
        <p className="text-sm text-ink-muted mb-6">Войдите, чтобы продолжить</p>
        {/* LoginForm читает ?error= через useSearchParams — нужен Suspense при пререндере (Next 15). */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <div className="flex items-center gap-3 my-5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-muted">или</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <GoogleButton />
        <div className="mt-6 pt-6 border-t border-line text-center text-sm text-ink-muted">
          Нет аккаунта? <Link href="/register" className="auth-link text-ink">Регистрация</Link>
        </div>
      </div>
    </main>
  );
}
