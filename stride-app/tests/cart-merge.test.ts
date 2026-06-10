import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// recalcCartTotalByToken зависит от глубокого cartInclude-графа и протестирован отдельно
// (cart.test.ts) — здесь мокаем, чтобы тест проверял ТОЛЬКО оркестрацию слияния.
vi.mock('@/lib/cart', () => ({ recalcCartTotalByToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

// In-memory fake Prisma: проверяем ИТОГОВОЕ состояние корзин после merge (реальное
// поведение), а не «был вызван mock». БД локально не гоняем (латентность Neon, см. P4).
const fake = vi.hoisted(() => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const state: { carts: any[]; items: any[]; variants: Map<string, number>; seq: number } = {
    carts: [], items: [], variants: new Map(), seq: 0,
  };
  const nid = (p: string) => `${p}${++state.seq}`;
  const stockOf = (pv: string) => (state.variants.has(pv) ? state.variants.get(pv)! : MAX);
  const applyQ = (it: any, q: any) => {
    if (q && typeof q === 'object' && 'increment' in q) it.quantity += q.increment;
    else it.quantity = q;
  };
  const attach = (c: any, include: any) =>
    include?.items ? { ...c, items: state.items.filter((i) => i.cartId === c.id).map((i) => ({ ...i })) } : { ...c };

  const prisma = {
    cart: {
      findFirst: async (args: any) => {
        const w = args?.where ?? {};
        let c: any;
        if (w.token !== undefined) c = state.carts.find((x) => x.token === w.token);
        else if (w.userId !== undefined)
          c = state.carts.find((x) => x.userId === w.userId && (!w.NOT || x.id !== w.NOT.id));
        return c ? attach(c, args?.include) : null;
      },
      findMany: async (args: any) => {
        const w = args?.where ?? {};
        return state.carts
          .filter((x) => x.userId === w.userId && (!w.NOT || x.id !== w.NOT.id))
          .map((c) => attach(c, args?.include));
      },
      update: async (args: any) => {
        const c = state.carts.find((x) => x.id === args.where.id);
        if (c) Object.assign(c, args.data);
        return attach(c, args?.include);
      },
      delete: async (args: any) => {
        const id = args.where.id;
        state.carts = state.carts.filter((x) => x.id !== id);
        state.items = state.items.filter((i) => i.cartId !== id); // onDelete: Cascade
        return {};
      },
    },
    cartItem: {
      upsert: async (args: any) => {
        const { cartId, productVariantId } = args.where.cartId_productVariantId;
        let it = state.items.find((i) => i.cartId === cartId && i.productVariantId === productVariantId);
        if (it) { applyQ(it, args.update.quantity); return { ...it }; }
        it = { id: nid('ci'), cartId, productVariantId, quantity: args.create.quantity };
        state.items.push(it);
        return { ...it };
      },
      update: async (args: any) => {
        const it = state.items.find((i) => i.id === args.where.id);
        if (it) applyQ(it, args.data.quantity);
        return it ? { ...it } : null;
      },
      create: async (args: any) => {
        const it = { id: nid('ci'), quantity: 1, ...args.data };
        state.items.push(it);
        return { ...it };
      },
      delete: async (args: any) => {
        state.items = state.items.filter((i) => i.id !== args.where.id);
        return {};
      },
      findUnique: async (args: any) => {
        const { cartId, productVariantId } = args.where.cartId_productVariantId;
        const it = state.items.find((i) => i.cartId === cartId && i.productVariantId === productVariantId);
        return it ? { ...it } : null;
      },
      findMany: async (args: any) => {
        const w = args?.where ?? {};
        return state.items
          .filter((i) => i.cartId === w.cartId)
          .map((i) => (args?.include?.productVariant ? { ...i, productVariant: { stock: stockOf(i.productVariantId) } } : { ...i }));
      },
    },
  };

  return {
    prisma,
    reset: () => { state.carts = []; state.items = []; state.variants = new Map(); state.seq = 0; },
    seedCart: (c: { id: string; token: string; userId: string | null }) => state.carts.push({ totalAmount: 0, ...c }),
    seedItem: (i: { id: string; cartId: string; productVariantId: string; quantity: number }) => state.items.push({ ...i }),
    setStock: (pv: string, stock: number) => state.variants.set(pv, stock),
    getCart: (id: string) => state.carts.find((c) => c.id === id),
    items: (cartId: string) =>
      state.items.filter((i) => i.cartId === cartId).map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })).sort((a, b) => a.productVariantId.localeCompare(b.productVariantId)),
  };
});

vi.mock('@/lib/prisma-client', () => ({ prisma: fake.prisma }));

import { mergeGuestCart, safeMergeGuestCart } from '@/lib/cart-merge';
import { recalcCartTotalByToken } from '@/lib/cart';
import { logger } from '@/lib/logger';
const recalc = recalcCartTotalByToken as unknown as ReturnType<typeof vi.fn>;
const loggerError = logger.error as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => { fake.reset(); recalc.mockClear(); loggerError.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('mergeGuestCart', () => {
  it('нет guest-токена — no-op, recalc не вызывается', async () => {
    await mergeGuestCart(undefined, 'u1');
    expect(recalc).not.toHaveBeenCalled();
  });

  it('guest-корзина не найдена — no-op', async () => {
    await mergeGuestCart('missing', 'u1');
    expect(recalc).not.toHaveBeenCalled();
  });

  it('гость без prior-корзин — привязывает корзину к userId, items без изменений', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 2 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.getCart('g').userId).toBe('u1');
    expect(fake.items('g')).toEqual([{ productVariantId: 'v1', quantity: 2 }]);
  });

  it('один prior, непересекающиеся варианты — переносит item, prior удаляется', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 2 });
    fake.seedCart({ id: 'p', token: 'tp', userId: 'u1' });
    fake.seedItem({ id: 'pi1', cartId: 'p', productVariantId: 'v2', quantity: 3 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([
      { productVariantId: 'v1', quantity: 2 },
      { productVariantId: 'v2', quantity: 3 },
    ]);
    expect(fake.getCart('p')).toBeUndefined();
  });

  it('пересекающийся вариант — количества суммируются (increment)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 2 });
    fake.seedCart({ id: 'p', token: 'tp', userId: 'u1' });
    fake.seedItem({ id: 'pi1', cartId: 'p', productVariantId: 'v1', quantity: 3 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([{ productVariantId: 'v1', quantity: 5 }]);
    expect(fake.getCart('p')).toBeUndefined();
  });

  it('итоговое количество клампится к остатку на складе (#7)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 4 });
    fake.seedCart({ id: 'p', token: 'tp', userId: 'u1' });
    fake.seedItem({ id: 'pi1', cartId: 'p', productVariantId: 'v1', quantity: 3 });
    fake.setStock('v1', 5); // 4 + 3 = 7 > 5 -> clamp to 5
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([{ productVariantId: 'v1', quantity: 5 }]);
  });

  it('несколько prior-корзин юзера — все сливаются и удаляются (#6)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 1 });
    fake.seedCart({ id: 'p1', token: 'tp1', userId: 'u1' });
    fake.seedItem({ id: 'p1i', cartId: 'p1', productVariantId: 'v2', quantity: 1 });
    fake.seedCart({ id: 'p2', token: 'tp2', userId: 'u1' });
    fake.seedItem({ id: 'p2i', cartId: 'p2', productVariantId: 'v3', quantity: 2 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([
      { productVariantId: 'v1', quantity: 1 },
      { productVariantId: 'v2', quantity: 1 },
      { productVariantId: 'v3', quantity: 2 },
    ]);
    expect(fake.getCart('p1')).toBeUndefined();
    expect(fake.getCart('p2')).toBeUndefined();
  });

  it('один и тот же вариант в guest и в ДВУХ prior — суммируется по всем (increment-аккумуляция)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 1 });
    fake.seedCart({ id: 'p1', token: 'tp1', userId: 'u1' });
    fake.seedItem({ id: 'p1i', cartId: 'p1', productVariantId: 'v1', quantity: 2 });
    fake.seedCart({ id: 'p2', token: 'tp2', userId: 'u1' });
    fake.seedItem({ id: 'p2i', cartId: 'p2', productVariantId: 'v1', quantity: 3 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([{ productVariantId: 'v1', quantity: 6 }]);
  });

  it('повторный вызов после успешного слияния не задваивает (сходимость)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 2 });
    fake.seedCart({ id: 'p', token: 'tp', userId: 'u1' });
    fake.seedItem({ id: 'pi1', cartId: 'p', productVariantId: 'v1', quantity: 3 });
    await mergeGuestCart('tg', 'u1');
    await mergeGuestCart('tg', 'u1');
    expect(fake.items('g')).toEqual([{ productVariantId: 'v1', quantity: 5 }]);
    expect(fake.getCart('g').userId).toBe('u1');
  });

  it('анти-кража: токен принадлежит ДРУГОМУ userId → no-op (чужую корзину не перепривязываем)', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: 'other' });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 2 });
    await mergeGuestCart('tg', 'u1');
    expect(fake.getCart('g').userId).toBe('other'); // не перепривязана к u1
    expect(recalc).not.toHaveBeenCalled();
  });
});

describe('safeMergeGuestCart (изоляция сбоя от логина, #4/#9)', () => {
  it('успешное слияние — возвращает true, ошибки не логируются', async () => {
    fake.seedCart({ id: 'g', token: 'tg', userId: null });
    fake.seedItem({ id: 'gi1', cartId: 'g', productVariantId: 'v1', quantity: 1 });
    const ok = await safeMergeGuestCart('tg', 'u1');
    expect(ok).toBe(true);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('сбой внутри merge НЕ пробрасывается — возвращает false и логирует', async () => {
    vi.spyOn(fake.prisma.cart, 'findFirst').mockRejectedValueOnce(new Error('neon down'));
    const ok = await safeMergeGuestCart('tg', 'u1');
    expect(ok).toBe(false);
    expect(loggerError).toHaveBeenCalled();
  });
});
