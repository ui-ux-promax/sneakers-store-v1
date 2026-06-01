import type { Gender } from '@prisma/client';

// Плоские демо-данные для сида. Структура НЕ использует Prisma nested-create
// (`{ create: [...] }`), потому что Neon HTTP-адаптер не поддерживает транзакции,
// которыми Prisma оборачивает вложенные записи. Сид (seed.ts) создаёт сущности
// плоско: product → colorway → createMany(images/variants).

export interface SeedVariant {
  sizeEu: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
}

export interface SeedColorway {
  name: string;
  slug: string;
  swatchHex: string;
  isDefault: boolean;
  sortOrder: number;
  images: { url: string; alt: string; sortOrder: number }[];
  variants: SeedVariant[];
}

export interface SeedProduct {
  name: string;
  slug: string;
  brand: string;
  gender: Gender;
  description: string;
  fitNote: string;
  specs: Record<string, string>;
  isBestseller: boolean;
  sortOrder: number;
  categorySlug: string;
  colorways: SeedColorway[];
}

export const categories = [
  { name: 'Беговые', slug: 'running', tagline: 'Скорость и амортизация', sortOrder: 1 },
  { name: 'Лайфстайл', slug: 'lifestyle', tagline: 'Город и стиль', sortOrder: 2 },
  { name: 'Платформы', slug: 'platform', tagline: 'Высота и характер', sortOrder: 3 },
];

type Row = { eu: string; stock: number };

const mk = (skuBase: string, price: number, compareAtPrice: number | null, rows: Row[]): SeedVariant[] =>
  rows.map((r) => ({
    sizeEu: r.eu,
    sku: `${skuBase}-${r.eu.replace('.', '_')}`,
    price,
    compareAtPrice,
    stock: r.stock,
  }));

const RUN: Row[] = [
  { eu: '40', stock: 4 }, { eu: '41', stock: 3 }, { eu: '42', stock: 5 },
  { eu: '42.5', stock: 2 }, { eu: '43', stock: 0 }, { eu: '44', stock: 6 }, { eu: '45', stock: 1 },
];
const LIFE: Row[] = [
  { eu: '39', stock: 2 }, { eu: '40', stock: 4 }, { eu: '41', stock: 0 },
  { eu: '42', stock: 3 }, { eu: '43', stock: 5 }, { eu: '44', stock: 2 },
];
const PLAT: Row[] = [
  { eu: '36', stock: 1 }, { eu: '37', stock: 2 }, { eu: '38', stock: 0 }, { eu: '39', stock: 1 }, { eu: '40', stock: 0 },
];

export const products: SeedProduct[] = [
  {
    name: 'STRIDE Velocity Trail', slug: 'stride-velocity-trail', brand: 'Nike', gender: 'MEN',
    description: 'Беговые кроссовки STRIDE для города и трассы. Дышащий верх, мягкая амортизация, цепкий протектор.',
    fitNote: 'Маломерят на полразмера — бери на размер больше привычного.',
    specs: { 'Назначение': 'Бег, город', 'Верх': 'Текстиль, сетка', 'Подошва': 'EVA-пена', 'Сезон': 'Демисезон', 'Страна': 'Вьетнам', 'Артикул': '102270093' },
    isBestseller: true, sortOrder: 1, categorySlug: 'running',
    colorways: [
      {
        name: 'Lime Flash', slug: 'lime-flash', swatchHex: '#bfff00', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/nike-air-max-270.jpeg', alt: 'STRIDE Velocity Trail Lime Flash', sortOrder: 0 }],
        variants: mk('SVT-LIME', 12990, null, RUN),
      },
      {
        name: 'Trail Black', slug: 'trail-black', swatchHex: '#1a1a1a', isDefault: false, sortOrder: 2,
        images: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Velocity Trail Black', sortOrder: 0 }],
        variants: mk('SVT-BLK', 12990, null, RUN),
      },
    ],
  },
  {
    name: 'STRIDE Court Classic', slug: 'stride-court-classic', brand: 'Adidas', gender: 'UNISEX',
    description: 'Лайфстайл-классика на каждый день: чистый силуэт, премиальные материалы.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Город', 'Верх': 'Кожа', 'Подошва': 'Резина', 'Сезон': 'Всесезон', 'Страна': 'Вьетнам', 'Артикул': '102270080' },
    isBestseller: false, sortOrder: 2, categorySlug: 'lifestyle',
    colorways: [
      {
        name: 'Court White', slug: 'court-white', swatchHex: '#ffffff', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/adidas-ultraboost.jpeg', alt: 'STRIDE Court Classic White', sortOrder: 0 }],
        variants: mk('SCC-WHT', 11240, 14990, LIFE),
      },
    ],
  },
  {
    name: 'STRIDE Cloud Platform', slug: 'stride-cloud-platform', brand: 'New Balance', gender: 'WOMEN',
    description: 'Платформа с максимальной высотой и мягкой посадкой.',
    fitNote: 'Маломерят на полразмера.',
    specs: { 'Назначение': 'Город', 'Верх': 'Замша', 'Подошва': 'EVA', 'Сезон': 'Демисезон', 'Страна': 'Индонезия', 'Артикул': '102180550' },
    isBestseller: true, sortOrder: 3, categorySlug: 'platform',
    colorways: [
      {
        name: 'Beige Cloud', slug: 'beige-cloud', swatchHex: '#e8e0d0', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/new-balance-550.jpeg', alt: 'STRIDE Cloud Platform Beige', sortOrder: 0 }],
        variants: mk('SCP-BEI', 15490, null, PLAT),
      },
    ],
  },
  {
    name: 'STRIDE Trail Pro', slug: 'stride-trail-pro', brand: 'Puma', gender: 'MEN',
    description: 'Трейловые кроссовки с агрессивным протектором и защитой носка.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Трейл', 'Верх': 'Сетка, TPU', 'Подошва': 'Резина Vibram-типа', 'Сезон': 'Лето', 'Страна': 'Вьетнам', 'Артикул': '102270111' },
    isBestseller: false, sortOrder: 4, categorySlug: 'running',
    colorways: [
      {
        name: 'Forest', slug: 'forest', swatchHex: '#2f4030', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Trail Pro Forest', sortOrder: 0 }],
        variants: mk('STP-FOR', 13490, null, RUN),
      },
    ],
  },
  {
    name: 'STRIDE Chuck Heritage', slug: 'stride-chuck-heritage', brand: 'Converse', gender: 'UNISEX',
    description: 'Вечная классика в обновлённом исполнении STRIDE.',
    fitNote: 'Маломерят на полный размер — бери на размер больше.',
    specs: { 'Назначение': 'Город', 'Верх': 'Текстиль', 'Подошва': 'Резина', 'Сезон': 'Всесезон', 'Страна': 'Вьетнам', 'Артикул': '102180610' },
    isBestseller: false, sortOrder: 5, categorySlug: 'lifestyle',
    colorways: [
      {
        name: 'Off White', slug: 'off-white', swatchHex: '#f3efe6', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Chuck Heritage Off White', sortOrder: 0 }],
        variants: mk('SCH-OWH', 8990, 10990, LIFE),
      },
      {
        name: 'Black', slug: 'black', swatchHex: '#1a1a1a', isDefault: false, sortOrder: 2,
        images: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Chuck Heritage Black', sortOrder: 0 }],
        variants: mk('SCH-BLK', 8990, null, LIFE),
      },
    ],
  },
];
