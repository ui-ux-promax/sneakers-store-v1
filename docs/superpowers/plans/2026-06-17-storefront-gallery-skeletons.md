# Storefront: product gallery redesign + loading skeletons

**Date:** 2026-06-17 · **Branch:** `feat/storefront-gallery-skeletons` (from `main`)

## Context

Two storefront polish items requested by the user:

1. **Loading skeletons** on five routes (`/catalog`, `/product`, `/cart`, `/checkout`, `/orders/[number]`), in the same shimmer style as the admin panel. The storefront currently has **no** `loading.tsx` on any route; navigations show a blank/janky wait.
2. **Product gallery redesign.** The PDP felt like "just one image". Root causes: the seed gives **one image per colorway** (so the existing thumbnail rail stays hidden), and the hero uses `object-contain` with ~7% padding, leaving a large empty margin.

User decisions (brainstorm + prototype review):
- Gallery direction: **Variant 1 «Studio Rail»** (thumbnail rail + large hero, cursor-follow zoom). Prototypes live in `ui-designe and prototypes/prototypes-shop/product-gallery/` (3 variants + previews).
- **Image must fill the square** — bigger image / smaller margin. → hero switches to `object-cover` (edge-to-edge).
- Gallery shows **active colorway** images only (keep current architecture).
- **Zoom on**: cursor-follow on desktop, tap→lightbox on mobile.
- Photo data: **admin-only** — do NOT enrich the seed. Gallery must degrade gracefully to a single image (rail auto-hides, already handled).

## Existing building blocks to reuse (do not reinvent)

- `Skeleton` primitive — `stride-app/components/ui/skeleton.tsx` (`.skel` shimmer + `className` sizing; `.skel` engine already in `globals.css:150`, storefront-scoped, reduced-motion guarded).
- `ProductGridSkeleton` — `stride-app/components/shared/catalog/catalog-states.tsx` (reuse verbatim in `/catalog` loading).
- Current gallery — `stride-app/components/shared/product/product-gallery.tsx` is already Studio-Rail-shaped (rail + hero + Radix `Dialog` lightbox with prev/next/counter/keyboard). Enhance, don't rewrite.
- Tokens: `--color-primary` lime, `--color-surface-soft` beige, `font-display` (Unbounded), `font-sans` (Manrope), `.thumb`, `.size`, `.btn-*`.
- Image data: `getProductBySlug` (`lib/get-product.ts`) returns `colorways[].images` ordered by `sortOrder asc`. `next.config.mjs` allows `res.cloudinary.com` + local `/products/*`; next/image auto webp/avif.

## Part A — Gallery (modify `product-gallery.tsx`)

Keep the interface (`images`, `productName`, `isNew`, `discountPct`) and the Radix `Dialog` lightbox (accessible, tested). Changes only:

1. **Hero fills the square** — `object-cover` (remove the `p-[7%]`/contain padding) so the photo goes edge-to-edge inside the `rounded-[24px]` frame. Keep `priority` + correct `sizes`. (Lightbox stays `object-contain` — fullscreen must show the whole photo, no crop.)
2. **Cursor-follow zoom (desktop only)** — on `pointer:fine`/`hover:hover`, `mousemove` sets `transform-origin` to the cursor %, hover scales hero img to ~1.9. Guarded so touch devices don't trigger; tap still opens the lightbox.
3. **Thumb active polish** — active thumbnail gets the lime ring (`box-shadow 0 0 0 3px hsl(primary/.35)`) on top of the existing ink border.
4. **Single-image fallback** unchanged — rail hidden when `images.length === 1`; the one hero image now fills the frame (directly addresses the complaint).

Apply `react-best-practices` (LCP hero `priority`, stable `sizes`, no needless re-renders, handlers not recreated per thumb where avoidable).

Caveat to surface: `object-cover` crops non-square photos. Seed/full-bleed photos look great; if real admin photos are product-on-white we can flip the hero to `object-contain` with near-zero padding (one-line change).

Also update the chosen prototype (`variant-1-studio-rail.html`) hero to `object-cover` so it matches shipped behavior.

## Part B — Skeletons (5 new `loading.tsx`)

Each mirrors its page's real layout using `<Skeleton>` blocks + the page's container classes. New files:

- `app/(shop)/catalog/loading.tsx` — H1 bar + grid `md:grid-cols-[240px_1fr]`: sidebar skeleton (`hidden md:block`, filter groups) + toolbar row + **reuse `ProductGridSkeleton`**.
- `app/(shop)/product/[slug]/loading.tsx` — breadcrumb bar + grid `lg:grid-cols-[minmax(0,1fr)_440px]`: gallery skeleton (thumb-rail column + square hero) + panel skeleton (title lines, price, color label + swatch row, size grid 5–6, full-width button, fit line).
- `app/(shop)/cart/loading.tsx` — H1 + grid `lg:grid-cols-[1fr_380px]`: 2× line-item skeleton (`h-28 rounded-2xl`, matches the existing inline cart skeleton) + summary card skeleton.
- `app/(shop)/checkout/loading.tsx` — H1 + grid `lg:grid-cols-[1fr_360px]`: 4 section-card skeletons (title + field bars) + sticky summary card skeleton (lines + total + button).
- `app/(shop)/orders/[number]/loading.tsx` — `max-w-3xl`: header row (title + status-pill skeleton), date line, items list card (3 rows: 64px thumb + 2 lines + price), totals card, shipping card.

Optional: if markup repeats, extract small helpers into `components/shared/skeleton/` — but prefer inline + the existing `Skeleton`/`ProductGridSkeleton` to stay lightweight.

All skeleton roots get `aria-hidden` (decorative); Next renders them via Suspense while the segment's server work runs. Note: `/cart` is a client page with no server data, so its `loading.tsx` only flashes briefly — added for consistency; the meaningful cart spinner is the existing client `useCart` skeleton.

## Verification

- `npm run typecheck` (no DB) — must pass.
- `npm run test` (vitest, `tests/` only, no DB) — 477+ green.
- Gallery: prototype already browser-verified (desktop + mobile). React port mirrors it; visual confirm on Vercel **preview** (admin/Neon make local storefront slow — project norm is preview verification).
- Skeletons: visible on preview during navigation / slow network throttle.

## Out of scope

- No seed changes (admin-only photos).
- No changes to gallery↔colorway architecture, cart/checkout logic, or data fetching.
- Below-the-fold PDP sections (description/specs/related/reviews) get no skeleton — only the above-the-fold gallery+panel.
