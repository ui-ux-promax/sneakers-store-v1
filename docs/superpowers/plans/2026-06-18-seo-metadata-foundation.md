# SEO Metadata Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the audit's first SEO metadata foundation PR without database or seed changes.

**Architecture:** Add `lib/seo.ts` as a small pure helper for the site URL, absolute URLs, and default social image. Use that helper from root metadata, catalog metadata, product metadata, JSON-LD, and sitemap. Keep page behavior unchanged.

**Tech Stack:** Next.js App Router metadata, TypeScript, Vitest.

---

### Task 1: SEO URL Helper

**Files:**
- Create: `stride-app/lib/seo.ts`
- Create: `stride-app/tests/seo.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { absoluteUrl, getSiteUrl } from '@/lib/seo';

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
```

- [ ] **Step 2: Run red test**

Run: `npm run test -- tests/seo.test.ts`

Expected: fail because `@/lib/seo` does not exist.

- [ ] **Step 3: Implement helper**

```ts
export const siteName = 'STRIDE';
export const defaultSeoTitle = 'STRIDE - кроссовки';
export const defaultSeoDescription = 'Кроссовки STRIDE: беговые, лайфстайл, платформы. Доставка по России.';
export const defaultOgImage = '/og-image.jpg';

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
}

export function absoluteUrl(pathOrUrl: string, base = getSiteUrl()): string {
  return new URL(pathOrUrl, base).toString();
}
```

- [ ] **Step 4: Run green test**

Run: `npm run test -- tests/seo.test.ts`

Expected: pass.

### Task 2: Metadata And Sitemap Wiring

**Files:**
- Modify: `stride-app/app/layout.tsx`
- Modify: `stride-app/app/(shop)/catalog/page.tsx`
- Modify: `stride-app/app/(shop)/product/[slug]/page.tsx`
- Modify: `stride-app/app/sitemap.ts`

- [ ] **Step 1: Root metadata**

Add `metadataBase`, root canonical, Open Graph, and Twitter defaults using `lib/seo.ts`.

- [ ] **Step 2: Catalog metadata**

Set unique catalog description and canonical `/catalog`.

- [ ] **Step 3: Product metadata and JSON-LD**

Select the default colorway primary image in `generateMetadata`, add absolute social images, and use absolute image URLs in Product JSON-LD.

- [ ] **Step 4: Sitemap hygiene**

Select `updatedAt` for products, add `lastModified`, and remove `/cart`.

### Task 3: Verification

**Files:**
- No extra files.

- [ ] **Step 1: Run focused tests**

Run: `npm run test -- tests/seo.test.ts`

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: pass.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: pass. Do not run Prisma push, seed, or e2e locally.
