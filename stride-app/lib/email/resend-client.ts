import { Resend } from 'resend';

// Ленивый синглтон. false = не сконфигурирован (нет ключа) — fail-friendly как rate-limit.
let client: Resend | null | false = null;

export function getResend(): Resend | null {
  if (client !== null) return client || null;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    client = false;
    return null;
  }
  client = new Resend(key);
  return client;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
