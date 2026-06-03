const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return null;
  return e;
}
