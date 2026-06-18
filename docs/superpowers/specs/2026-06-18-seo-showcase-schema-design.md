# SEO Showcase Schema Design

## Goal

Finish a portfolio-friendly SEO showcase layer that demonstrates production e-commerce metadata without adding database work or content-heavy SEO pages.

## Scope

- Add storefront-wide `Organization` and `WebSite` JSON-LD with `SearchAction`.
- Add `/catalog` `ItemList` JSON-LD for the current product page slice.
- Add product `BreadcrumbList` JSON-LD mirroring the visible breadcrumbs.
- Enrich product `AggregateOffer` with `highPrice`, `offerCount`, and `url`.
- Emit portfolio-safe product JSON-LD brand as `STRIDE`.

## Out Of Scope

- Do not reseed or edit product brand data.
- Do not add indexed category landing pages, blog pages, backlinks, Search Console setup, or production SEO operations.
- Do not run local Prisma push, seed, or e2e.

## Testing

Structured-data builders live in `lib/seo.ts` and are covered by Vitest. Pages only pass route/product data into those helpers.
