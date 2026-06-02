import { describe, it, expect } from 'vitest';
import { planCartMerge } from '@/lib/cart-merge';

describe('planCartMerge', () => {
  it('совпадающий вариант — суммирует количество', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v1', quantity: 2 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([{ id: 't1', quantity: 5 }]);
    expect(plan.creates).toEqual([]);
  });
  it('новый вариант — создаётся в target', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v2', quantity: 1 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([]);
    expect(plan.creates).toEqual([{ productVariantId: 'v2', quantity: 1 }]);
  });
  it('смесь: часть суммируется, часть создаётся', () => {
    const plan = planCartMerge(
      [{ productVariantId: 'v1', quantity: 1 }, { productVariantId: 'v3', quantity: 4 }],
      [{ id: 't1', productVariantId: 'v1', quantity: 3 }],
    );
    expect(plan.increments).toEqual([{ id: 't1', quantity: 4 }]);
    expect(plan.creates).toEqual([{ productVariantId: 'v3', quantity: 4 }]);
  });
});
