import Link from 'next/link';
import { RegisterForm } from '@/components/shared/auth/register-form';
import { GoogleButton } from '@/components/shared/auth/google-button';

export const metadata = { title: 'Регистрация' };

export default function RegisterPage() {
  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-12 sm:py-20 min-h-[calc(100vh-280px)] flex items-center justify-center">
      <div className="auth-card">
        <h1 className="font-display font-bold text-2xl mb-6">Регистрация</h1>
        <RegisterForm />
        <div className="flex items-center gap-3 my-5">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-muted">или</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <GoogleButton />
        <div className="mt-6 pt-6 border-t border-line text-center text-sm text-ink-muted">
          Уже есть аккаунт? <Link href="/login" className="auth-link text-ink">Войти</Link>
        </div>
      </div>
    </main>
  );
}
