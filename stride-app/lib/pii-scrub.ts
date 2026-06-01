const PII_FIELD_NAMES = new Set([
  'phone', 'email', 'address', 'password', 'fullName', 'firstName', 'lastName',
  'cardNumber', 'token', 'secret',
]);
const REDACTED = '[redacted]';

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return REDACTED;
  return `[redacted-${email.slice(at + 1)}]`;
}
function maskPhone(phone: string): string {
  if (phone.length < 4) return REDACTED;
  return `***${phone.slice(-4)}`;
}

export function scrubPii(obj: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (PII_FIELD_NAMES.has(key) || PII_FIELD_NAMES.has(lower)) {
      if (typeof value === 'string') {
        if (lower === 'email') obj[key] = maskEmail(value);
        else if (lower === 'phone') obj[key] = maskPhone(value);
        else obj[key] = REDACTED;
      }
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scrubPii(value as Record<string, unknown>);
    }
  }
  return obj;
}
