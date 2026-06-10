import { auth } from '@/auth';
import { readPending } from '@/lib/verification/pending-cookie';
import { VerificationGate } from './verification-gate';

// Показываем неубираемый гейт, только если есть pending-cookie И нет активной сессии.
// Серверный компонент — читает cookie и сессию на сервере, переживает reload.
export async function VerificationGateHost() {
  const [session, pending] = await Promise.all([auth(), readPending()]);
  if (session?.user || !pending) return null;
  return <VerificationGate email={pending.email} callbackUrl={pending.callbackUrl} />;
}
