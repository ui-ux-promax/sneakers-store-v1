import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma-client';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const products = await prisma.product.findMany({ where: { active: true }, select: { slug: true } });
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/catalog`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/cart`, changeFrequency: 'monthly', priority: 0.1 },
  ];
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.slug}`, changeFrequency: 'weekly', priority: 0.8,
  }));
  return [...staticRoutes, ...productRoutes];
}
