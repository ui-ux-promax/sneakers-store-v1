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
