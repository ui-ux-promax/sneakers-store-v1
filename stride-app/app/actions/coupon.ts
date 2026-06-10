'use server';

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, getCartDetails } from '@/lib/cart-details';
import { resolveOwnerCart } from '@/lib/cart';
import { cartCookieName } from '@/lib/cart-cookie';
import { checkCoupon, calcCouponDiscount } from '@/lib/coupon';

export type ValidateCouponResult =
  | { ok: true; code: string; percent: number; discount: number }
  | { ok: false; error: string };

// Preview-скидка для текущей корзины. Ничего не сохраняет — источник истины расчёта в placeOrder.
export async function validateCoupon(rawCode: string): Promise<ValidateCouponResult> {
  const check = await checkCoupon(rawCode);
  if (!check.ok) return check;

  const session = await auth();
  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  // Корзина залогиненного резолвится по userId (не по cookie); гость — по token.
  const owner = await resolveOwnerCart(session?.user?.id ?? null, token, { create: false });
  const cart = owner ? await prisma.cart.findFirst({ where: { id: owner.id }, include: cartInclude }) : null;
  if (!cart || cart.items.length === 0) return { ok: false, error: 'Корзина пуста' };

  const details = getCartDetails(cart);
  const discount = calcCouponDiscount(details.totalAmount, check.percent);
  return { ok: true, code: check.code, percent: check.percent, discount };
}
