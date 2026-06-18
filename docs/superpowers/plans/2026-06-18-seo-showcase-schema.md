# SEO Showcase Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add showcase-grade structured data for STRIDE portfolio SEO validation.

**Architecture:** Keep schema object construction in `stride-app/lib/seo.ts`, then render JSON-LD scripts from shop layout, catalog page, and product page. This keeps route components thin and makes schema behavior unit-testable.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, schema.org JSON-LD.

---

### Task 1: Structured Data Helpers

**Files:**
- Modify: `stride-app/lib/seo.ts`
- Modify: `stride-app/tests/seo.test.ts`

- [ ] Write failing tests for Organization/WebSite, ItemList, BreadcrumbList, and Product JSON-LD offer fields.
- [ ] Implement helper functions in `lib/seo.ts`.
- [ ] Run `npm.cmd run test -- tests/seo.test.ts`.

### Task 2: Page Wiring

**Files:**
- Modify: `stride-app/app/(shop)/layout.tsx`
- Modify: `stride-app/app/(shop)/catalog/page.tsx`
- Modify: `stride-app/app/(shop)/product/[slug]/page.tsx`

- [ ] Render storefront-wide `Organization` + `WebSite` JSON-LD in shop layout.
- [ ] Render catalog `ItemList` JSON-LD from current `products`.
- [ ] Render product `Product` and `BreadcrumbList` JSON-LD via helper outputs.

### Task 3: Verification

**Files:**
- No extra files.

- [ ] Run `npm.cmd run test -- tests/seo.test.ts`.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run build`.
- [ ] Review diff and push to `feat/seo-metadata-foundation` only.
