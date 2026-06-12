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
