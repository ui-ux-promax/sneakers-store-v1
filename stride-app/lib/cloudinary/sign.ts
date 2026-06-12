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
