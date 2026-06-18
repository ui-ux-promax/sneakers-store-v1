import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma-client';
import { absoluteUrl, getSiteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const products = await prisma.product.findMany({ where: { active: true }, select: { slug: true, createdAt: true } });
  const fallbackLastModified = new Date();
  const contentLastModified = products.reduce<Date | null>(
    (latest, product) => (!latest || product.createdAt > latest ? product.createdAt : latest),
    null,
  ) ?? fallbackLastModified;
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl.toString(), lastModified: contentLastModified, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/catalog', siteUrl), lastModified: contentLastModified, changeFrequency: 'daily', priority: 0.9 },
  ];
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: absoluteUrl(`/product/${p.slug}`, siteUrl), lastModified: p.createdAt, changeFrequency: 'weekly', priority: 0.8,
  }));
  return [...staticRoutes, ...productRoutes];
}
