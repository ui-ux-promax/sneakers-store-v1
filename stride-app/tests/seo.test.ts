import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  buildBreadcrumbListJsonLd,
  buildCatalogItemListJsonLd,
  buildProductJsonLd,
  buildStorefrontJsonLd,
  getSiteUrl,
} from '@/lib/seo';

describe('getSiteUrl', () => {
  it('uses NEXT_PUBLIC_SITE_URL when present', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://cloudd3r.eu.cc/';
    try {
      expect(getSiteUrl().toString()).toBe('https://cloudd3r.eu.cc/');
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it('falls back to localhost', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      expect(getSiteUrl().toString()).toBe('http://localhost:3000/');
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});

describe('absoluteUrl', () => {
  it('turns root-relative paths into absolute URLs', () => {
    expect(absoluteUrl('/product/test', new URL('https://cloudd3r.eu.cc'))).toBe('https://cloudd3r.eu.cc/product/test');
  });

  it('keeps already absolute URLs', () => {
    expect(absoluteUrl('https://cdn.example.com/a.jpg', new URL('https://cloudd3r.eu.cc'))).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('buildStorefrontJsonLd', () => {
  it('builds Organization and WebSite with search action', () => {
    const graph = buildStorefrontJsonLd(new URL('https://cloudd3r.eu.cc'));
    expect(graph).toMatchObject({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'STRIDE', url: 'https://cloudd3r.eu.cc/' },
        {
          '@type': 'WebSite',
          name: 'STRIDE',
          url: 'https://cloudd3r.eu.cc/',
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://cloudd3r.eu.cc/catalog?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    });
  });
});

describe('buildCatalogItemListJsonLd', () => {
  it('builds an ItemList for visible catalog products', () => {
    const itemList = buildCatalogItemListJsonLd([
      {
        slug: 'daily-mesh',
        name: 'STRIDE Daily Mesh',
        imageUrl: '/products/nike-air-max-270.jpeg',
        minPrice: 6990,
        soldOut: false,
      },
    ], new URL('https://cloudd3r.eu.cc'));

    expect(itemList).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          url: 'https://cloudd3r.eu.cc/product/daily-mesh',
          item: {
            '@type': 'Product',
            name: 'STRIDE Daily Mesh',
            image: 'https://cloudd3r.eu.cc/products/nike-air-max-270.jpeg',
            offers: {
              '@type': 'Offer',
              priceCurrency: 'RUB',
              price: 6990,
              availability: 'https://schema.org/InStock',
            },
          },
        },
      ],
    });
  });
});

describe('buildBreadcrumbListJsonLd', () => {
  it('builds absolute breadcrumb items', () => {
    const breadcrumbs = buildBreadcrumbListJsonLd([
      { name: 'Главная', url: '/' },
      { name: 'Каталог', url: '/catalog' },
      { name: 'Беговые', url: '/catalog?category=running' },
      { name: 'STRIDE Daily Mesh', url: '/product/daily-mesh' },
    ], new URL('https://cloudd3r.eu.cc'));

    expect(breadcrumbs).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
    });
    expect(breadcrumbs.itemListElement).toHaveLength(4);
    expect(breadcrumbs.itemListElement[0]).toMatchObject(
      { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://cloudd3r.eu.cc/' },
    );
    expect(breadcrumbs.itemListElement[3]).toMatchObject(
      { '@type': 'ListItem', position: 4, name: 'STRIDE Daily Mesh', item: 'https://cloudd3r.eu.cc/product/daily-mesh' },
    );
  });
});

describe('buildProductJsonLd', () => {
  it('builds portfolio-safe product schema with complete aggregate offer fields', () => {
    const product = buildProductJsonLd({
      name: 'STRIDE Daily Mesh',
      description: 'Доступные повседневные кроссовки.',
      images: ['/products/nike-air-max-270.jpeg'],
      variants: [
        { price: 6990, stock: 4, active: true },
        { price: 7990, stock: 0, active: true },
        { price: 8990, stock: 1, active: false },
      ],
      url: '/product/daily-mesh?color=black',
    }, new URL('https://cloudd3r.eu.cc'));

    expect(product).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'STRIDE Daily Mesh',
      image: ['https://cloudd3r.eu.cc/products/nike-air-max-270.jpeg'],
      brand: { '@type': 'Brand', name: 'STRIDE' },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        lowPrice: 6990,
        highPrice: 7990,
        offerCount: 2,
        url: 'https://cloudd3r.eu.cc/product/daily-mesh?color=black',
      },
    });
  });

  it('uses all product variants so color selection does not hide active offers', () => {
    const product = buildProductJsonLd({
      name: 'STRIDE Daily Mesh',
      images: ['/products/nike-air-max-270.jpeg'],
      variants: [
        { price: 0, stock: 0, active: false },
        { price: 6990, stock: 0, active: true },
        { price: 9990, stock: 3, active: true },
      ],
      url: '/product/daily-mesh',
    }, new URL('https://cloudd3r.eu.cc'));

    expect(product.offers).toMatchObject({
      lowPrice: 6990,
      highPrice: 9990,
      offerCount: 2,
      availability: 'https://schema.org/InStock',
    });
  });
});
