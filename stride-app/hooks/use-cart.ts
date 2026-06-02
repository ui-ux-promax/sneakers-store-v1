import React from 'react';
import { useCartStore } from '@/store';

export const useCart = () => {
  const state = useCartStore((s) => s);
  React.useEffect(() => {
    state.fetchCartItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
};
