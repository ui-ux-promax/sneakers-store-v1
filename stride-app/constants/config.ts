// Единый источник бизнес-чисел Фазы 1.

export const FREE_SHIPPING_THRESHOLD = 10_000; // ₽, индикатор «Бесплатно от …»
export const SHIPPING_FLAT = 500; // ₽, курьер ниже порога бесплатной доставки
export const NEW_PRODUCT_WINDOW_DAYS = 30;     // окно бейджа «Новинка» по createdAt
export const LOW_STOCK_THRESHOLD = 3;          // «Осталось N пар»

export const CATALOG_PAGE_SIZE = 12;

export const CART_COOKIE_NAME = 'cartToken';
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

// EU-сетка с полуразмерами (строки — для UI; в БД sizeEu Decimal(3,1)).
export const EU_SIZE_GRID = [
  '39', '39.5', '40', '40.5', '41', '41.5', '42', '42.5',
  '43', '43.5', '44', '44.5', '45', '45.5', '46',
] as const;

// Справочная конвертация (display-only, не SKU).
export const SIZE_CONVERSION: { eu: string; uk: string; us: string }[] = [
  { eu: '39', uk: '6', us: '7' },
  { eu: '40', uk: '6.5', us: '7.5' },
  { eu: '41', uk: '7.5', us: '8.5' },
  { eu: '42', uk: '8', us: '9' },
  { eu: '42.5', uk: '8.5', us: '9.5' },
  { eu: '43', uk: '9', us: '10' },
  { eu: '44', uk: '9.5', us: '10.5' },
  { eu: '45', uk: '10.5', us: '11.5' },
  { eu: '46', uk: '11', us: '12' },
];

// Опции сортировки каталога (значение в URL ?sort=).
export const SORT_OPTIONS = [
  { value: 'new', label: 'Сначала новинки' },
  { value: 'popular', label: 'Популярные' },
  { value: 'price-asc', label: 'Цена: по возрастанию' },
  { value: 'price-desc', label: 'Цена: по убыванию' },
  { value: 'discount', label: 'Сначала со скидкой' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];
export const DEFAULT_SORT: SortValue = 'new';

export const GENDER_OPTIONS = [
  { value: 'MEN', label: 'Мужские' },
  { value: 'WOMEN', label: 'Женские' },
  { value: 'UNISEX', label: 'Унисекс' },
  { value: 'KIDS', label: 'Детские' },
] as const;
