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
