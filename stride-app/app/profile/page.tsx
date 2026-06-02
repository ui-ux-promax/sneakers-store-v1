import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { ProfileView } from '@/components/shared/profile/profile-view';

export const metadata = { title: 'Профиль' };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login'); // дублирует middleware (страховка)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display font-bold text-2xl mb-6">Профиль</h1>
      <ProfileView
        email={user.email}
        initial={{
          name: user.name ?? '',
          phone: user.phone ?? '',
          birthdate: user.birthdate ? user.birthdate.toISOString().slice(0, 10) : '',
        }}
      />
    </main>
  );
}
