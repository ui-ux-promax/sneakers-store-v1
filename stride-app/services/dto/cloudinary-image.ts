import { z } from 'zod';

const CLOUDINARY_HOST = 'res.cloudinary.com';
const ALLOWED_PUBLIC_ID_PREFIXES = ['stride/uploads/', 'stride/categories/'] as const;

function configuredCloudName(): string | undefined {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || undefined;
}

export function isAllowedCloudinaryPublicId(publicId: string | undefined): boolean {
  if (!publicId) return false;
  return ALLOWED_PUBLIC_ID_PREFIXES.some((prefix) => publicId.startsWith(prefix));
}

export function isAllowedCloudinaryImageUrl(url: string, publicId: string | undefined): boolean {
  const cloudName = configuredCloudName();
  if (!cloudName || !isAllowedCloudinaryPublicId(publicId)) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === CLOUDINARY_HOST && parsed.pathname.startsWith(`/${cloudName}/`);
  } catch {
    return false;
  }
}

export function cloudinaryImageIssue(path: (string | number)[]) {
  return {
    code: z.ZodIssueCode.custom,
    path,
    message: 'Изображение должно быть загружено через Cloudinary STRIDE',
  } as const;
}
