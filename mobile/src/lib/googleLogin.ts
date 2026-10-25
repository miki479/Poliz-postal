export interface GoogleAttempt { id: string; pollToken: string; expiresAt: number; path: string }
interface Transport {
  start(): Promise<GoogleAttempt>;
  poll(attempt: GoogleAttempt): Promise<{ status: 'pending' | 'complete' }>;
  cancel(attempt: GoogleAttempt): Promise<unknown>;
  open(path: string): Promise<{ type: string }>;
  wait(): Promise<void>;
  cancelled(): boolean;
}

/** Il segreto di polling rimane nell'app; dal browser torna solo il consenso già verificato dal server. */
export async function googleLogin(transport: Transport): Promise<boolean> {
  const attempt = await transport.start();
  try {
    if (!attempt.path.startsWith('/api/auth/google/mobile/page#')) throw new Error('Accesso Google non disponibile. Riprova.');
    const browser = await transport.open(attempt.path);
    while (!transport.cancelled() && Date.now() < attempt.expiresAt) {
      const response = await transport.poll(attempt);
      if (transport.cancelled()) return false;
      if (response.status === 'complete') return true;
      // Su iOS la chiusura del browser prima del consenso equivale ad annullare.
      if (browser.type === 'cancel' || browser.type === 'dismiss') return false;
      await transport.wait();
    }
    if (!transport.cancelled()) throw new Error('Il tempo per accedere è scaduto. Riprova con Google.');
    return false;
  } finally {
    await transport.cancel(attempt).catch(() => {});
  }
}
