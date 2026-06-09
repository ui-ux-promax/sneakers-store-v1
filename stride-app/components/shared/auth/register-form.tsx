'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';
import { PasswordInput } from './password-input';
import { registerFormSchema, type RegisterFormValues } from '@/services/dto/auth.dto';
import { registerUser } from '@/app/actions/auth';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = async (v: RegisterFormValues) => {
    setError(null);
    // На сервер уходят только поля registerSchema; confirmPassword/agree — клиентская валидация.
    const res = await registerUser({ name: v.name, email: v.email, password: v.password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // P2.2c: pending-cookie уже стоит (registerUser), refresh → RootLayout отрендерит модалку верификации.
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="label mb-2 block">Имя</label>
        <Input id="name" autoComplete="name" className={errors.name ? 'err' : ''} {...register('name')} />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="reg-email" className="label mb-2 block">Email</label>
        <Input id="reg-email" type="email" autoComplete="email" className={errors.email ? 'err' : ''} {...register('email')} />
        {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="reg-password" className="label mb-2 block">Пароль</label>
        <PasswordInput id="reg-password" autoComplete="new-password" error={!!errors.password} {...register('password')} />
        {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
      </div>
      <div>
        <label htmlFor="confirm" className="label mb-2 block">Повторите пароль</label>
        <PasswordInput id="confirm" autoComplete="new-password" error={!!errors.confirmPassword} {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="text-danger text-xs mt-1">{errors.confirmPassword.message}</p>}
      </div>
      <div>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="w-5 h-5 rounded-md mt-0.5 shrink-0 accent-[hsl(var(--color-primary))]"
            {...register('agree')}
          />
          <span>
            Согласен с <Link href="/legal/terms" className="auth-link">условиями</Link> и{' '}
            <Link href="/legal/privacy" className="auth-link">политикой конфиденциальности</Link>
          </span>
        </label>
        {errors.agree && <p className="text-danger text-xs mt-1">{errors.agree.message}</p>}
      </div>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        Зарегистрироваться
      </Button>
    </form>
  );
}
