import axios from 'axios';

export const axiosInstance = axios.create({
  // Относительный `/api` по умолчанию — домен-агностичен: работает локально,
  // на preview и в проде без env-переменной. NEXT_PUBLIC_API_URL переопределяет
  // (например, абсолютным URL), но его отсутствие НЕ должно ломать корзину.
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true, // cookie cartToken должен ходить с запросами
});
