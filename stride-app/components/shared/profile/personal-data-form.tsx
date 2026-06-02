'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { profileSchema, type ProfileValues } from '@/services/dto/auth.dto';
import { updateProfile } from '@/app/actions/profile';

export function PersonalDataForm({ initial, email }: { initial: ProfileValues; email: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: initial });

  const onSubmit = async (v: ProfileValues) => {
    setMsg(null);
    const res = await updateProfile(v);
    setMsg(res.ok ? { ok: true, text: 'Сохранено' } : { ok: false, text: res.error });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="p-email" className="label mb-2 block">Email</label>
        <Input id="p-email" value={email} disabled readOnly />
      </div>
      <div>
        <label htmlFor="p-name" className="label mb-2 block">Имя</label>
        <Input id="p-name" className={errors.name ? 'err' : ''} {...register('name')} />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="p-phone" className="label mb-2 block">Телефон</label>
        <Input id="p-phone" placeholder="+7…" className={errors.phone ? 'err' : ''} {...register('phone')} />
        {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
      </div>
      <div>
        <label htmlFor="p-bd" className="label mb-2 block">Дата рождения</label>
        <Input id="p-bd" type="date" {...register('birthdate')} />
      </div>
      {msg && (
        <p className={msg.ok ? 'text-success text-sm' : 'text-danger text-sm'} role="status">
          {msg.text}
        </p>
      )}
      <Button type="submit" variant="primary" loading={isSubmitting}>Сохранить</Button>
    </form>
  );
}
