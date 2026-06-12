import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { ProfileView } from '@/components/shared/profile/profile-view';
import type { OrderRow } from '@/components/shared/profile/orders-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Профиль' };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      totalAmount: true,
      _count: { select: { items: true } },
      items: { select: { imageUrl: true, productName: true }, take: 4 },
      payment: { select: { status: true } },
    },
  });
  const orderRows: OrderRow[] = orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    totalAmount: o.totalAmount,
    itemCount: o._count.items,
    thumbs: o.items.map((it) => ({ imageUrl: it.imageUrl, productName: it.productName })),
    paymentStatus: o.payment?.status ?? null,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display font-bold text-2xl mb-6">Профиль</h1>
      <ProfileView
        email={user.email}
        initial={{
          name: user.name ?? '',
          phone: user.phone ?? '',
          birthdate: user.birthdate ? user.birthdate.toISOString().slice(0, 10) : '',
        }}
        orders={orderRows}
      />
    </main>
  );
}
