import { create } from 'zustand';

export interface WishlistState {
  count: number;
  setCount: (count: number) => void;
  fetchCount: () => Promise<void>;
  increment: () => void;
  decrement: () => void;
}

export const useWishlistStore = create<WishlistState>((set) => ({
  count: 0,

  setCount: (count) => set({ count }),

  fetchCount: async () => {
    try {
      const res = await fetch('/api/wishlist/count');
      if (!res.ok) return; // молча игнорируем сбой — не сбрасываем в ноль (без мигания)
      const data = await res.json();
      if (typeof data?.count === 'number') set({ count: data.count });
    } catch {
      /* бейдж не критичен — оставляем текущее значение, чтобы избежать мигания на ноль */
    }
  },

  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
}));
