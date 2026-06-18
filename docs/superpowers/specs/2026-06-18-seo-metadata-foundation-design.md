# SEO Metadata Foundation Design

## Goal

Fix the first SEO audit pass without touching database data, product brand policy, or visual layout.

## Scope

- Add a single site origin helper based on `NEXT_PUBLIC_SITE_URL`, falling back to `http://localhost:3000`.
- Make root metadata produce absolute canonical, Open Graph, and Twitter defaults.
- Give `/catalog` its own description and canonical.
- Make product metadata include canonical, Open Graph, and Twitter using the primary product image.
- Make Product JSON-LD image URLs absolute.
- Remove `/cart` from the sitemap and add `lastModified` to static and product sitemap entries.

## Out Of Scope

- Do not change `Product.brand` seed data.
- Do not add Organization, WebSite, BreadcrumbList, or ItemList schema in this pass.
- Do not attempt the desktop CLS fix until it is re-measured.
- Do not run local Prisma push, seed, or e2e.

## Testing

Use a small unit-tested SEO helper for origin and absolute URL behavior. Verify the full app with typecheck and build from `stride-app`.
