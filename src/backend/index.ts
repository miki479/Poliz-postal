import { createHttpBackend } from './http.ts';
import { createLocalBackend } from './local.ts';
import type { Backend } from './types.ts';

/**
 * Sceglie il backend: se l'API del server risponde si usa quella (dati reali, account reali),
 * altrimenti l'app parte in modalità demo locale, chiaramente segnalata nell'interfaccia.
 * VITE_FORCE_DEMO=1 forza la modalità demo (utile per sviluppo e test).
 */
export async function detectBackend(): Promise<Backend> {
  if (import.meta.env.VITE_FORCE_DEMO === '1') return createLocalBackend();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('/api/health', { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('application/json')) {
      const j = await res.json();
      if (j?.ok)
        return createHttpBackend(
          {
          registrationCodeRequired: !!j.registrationCodeRequired,
          emailEnabled: !!j.emailEnabled,
          googleClientId: j.googleClientId ?? null,
          appleClientId: j.appleClientId ?? null,
          appleRedirectUri: j.appleRedirectUri ?? null,
        },
        { strava: !!j.features?.strava, geocoding: !!j.features?.geocoding, routing: !!j.features?.routing, weather: !!j.features?.weather, ai: !!j.features?.ai },
        { tileUrl: j.map?.tileUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: j.map?.attribution ?? '© OpenStreetMap contributors' },
      );
    }
  } catch {
    /* server non raggiungibile */
  }
  return createLocalBackend();
}
