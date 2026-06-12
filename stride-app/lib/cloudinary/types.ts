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
