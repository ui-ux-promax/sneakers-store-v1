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
