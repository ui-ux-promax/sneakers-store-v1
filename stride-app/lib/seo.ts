export const siteName = 'STRIDE';
export const defaultSeoTitle = 'STRIDE - кроссовки';
export const defaultSeoDescription = 'Кроссовки STRIDE: беговые, лайфстайл, платформы. Доставка по России.';
export const catalogSeoDescription = 'Каталог кроссовок STRIDE: беговые, лайфстайл и платформы с фильтрами по размеру, цвету и цене.';
export const defaultOgImage = '/products/Professional_product_photography_of_white_202605311739.png';

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000');
}

export function absoluteUrl(pathOrUrl: string, base = getSiteUrl()): string {
  return new URL(pathOrUrl, base).toString();
}

export function buildStorefrontJsonLd(base = getSiteUrl()) {
  const logo = absoluteUrl(defaultOgImage, base);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization', base),
        name: siteName,
        url: base.toString(),
        logo,
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website', base),
        name: siteName,
        url: base.toString(),
        publisher: { '@id': absoluteUrl('/#organization', base) },
        potentialAction: {
          '@type': 'SearchAction',
          target: absoluteUrl('/catalog?q={search_term_string}', base),
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

export function buildCatalogItemListJsonLd(
  products: Array<{
    slug: string;
    name: string;
    imageUrl: string | null;
    minPrice: number;
    soldOut: boolean;
  }>,
  base = getSiteUrl(),
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/product/${product.slug}`, base),
      item: {
        '@type': 'Product',
        name: product.name,
        ...(product.imageUrl ? { image: absoluteUrl(product.imageUrl, base) } : {}),
        brand: { '@type': 'Brand', name: siteName },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'RUB',
          price: product.minPrice,
          availability: product.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: absoluteUrl(`/product/${product.slug}`, base),
        },
      },
    })),
  };
}

export function buildBreadcrumbListJsonLd(
  items: Array<{ name: string; url: string }>,
  base = getSiteUrl(),
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url, base),
    })),
  };
}

export function buildProductJsonLd(
  product: {
    name: string;
    description?: string | null;
    images: string[];
    variants: Array<{ price: number; stock: number; active: boolean }>;
    url: string;
    rating?: { value: number; count: number } | null;
  },
  base = getSiteUrl(),
) {
  const activeVariants = product.variants.filter((variant) => variant.active);
  const prices = activeVariants.map((variant) => variant.price);
  const lowPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const highPrice = prices.length > 0 ? Math.max(...prices) : lowPrice;
  const inStock = activeVariants.some((variant) => variant.stock > 0);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images.map((image) => absoluteUrl(image, base)),
    description: product.description ?? undefined,
    brand: { '@type': 'Brand', name: siteName },
    ...(product.rating && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.value.toFixed(1),
            reviewCount: product.rating.count,
          },
        }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'RUB',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      lowPrice,
      highPrice,
      offerCount: activeVariants.length,
      url: absoluteUrl(product.url, base),
    },
  };
}
