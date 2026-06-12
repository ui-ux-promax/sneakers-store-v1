# Phase 3.1 — Cloudinary Media Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Cloudinary media foundation for the admin — signed direct-to-Cloudinary upload, sign/delete API routes, an `<ImageUploader>` component, and an isomorphic transform-URL builder — with no Prisma schema changes.

**Architecture:** Client validates a file, asks `/api/admin/media/sign` (admin-gated) for a server-built signature, then uploads the file **directly** to Cloudinary (bypassing Vercel's ~4.5 MB body limit). Cloudinary returns metadata, which the component bubbles up via `onChange`. Deletion is best-effort via `/api/admin/media/delete`. The signature is a pure `node:crypto` SHA-1 over sorted params + `api_secret`; the SDK is used only for `destroy`. Without env, routes return `503` and the uploader renders a disabled state (fail-soft, mirroring P2.3 rate-limit).

**Tech Stack:** Next.js 15 App Router (route handlers), Auth.js v5 gate (`requireAdminApi`), zod, `cloudinary` SDK (server-only), `node:crypto`, Tailwind admin tokens + existing admin primitives (`Button`, `Icon`), vitest (node-only).

**Branch:** `feat/phase3.1-cloudinary-media` (already created from `feat/phase3.0-admin-foundation` HEAD; spec committed as `65b355a`).

**Spec:** `docs/superpowers/specs/2026-06-12-stride-phase3.1-cloudinary-design.md`

**Conventions:** commit messages English, single author, no `Co-Authored-By`. All commands run from `stride-app/`. Do NOT run prisma/db/e2e locally (Neon hang on Windows) — schema is untouched anyway.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `stride-app/lib/cloudinary/types.ts` | `UploadedImage` interface, `TransformPreset` type |
| `stride-app/lib/cloudinary/validate.ts` | `validateImageFile`, `ALLOWED_FORMATS`, `MAX_FILE_BYTES` (pure, client+server) |
| `stride-app/lib/cloudinary/sign.ts` | `buildUploadSignature` (pure `node:crypto` SHA-1) |
| `stride-app/lib/cloudinary/url.ts` | `buildImageUrl` + preset table (isomorphic) |
| `stride-app/lib/cloudinary/config.ts` | env helpers: `getCloudinaryEnv`, `isCloudinaryConfigured` (no SDK import) |
| `stride-app/lib/cloudinary/server.ts` | `deleteAsset` via SDK `uploader.destroy` (server-only) |
| `stride-app/app/api/admin/media/sign/route.ts` | POST, admin-gated, returns signature; `503` fail-soft |
| `stride-app/app/api/admin/media/delete/route.ts` | POST, admin-gated, best-effort destroy; `503` fail-soft |
| `stride-app/components/admin/media/image-preview-card.tsx` | One preview card: image (thumb), alt input, delete, move |
| `stride-app/components/admin/media/image-uploader.tsx` | Drop-zone + upload flow + preview grid (`'use client'`) |
| `stride-app/components/admin/media/uploader-demo.tsx` | Client island holding demo state (`'use client'`) |
| `stride-app/app/(admin)/admin/catalog/page.tsx` | MODIFY: replace stub body with live demo section |
| `stride-app/tests/cloudinary-validate.test.ts` | validate unit tests |
| `stride-app/tests/cloudinary-sign.test.ts` | signature determinism tests |
| `stride-app/tests/cloudinary-url.test.ts` | URL builder tests |
| `stride-app/tests/cloudinary-config.test.ts` | env-helper tests (`vi.stubEnv`) |
| `stride-app/tests/cloudinary-server.test.ts` | `deleteAsset` tests (mock SDK) |
| `stride-app/tests/media-sign-route.test.ts` | sign-route gate/zod/503/happy |
| `stride-app/tests/media-delete-route.test.ts` | delete-route gate/zod/503/happy/best-effort |

**Note on reorder:** the uploader manages `sortOrder` via move ←/→ buttons (not HTML5 drag-and-drop) — fully specifiable, no new dependency. Full DnD is deferred to consumers if ever needed.

---

## Task 1: Project setup (dependency, env, next.config)

**Files:**
- Modify: `stride-app/package.json` (via npm install)
- Modify: `stride-app/next.config.mjs:6`
- Modify: `stride-app/.env.example` (create if absent)

- [ ] **Step 1: Install the Cloudinary SDK**

Run (from `stride-app/`):
```bash
npm install cloudinary@^2
```
Expected: `package.json` `dependencies` gains `"cloudinary": "^2.x"`. (This is a plain npm package install — safe locally, unrelated to Neon.)

- [ ] **Step 2: Mark `cloudinary` as a server-external package**

In `stride-app/next.config.mjs`, edit line 6 to append `'cloudinary'` to the `serverExternalPackages` array:
```js
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-neon', '@neondatabase/serverless', 'ws', '@upstash/ratelimit', '@upstash/redis', 'cloudinary'],
```

- [ ] **Step 3: Document env vars in `.env.example`**

Append to `stride-app/.env.example` (create the file if it does not exist):
```bash

# Cloudinary (Phase 3.1 media foundation). Without these, upload/delete fail-soft (503) and the uploader is disabled.
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

- [ ] **Step 4: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: exits 0 (no new files yet; install + config edits don't break types).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.mjs .env.example
git commit -m "chore(media): add cloudinary dep, server-external, env example"
```

---

## Task 2: Types and file validation

**Files:**
- Create: `stride-app/lib/cloudinary/types.ts`
- Create: `stride-app/lib/cloudinary/validate.ts`
- Test: `stride-app/tests/cloudinary-validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/cloudinary-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateImageFile, ALLOWED_FORMATS, MAX_FILE_BYTES } from '@/lib/cloudinary/validate';

describe('validateImageFile', () => {
  it('accepts a normal jpeg under the limit', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toEqual({ ok: true });
  });

  it.each(ALLOWED_FORMATS)('accepts allowed format %s', (type) => {
    expect(validateImageFile({ type, size: 1024 })).toEqual({ ok: true });
  });

  it('rejects a disallowed format (gif)', () => {
    const r = validateImageFile({ type: 'image/gif', size: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/формат/i);
  });

  it('rejects a file over the size limit', () => {
    const r = validateImageFile({ type: 'image/png', size: MAX_FILE_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/МБ/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_FILE_BYTES })).toEqual({ ok: true });
  });

  it('rejects an empty file', () => {
    const r = validateImageFile({ type: 'image/png', size: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/пуст/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloudinary-validate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cloudinary/validate'`.

- [ ] **Step 3: Create the types file**

Create `stride-app/lib/cloudinary/types.ts`:
```ts
/** Normalized metadata returned by a successful Cloudinary upload. Consumers persist this. */
export interface UploadedImage {
  publicId: string;
  url: string; // secure_url (original)
  width: number;
  height: number;
  format: string;
  bytes: number;
  alt?: string;
}

/** Named delivery transforms used by the URL builder. */
export type TransformPreset = 'thumb' | 'card' | 'full';
```

- [ ] **Step 4: Create the validation file**

Create `stride-app/lib/cloudinary/validate.ts`:
```ts
export const ALLOWED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Pure file-shape validation, shared by client (pre-upload) and any server-side check. */
export function validateImageFile(file: { type: string; size: number }): ValidationResult {
  if (!(ALLOWED_FORMATS as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Недопустимый формат. Разрешены JPEG, PNG, WebP, AVIF.' };
  }
  if (file.size === 0) {
    return { ok: false, error: 'Файл пустой.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'Файл больше 10 МБ.' };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/cloudinary-validate.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add lib/cloudinary/types.ts lib/cloudinary/validate.ts tests/cloudinary-validate.test.ts
git commit -m "feat(media): image metadata types and file validation"
```

---

## Task 3: Upload signature (pure crypto)

**Files:**
- Create: `stride-app/lib/cloudinary/sign.ts`
- Test: `stride-app/tests/cloudinary-sign.test.ts`

Cloudinary signed-upload algorithm: take the params to sign, sort keys alphabetically, join as `k=v` with `&`, append the `api_secret`, SHA-1, hex-encode.

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/cloudinary-sign.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildUploadSignature } from '@/lib/cloudinary/sign';

const SECRET = 'test_secret';

function expected(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + SECRET).digest('hex');
}

describe('buildUploadSignature', () => {
  it('is deterministic for fixed params + secret', () => {
    const params = { folder: 'stride/uploads', timestamp: 1700000000 };
    const sig = buildUploadSignature(params, SECRET);
    expect(sig).toBe(expected(params));
  });

  it('is independent of key insertion order (params get sorted)', () => {
    const a = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    const b = buildUploadSignature({ timestamp: 1, folder: 'f' }, SECRET);
    expect(a).toBe(b);
  });

  it('changes when a param value changes', () => {
    const a = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    const b = buildUploadSignature({ folder: 'f', timestamp: 2 }, SECRET);
    expect(a).not.toBe(b);
  });

  it('returns a 40-char hex string (sha1)', () => {
    const sig = buildUploadSignature({ folder: 'f', timestamp: 1 }, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloudinary-sign.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cloudinary/sign'`.

- [ ] **Step 3: Implement the signature function**

Create `stride-app/lib/cloudinary/sign.ts`:
```ts
import { createHash } from 'node:crypto';

/**
 * Build a Cloudinary signed-upload signature.
 * Algorithm: sort param keys, join as `k=v` with `&`, append api_secret, SHA-1 hex.
 * Only the params passed here are signed — the caller controls exactly what is signable.
 */
export function buildUploadSignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cloudinary-sign.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cloudinary/sign.ts tests/cloudinary-sign.test.ts
git commit -m "feat(media): pure crypto cloudinary upload signature"
```

---

## Task 4: Transform URL builder

**Files:**
- Create: `stride-app/lib/cloudinary/url.ts`
- Test: `stride-app/tests/cloudinary-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/cloudinary-url.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildImageUrl, TRANSFORM_PRESETS } from '@/lib/cloudinary/url';

const CLOUD = 'demo-cloud';

describe('buildImageUrl', () => {
  it('builds a thumb URL with f_auto,q_auto', () => {
    const url = buildImageUrl('stride/uploads/abc', 'thumb', CLOUD);
    expect(url).toBe(
      'https://res.cloudinary.com/demo-cloud/image/upload/c_fill,w_160,h_160,f_auto,q_auto/stride/uploads/abc',
    );
  });

  it('builds a card URL', () => {
    const url = buildImageUrl('abc', 'card', CLOUD);
    expect(url).toContain('/image/upload/c_fill,w_640,h_480,f_auto,q_auto/abc');
  });

  it('builds a full URL with c_limit', () => {
    const url = buildImageUrl('abc', 'full', CLOUD);
    expect(url).toContain('/image/upload/c_limit,w_1600,f_auto,q_auto/abc');
  });

  it('every preset includes f_auto and q_auto', () => {
    for (const t of Object.values(TRANSFORM_PRESETS)) {
      expect(t).toContain('f_auto');
      expect(t).toContain('q_auto');
    }
  });

  it('falls back to NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME when cloudName omitted', () => {
    const prev = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'env-cloud';
    try {
      expect(buildImageUrl('abc', 'thumb')).toContain('res.cloudinary.com/env-cloud/');
    } finally {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = prev;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloudinary-url.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cloudinary/url'`.

- [ ] **Step 3: Implement the URL builder**

Create `stride-app/lib/cloudinary/url.ts`:
```ts
import type { TransformPreset } from './types';

/** Named delivery transforms. f_auto/q_auto let Cloudinary pick format (WebP/AVIF) and quality. */
export const TRANSFORM_PRESETS: Record<TransformPreset, string> = {
  thumb: 'c_fill,w_160,h_160,f_auto,q_auto',
  card: 'c_fill,w_640,h_480,f_auto,q_auto',
  full: 'c_limit,w_1600,f_auto,q_auto',
};

/**
 * Build a delivery URL for a stored public_id at a named preset.
 * Isomorphic and pure: cloudName comes from the arg, else NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.
 */
export function buildImageUrl(
  publicId: string,
  preset: TransformPreset,
  cloudName?: string,
): string {
  const cloud = cloudName ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
  return `https://res.cloudinary.com/${cloud}/image/upload/${TRANSFORM_PRESETS[preset]}/${publicId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cloudinary-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cloudinary/url.ts tests/cloudinary-url.test.ts
git commit -m "feat(media): isomorphic cloudinary transform URL builder"
```

---

## Task 5: Config / env helpers

**Files:**
- Create: `stride-app/lib/cloudinary/config.ts`
- Test: `stride-app/tests/cloudinary-config.test.ts`

Env is read at call-time (functions, not import-time constants) so `vi.stubEnv` can drive tests. No SDK import here.

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/cloudinary-config.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getCloudinaryEnv, isCloudinaryConfigured } from '@/lib/cloudinary/config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCloudinaryConfigured', () => {
  it('false when all env vars are empty', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', '');
    vi.stubEnv('CLOUDINARY_API_KEY', '');
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it('false when only some are present', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'c');
    vi.stubEnv('CLOUDINARY_API_KEY', 'k');
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it('true when all three are present', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'c');
    vi.stubEnv('CLOUDINARY_API_KEY', 'k');
    vi.stubEnv('CLOUDINARY_API_SECRET', 's');
    expect(isCloudinaryConfigured()).toBe(true);
  });
});

describe('getCloudinaryEnv', () => {
  it('returns the current env values', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'cc');
    vi.stubEnv('CLOUDINARY_API_KEY', 'kk');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'ss');
    expect(getCloudinaryEnv()).toEqual({ cloudName: 'cc', apiKey: 'kk', apiSecret: 'ss' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloudinary-config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cloudinary/config'`.

- [ ] **Step 3: Implement config helpers**

Create `stride-app/lib/cloudinary/config.ts`:
```ts
/** Cloudinary env, read at call-time so it reflects runtime config (and is stub-able in tests). */
export function getCloudinaryEnv() {
  return {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

/** True only when cloud name + key + secret are all present. Drives fail-soft behaviour. */
export function isCloudinaryConfigured(): boolean {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  return Boolean(cloudName && apiKey && apiSecret);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cloudinary-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cloudinary/config.ts tests/cloudinary-config.test.ts
git commit -m "feat(media): cloudinary env config helpers (fail-soft flag)"
```

---

## Task 6: Server-side delete (`deleteAsset`)

**Files:**
- Create: `stride-app/lib/cloudinary/server.ts`
- Test: `stride-app/tests/cloudinary-server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/cloudinary-server.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const destroyMock = vi.fn();
const configMock = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => configMock(...args),
    uploader: { destroy: (...args: unknown[]) => destroyMock(...args) },
  },
}));

vi.mock('@/lib/cloudinary/config', () => ({
  getCloudinaryEnv: () => ({ cloudName: 'c', apiKey: 'k', apiSecret: 's' }),
}));

import { deleteAsset } from '@/lib/cloudinary/server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteAsset', () => {
  it('returns ok:true when Cloudinary reports result "ok"', async () => {
    destroyMock.mockResolvedValue({ result: 'ok' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: true });
    expect(destroyMock).toHaveBeenCalledWith('pid');
  });

  it('treats "not found" as ok (idempotent delete)', async () => {
    destroyMock.mockResolvedValue({ result: 'not found' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: true });
  });

  it('returns ok:false on any other result', async () => {
    destroyMock.mockResolvedValue({ result: 'error' });
    await expect(deleteAsset('pid')).resolves.toEqual({ ok: false });
  });

  it('configures the SDK before destroying', async () => {
    destroyMock.mockResolvedValue({ result: 'ok' });
    await deleteAsset('pid');
    expect(configMock).toHaveBeenCalledWith({
      cloud_name: 'c',
      api_key: 'k',
      api_secret: 's',
      secure: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloudinary-server.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cloudinary/server'`.

- [ ] **Step 3: Implement the server module**

Create `stride-app/lib/cloudinary/server.ts`:
```ts
import { v2 as cloudinary } from 'cloudinary';
import { getCloudinaryEnv } from './config';

function configured() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return cloudinary;
}

/** Delete an asset by public_id. "not found" counts as success (idempotent). */
export async function deleteAsset(publicId: string): Promise<{ ok: boolean }> {
  const c = configured();
  const res = await c.uploader.destroy(publicId);
  return { ok: res.result === 'ok' || res.result === 'not found' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cloudinary-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cloudinary/server.ts tests/cloudinary-server.test.ts
git commit -m "feat(media): server-side cloudinary deleteAsset"
```

---

## Task 7: Sign route (`POST /api/admin/media/sign`)

**Files:**
- Create: `stride-app/app/api/admin/media/sign/route.ts`
- Test: `stride-app/tests/media-sign-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/media-sign-route.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/cloudinary/config', () => ({
  isCloudinaryConfigured: vi.fn(),
  getCloudinaryEnv: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/admin/media/sign/route';
import { auth } from '@/auth';
import { isCloudinaryConfigured, getCloudinaryEnv } from '@/lib/cloudinary/config';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const configuredMock = isCloudinaryConfigured as unknown as ReturnType<typeof vi.fn>;
const envMock = getCloudinaryEnv as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request('http://test/api/admin/media/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configuredMock.mockReturnValue(true);
  envMock.mockReturnValue({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
});

describe('POST /api/admin/media/sign', () => {
  it('anon → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(401);
  });

  it('CUSTOMER → 403', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(403);
  });

  it('ADMIN but not configured → 503', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    configuredMock.mockReturnValue(false);
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(503);
  });

  it('ADMIN + disallowed folder → 400', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ folder: 'hacker/evil' }));
    expect(res.status).toBe(400);
  });

  it('ADMIN + valid → 200 with signature payload', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ folder: 'stride/uploads' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ apiKey: 'k', cloudName: 'c', folder: 'stride/uploads' });
    expect(typeof body.signature).toBe('string');
    expect(body.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof body.timestamp).toBe('number');
  });

  it('ADMIN + empty body → defaults to stride/uploads → 200', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folder).toBe('stride/uploads');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-sign-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/media/sign/route'`.

- [ ] **Step 3: Implement the sign route**

Create `stride-app/app/api/admin/media/sign/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/admin/require-admin';
import { apiError, apiZodError, apiInternalError } from '@/lib/admin/api-error';
import { isCloudinaryConfigured, getCloudinaryEnv } from '@/lib/cloudinary/config';
import { buildUploadSignature } from '@/lib/cloudinary/sign';

// Folders the admin may sign uploads into. Consumers (3.2/3.3) extend this list.
const ALLOWED_FOLDERS = ['stride/uploads'] as const;
const DEFAULT_FOLDER = 'stride/uploads';

const bodySchema = z.object({ folder: z.string().optional() });

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  if (!isCloudinaryConfigured()) {
    return apiError('Cloudinary не настроен', 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiZodError(parsed.error);

  const folder = parsed.data.folder ?? DEFAULT_FOLDER;
  if (!(ALLOWED_FOLDERS as readonly string[]).includes(folder)) {
    return apiError('Недопустимая папка', 400);
  }

  try {
    const { apiKey, apiSecret, cloudName } = getCloudinaryEnv();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = buildUploadSignature({ folder, timestamp }, apiSecret as string);
    return NextResponse.json({ signature, timestamp, apiKey, cloudName, folder });
  } catch (err) {
    return apiInternalError('media_sign', err);
  }
}

export const dynamic = 'force-dynamic';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-sign-route.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/media/sign/route.ts tests/media-sign-route.test.ts
git commit -m "feat(media): admin-gated cloudinary sign route"
```

---

## Task 8: Delete route (`POST /api/admin/media/delete`)

**Files:**
- Create: `stride-app/app/api/admin/media/delete/route.ts`
- Test: `stride-app/tests/media-delete-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/media-delete-route.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/cloudinary/config', () => ({ isCloudinaryConfigured: vi.fn() }));
vi.mock('@/lib/cloudinary/server', () => ({ deleteAsset: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/admin/media/delete/route';
import { auth } from '@/auth';
import { isCloudinaryConfigured } from '@/lib/cloudinary/config';
import { deleteAsset } from '@/lib/cloudinary/server';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const configuredMock = isCloudinaryConfigured as unknown as ReturnType<typeof vi.fn>;
const deleteMock = deleteAsset as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request('http://test/api/admin/media/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configuredMock.mockReturnValue(true);
  deleteMock.mockResolvedValue({ ok: true });
});

describe('POST /api/admin/media/delete', () => {
  it('anon → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ publicId: 'p' }));
    expect(res.status).toBe(401);
  });

  it('CUSTOMER → 403', async () => {
    authMock.mockResolvedValue({ user: { role: 'CUSTOMER' } });
    const res = await POST(req({ publicId: 'p' }));
    expect(res.status).toBe(403);
  });

  it('ADMIN not configured → 503', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    configuredMock.mockReturnValue(false);
    const res = await POST(req({ publicId: 'p' }));
    expect(res.status).toBe(503);
  });

  it('ADMIN + missing publicId → 400', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('ADMIN + valid → 200 { ok:true } and calls deleteAsset', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    const res = await POST(req({ publicId: 'stride/uploads/x' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith('stride/uploads/x');
  });

  it('deleteAsset throws → 200 { ok:false } (best-effort, not blocking)', async () => {
    authMock.mockResolvedValue({ user: { role: 'ADMIN' } });
    deleteMock.mockRejectedValue(new Error('cloudinary down'));
    const res = await POST(req({ publicId: 'p' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-delete-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/media/delete/route'`.

- [ ] **Step 3: Implement the delete route**

Create `stride-app/app/api/admin/media/delete/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/admin/require-admin';
import { apiError, apiZodError } from '@/lib/admin/api-error';
import { isCloudinaryConfigured } from '@/lib/cloudinary/config';
import { deleteAsset } from '@/lib/cloudinary/server';
import { logger } from '@/lib/logger';

const bodySchema = z.object({ publicId: z.string().min(1) });

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  if (!isCloudinaryConfigured()) {
    return apiError('Cloudinary не настроен', 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiZodError(parsed.error);

  // Best-effort: a failed delete must not block the UI (the image is already removed from state).
  try {
    const result = await deleteAsset(parsed.data.publicId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('media_delete_failed', err, { publicId: parsed.data.publicId });
    return NextResponse.json({ ok: false });
  }
}

export const dynamic = 'force-dynamic';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-delete-route.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/media/delete/route.ts tests/media-delete-route.test.ts
git commit -m "feat(media): admin-gated best-effort cloudinary delete route"
```

---

## Task 9: ImageUploader component (no unit test — manual verify)

**Files:**
- Create: `stride-app/components/admin/media/image-preview-card.tsx`
- Create: `stride-app/components/admin/media/image-uploader.tsx`

UI is not unit-tested (vitest is node-only by convention); it is verified manually via the demo in Task 10.

- [ ] **Step 1: Create the preview card**

Create `stride-app/components/admin/media/image-preview-card.tsx`:
```tsx
'use client';

import * as React from 'react';
import { Icon } from '@/components/admin/icon';
import { buildImageUrl } from '@/lib/cloudinary/url';
import type { UploadedImage } from '@/lib/cloudinary/types';

interface ImagePreviewCardProps {
  image: UploadedImage;
  index: number;
  total: number;
  onRemove: (index: number) => void;
  onAltChange: (index: number, alt: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}

export function ImagePreviewCard({
  image,
  index,
  total,
  onRemove,
  onAltChange,
  onMove,
}: ImagePreviewCardProps) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-2 flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- preview only, not LCP */}
      <img
        src={buildImageUrl(image.publicId, 'thumb')}
        alt={image.alt ?? ''}
        width={160}
        height={160}
        className="w-full aspect-square object-cover rounded-lg bg-admin-surface-high"
      />
      <input
        type="text"
        value={image.alt ?? ''}
        onChange={(e) => onAltChange(index, e.target.value)}
        placeholder="alt-текст"
        className="w-full text-xs bg-admin-surface border border-admin-outline-variant rounded-md px-2 py-1 text-admin-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Сдвинуть влево"
            className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            aria-label="Сдвинуть вправо"
            className="text-admin-on-surface-variant hover:text-admin-on-surface disabled:opacity-30"
          >
            <Icon name="chevron_right" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label="Удалить"
          className="text-admin-error hover:opacity-80"
        >
          <Icon name="delete" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the uploader**

Create `stride-app/components/admin/media/image-uploader.tsx`:
```tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { validateImageFile } from '@/lib/cloudinary/validate';
import type { UploadedImage } from '@/lib/cloudinary/types';
import { ImagePreviewCard } from './image-preview-card';

interface ImageUploaderProps {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  folder?: string;
  max?: number;
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export function ImageUploader({
  value,
  onChange,
  folder = 'stride/uploads',
  max = 8,
}: ImageUploaderProps) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const disabled = !CLOUD_NAME;
  const full = value.length >= max;

  async function uploadOne(file: File): Promise<UploadedImage> {
    const signRes = await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({}));
      throw new Error(body.message ?? 'Не удалось получить подпись загрузки');
    }
    const { signature, timestamp, apiKey, cloudName, folder: signedFolder } = await signRes.json();

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', signedFolder);
    form.append('signature', signature);

    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!upRes.ok) {
      const body = await upRes.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? 'Cloudinary отклонил загрузку');
    }
    const data = await upRes.json();
    return {
      publicId: data.public_id,
      url: data.secure_url,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = max - value.length;
    const picked = Array.from(files).slice(0, remaining);

    for (const f of picked) {
      const v = validateImageFile({ type: f.type, size: f.size });
      if (!v.ok) {
        setError(v.error);
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: UploadedImage[] = [];
      for (const f of picked) {
        uploaded.push(await uploadOne(f));
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove(index: number) {
    const img = value[index];
    onChange(value.filter((_, i) => i !== index));
    // Best-effort delete from Cloudinary; ignore the outcome (covers the basic orphan case).
    void fetch('/api/admin/media/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId: img.publicId }),
    }).catch(() => {});
  }

  function handleMove(index: number, dir: -1 | 1) {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function handleAltChange(index: number, alt: string) {
    onChange(value.map((img, i) => (i === index ? { ...img, alt } : img)));
  }

  if (disabled) {
    return (
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 text-admin-on-surface-variant text-sm">
        Cloudinary не настроен. Задайте NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY и
        CLOUDINARY_API_SECRET, чтобы включить загрузку изображений.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading && !full) handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-admin-outline-variant rounded-xl p-6 flex flex-col items-center gap-3 text-admin-on-surface-variant"
      >
        <Icon name="cloud_upload" className="text-4xl" />
        <p className="text-sm">Перетащите изображения сюда или выберите файлы</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          disabled={full}
          onClick={() => inputRef.current?.click()}
        >
          {full ? `Достигнут лимит (${max})` : 'Выбрать файлы'}
        </Button>
      </div>

      {error && <p className="text-sm text-admin-error">{error}</p>}

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {value.map((img, i) => (
            <ImagePreviewCard
              key={img.publicId}
              image={img}
              index={i}
              total={value.length}
              onRemove={handleRemove}
              onAltChange={handleAltChange}
              onMove={handleMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/admin/media/image-preview-card.tsx components/admin/media/image-uploader.tsx
git commit -m "feat(media): ImageUploader component with preview grid"
```

---

## Task 10: Demo on /admin/catalog (manual verify)

**Files:**
- Create: `stride-app/components/admin/media/uploader-demo.tsx`
- Modify: `stride-app/app/(admin)/admin/catalog/page.tsx`

- [ ] **Step 1: Create the demo client island**

Create `stride-app/components/admin/media/uploader-demo.tsx`:
```tsx
'use client';

import * as React from 'react';
import { ImageUploader } from './image-uploader';
import type { UploadedImage } from '@/lib/cloudinary/types';

/** Temporary harness for Phase 3.1 manual verification. Replaced by real forms in 3.2/3.3. */
export function UploaderDemo() {
  const [images, setImages] = React.useState<UploadedImage[]>([]);
  return (
    <div className="space-y-4">
      <ImageUploader value={images} onChange={setImages} folder="stride/uploads" max={8} />
      <pre className="bg-admin-surface border border-admin-outline-variant rounded-xl p-4 text-xs text-admin-on-surface-variant overflow-auto">
        {JSON.stringify(images, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Wire the demo into the catalog page**

Replace the entire contents of `stride-app/app/(admin)/admin/catalog/page.tsx` with:
```tsx
/**
 * /admin/catalog — Управление каталогом товаров
 * Заглушка. Полный CRUD — Phase 3.2 / Phase 3.3.
 * Временно: демо media-фундамента (Phase 3.1) для ручной проверки загрузки.
 */

import { Heading } from '@/components/admin/heading';
import { UploaderDemo } from '@/components/admin/media/uploader-demo';

export const metadata = { title: 'Каталог' };

export default function CatalogPage() {
  return (
    <div className="space-y-8">
      <Heading title="Каталог" description="Управление товарами" />
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 space-y-4">
        <p className="text-sm text-admin-on-surface-variant">
          Демо загрузки изображений (Phase 3.1). Полный CRUD каталога — Phase 3.2 — 3.3.
        </p>
        <UploaderDemo />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Manual verification (requires real Cloudinary env in `.env.local`)**

Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `stride-app/.env.local`, then run `npm run dev` and:
1. Sign in as an ADMIN user; open `/admin/catalog`.
2. Confirm the drop-zone renders (not the "Cloudinary не настроен" disabled state).
3. Upload a JPEG/PNG/WebP/AVIF < 10 MB → it appears as a thumbnail; the JSON dump shows `publicId`, `url`, `width`, `height`, `format`, `bytes`.
4. Try a `.gif` or a > 10 MB file → inline validation error, no upload.
5. Edit alt text → reflected in the JSON dump.
6. Move ←/→ → order changes in the dump.
7. Delete a card → it disappears; check the Cloudinary Media Library that the asset is gone (best-effort delete).
8. Temporarily unset the env vars and reload → disabled state with the configuration hint.

Document the result (pass/fail per step) in the PR description. If env is unavailable, note that steps 2–8 were not run and why.

- [ ] **Step 5: Commit**

```bash
git add components/admin/media/uploader-demo.tsx "app/(admin)/admin/catalog/page.tsx"
git commit -m "feat(media): live uploader demo on admin catalog page"
```

---

## Task 11: Full verification and wrap-up

**Files:** none (verification + optional docs)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: PASS — all prior suites green plus the 7 new files
(`cloudinary-validate`, `cloudinary-sign`, `cloudinary-url`, `cloudinary-config`, `cloudinary-server`, `media-sign-route`, `media-delete-route`). Note the total test count.

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint`
Expected: exits 0, or a clear "lint not configured" message (next lint may be unconfigured per repo notes — acceptable, do not block on it).

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/phase3.1-cloudinary-media
```

- [ ] **Step 5: Open a PR (web UI — `gh` CLI is not installed)**

Title: `Phase 3.1 — Cloudinary media foundation`
Body should cover: scope (reusable media foundation, no schema change), the signed direct-to-Cloudinary flow, fail-soft without env, the deferred orphan-sweep tech debt, the env vars consumers must set on Vercel, and the manual-verification results from Task 10 Step 4.

---

## Self-Review

**Spec coverage** (each spec §10 acceptance criterion → task):
1. `lib/cloudinary/{config,sign,server,url,validate,types}.ts` exist → Tasks 2–6. ✓
2. `POST /api/admin/media/sign` gated, valid signature, 503 without env → Task 7. ✓
3. `POST /api/admin/media/delete` gated, destroy, best-effort, 503 without env → Task 8. ✓
4. `<ImageUploader>` uploads direct, preview, delete, `onChange`, disabled without env → Task 9. ✓
5. Demo on /admin/catalog → Task 10. ✓
6. Vitest (validate/sign/url/routes) green; CI passes → Tasks 2–8, 11. ✓ (config + server also covered.)
7. Prisma schema unchanged → no task touches `schema.prisma`. ✓

Spec §3.4 transform presets (thumb/card/full, f_auto/q_auto) → Task 4. ✓
Spec §4 env + serverExternalPackages + fail-soft → Tasks 1, 5, 9. ✓
Spec §6 error handling (apiZodError/apiInternalError/503/best-effort) → Tasks 7, 8. ✓
Spec §8 security (api_secret server-only, gate, signed folder, zod) → Tasks 5, 7, 8. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:** `UploadedImage` fields (`publicId`, `url`, `width`, `height`, `format`, `bytes`, `alt?`) defined in Task 2 are used identically in Tasks 4, 9, 10. `buildUploadSignature(params, apiSecret)` (Task 3) called with `({ folder, timestamp }, apiSecret)` in Task 7. `buildImageUrl(publicId, preset, cloudName?)` (Task 4) called as `buildImageUrl(image.publicId, 'thumb')` in Task 9. `getCloudinaryEnv`/`isCloudinaryConfigured` (Task 5) consumed in Tasks 6, 7, 8. `deleteAsset(publicId)` (Task 6) consumed in Task 8. All consistent. ✓

**Deviation noted:** reorder via ←/→ buttons instead of HTML5 DnD (spec said "drag-reorder") — same `sortOrder` outcome, no new dependency, fully specifiable. Acceptable scope trim.
