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
