import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, getCartDetails } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { CheckoutForm } from '@/components/shared/checkout/checkout-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Оформление заказа' };

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect('/login');

  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  const cart = token ? await prisma.cart.findFirst({ where: { token }, include: cartInclude }) : null;
  if (!cart || cart.items.length === 0) redirect('/cart');

  const details = getCartDetails(cart);

  return (
    <main className="mx-auto max-w-[1240px] px-4 sm:px-6 py-10">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">Оформление заказа</h1>
      <CheckoutForm
        details={details}
        defaults={{ contactName: user.name ?? '', contactPhone: user.phone ?? '', contactEmail: user.email }}
      />
    </main>
  );
}
