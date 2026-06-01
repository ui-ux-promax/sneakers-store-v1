import { axiosInstance } from './instance';
import type { CreateCartItemValues } from './dto/cart.dto';
import type { CartWithItems } from '@/lib/cart-details';

export const getCart = async (): Promise<CartWithItems> =>
  (await axiosInstance.get<CartWithItems>('/cart')).data;

export const addCartItem = async (values: CreateCartItemValues): Promise<CartWithItems> =>
  (await axiosInstance.post<CartWithItems>('/cart', values)).data;

export const updateItemQuantity = async (id: string, quantity: number): Promise<CartWithItems> =>
  (await axiosInstance.patch<CartWithItems>(`/cart/${id}`, { quantity })).data;

export const removeCartItem = async (id: string): Promise<CartWithItems> =>
  (await axiosInstance.delete<CartWithItems>(`/cart/${id}`)).data;
