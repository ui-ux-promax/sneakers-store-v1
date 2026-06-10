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
  // 42 — единственный размер, который покупают e2e (checkout/coupon/review/yookassa ≈ 6 заказов/прогон).
  // Держим запас (12) на полный прогон + Playwright retry:2, иначе сток исчерпывается и кнопка
  // размера становится disabled (P10/budget). 43=0 нужен тесту «недоступный размер».
  { eu: '40', stock: 4 }, { eu: '41', stock: 3 }, { eu: '42', stock: 12 },
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
  // P2.2d: расширение каталога за PAGE_SIZE(12) — чтобы пагинация/сортировка были наблюдаемы.
  // Разброс цен 6990..21990 + скидки → видимые price-asc/price-desc/discount/popular.
  {
    name: 'STRIDE Aero Runner', slug: 'stride-aero-runner', brand: 'Asics', gender: 'MEN',
    description: 'Лёгкие темповые кроссовки с энергичным откликом для быстрых тренировок.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Бег', 'Верх': 'Инженерная сетка', 'Подошва': 'PEBA-пена', 'Сезон': 'Лето', 'Страна': 'Вьетнам', 'Артикул': '102270201' },
    isBestseller: true, sortOrder: 6, categorySlug: 'running',
    colorways: [
      {
        name: 'Ice Blue', slug: 'ice-blue', swatchHex: '#bcd9e8', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/nike-air-max-270.jpeg', alt: 'STRIDE Aero Runner Ice Blue', sortOrder: 0 }],
        variants: mk('SAR-ICE', 16990, null, RUN),
      },
    ],
  },
  {
    name: 'STRIDE Urban Low', slug: 'stride-urban-low', brand: 'Reebok', gender: 'UNISEX',
    description: 'Минималистичные городские кеды с чистым силуэтом и мягкой стелькой.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Город', 'Верх': 'Кожа, текстиль', 'Подошва': 'Резина', 'Сезон': 'Всесезон', 'Страна': 'Индонезия', 'Артикул': '102180701' },
    isBestseller: false, sortOrder: 7, categorySlug: 'lifestyle',
    colorways: [
      {
        name: 'Sand', slug: 'sand', swatchHex: '#d8c7a8', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/adidas-ultraboost.jpeg', alt: 'STRIDE Urban Low Sand', sortOrder: 0 }],
        variants: mk('SUL-SND', 7490, 9990, LIFE),
      },
    ],
  },
  {
    name: 'STRIDE Peak Trail', slug: 'stride-peak-trail', brand: 'Salomon', gender: 'MEN',
    description: 'Защищённые трейловые кроссовки для горного бега и пересечённой местности.',
    fitNote: 'Маломерят на полразмера.',
    specs: { 'Назначение': 'Трейл', 'Верх': 'Сетка, TPU-каркас', 'Подошва': 'Контагрип', 'Сезон': 'Демисезон', 'Страна': 'Вьетнам', 'Артикул': '102270222' },
    isBestseller: false, sortOrder: 8, categorySlug: 'running',
    colorways: [
      {
        name: 'Magma', slug: 'magma', swatchHex: '#b5462f', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Peak Trail Magma', sortOrder: 0 }],
        variants: mk('SPT-MGM', 18990, null, RUN),
      },
    ],
  },
  {
    name: 'STRIDE Retro 88', slug: 'stride-retro-88', brand: 'Saucony', gender: 'UNISEX',
    description: 'Ретро-силуэт девяностых с замшевыми оверлеями и винтажной палитрой.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Город', 'Верх': 'Замша, сетка', 'Подошва': 'EVA', 'Сезон': 'Демисезон', 'Страна': 'Китай', 'Артикул': '102180733' },
    isBestseller: false, sortOrder: 9, categorySlug: 'lifestyle',
    colorways: [
      {
        name: 'Grey Teal', slug: 'grey-teal', swatchHex: '#8aa3a0', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Retro 88 Grey Teal', sortOrder: 0 }],
        variants: mk('SR88-GRT', 9990, 12990, LIFE),
      },
    ],
  },
  {
    name: 'STRIDE Lux Platform', slug: 'stride-lux-platform', brand: 'New Balance', gender: 'WOMEN',
    description: 'Премиальная платформа с замшевым верхом и увеличенной высотой подошвы.',
    fitNote: 'Маломерят на полразмера.',
    specs: { 'Назначение': 'Город', 'Верх': 'Замша', 'Подошва': 'EVA', 'Сезон': 'Демисезон', 'Страна': 'Индонезия', 'Артикул': '102180744' },
    isBestseller: true, sortOrder: 10, categorySlug: 'platform',
    colorways: [
      {
        name: 'Mauve', slug: 'mauve', swatchHex: '#b89aa8', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/new-balance-550.jpeg', alt: 'STRIDE Lux Platform Mauve', sortOrder: 0 }],
        variants: mk('SLP-MVE', 17490, null, PLAT),
      },
    ],
  },
  {
    name: 'STRIDE Daily Mesh', slug: 'stride-daily-mesh', brand: 'Nike', gender: 'UNISEX',
    description: 'Доступные повседневные кроссовки с дышащим сетчатым верхом.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Город, бег', 'Верх': 'Сетка', 'Подошва': 'EVA', 'Сезон': 'Лето', 'Страна': 'Вьетнам', 'Артикул': '102270255' },
    isBestseller: true, sortOrder: 11, categorySlug: 'running',
    colorways: [
      {
        name: 'Carbon', slug: 'carbon', swatchHex: '#3a3a3a', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/nike-air-max-270.jpeg', alt: 'STRIDE Daily Mesh Carbon', sortOrder: 0 }],
        variants: mk('SDM-CRB', 6990, null, RUN),
      },
    ],
  },
  {
    name: 'STRIDE Canvas Hi', slug: 'stride-canvas-hi', brand: 'Vans', gender: 'UNISEX',
    description: 'Высокие парусиновые кеды с вулканизированной подошвой и классическим профилем.',
    fitNote: 'Маломерят на полный размер — бери на размер больше.',
    specs: { 'Назначение': 'Город', 'Верх': 'Парусина', 'Подошва': 'Вулканизированная резина', 'Сезон': 'Всесезон', 'Страна': 'Китай', 'Артикул': '102180766' },
    isBestseller: false, sortOrder: 12, categorySlug: 'lifestyle',
    colorways: [
      {
        name: 'Burgundy', slug: 'burgundy', swatchHex: '#6e2433', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/converse-chuck-70.jpeg', alt: 'STRIDE Canvas Hi Burgundy', sortOrder: 0 }],
        variants: mk('SCHI-BRG', 8490, 11990, LIFE),
      },
    ],
  },
  {
    name: 'STRIDE Storm GTX', slug: 'stride-storm-gtx', brand: 'Adidas', gender: 'MEN',
    description: 'Флагманские всепогодные кроссовки с водозащитной мембраной и максимальной защитой.',
    fitNote: 'Размер в размер.',
    specs: { 'Назначение': 'Трейл, город', 'Верх': 'Мембрана GTX-типа', 'Подошва': 'Continental-резина', 'Сезон': 'Зима', 'Страна': 'Вьетнам', 'Артикул': '102270288' },
    isBestseller: false, sortOrder: 13, categorySlug: 'running',
    colorways: [
      {
        name: 'Storm Black', slug: 'storm-black', swatchHex: '#202326', isDefault: true, sortOrder: 1,
        images: [{ url: '/products/puma-rs-x.jpeg', alt: 'STRIDE Storm GTX Black', sortOrder: 0 }],
        variants: mk('SSG-BLK', 21990, null, RUN),
      },
    ],
  },
];
