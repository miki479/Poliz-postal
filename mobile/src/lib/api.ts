import type { ActivityStreams, Me } from '@shared/types.ts';

/** Server Runngo. Sovrascrivibile con EXPO_PUBLIC_API_URL (es. per prove in locale). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://podismo-social-122967414084.europe-west1.run.app';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public fields?: Record<string, string>) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** La sessione viaggia nel cookie HttpOnly del server: il cookie jar nativo lo gestisce con credentials: 'include'. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Connessione assente o server non raggiungibile. Riprova.');
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* corpo non JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && (path === '/api/call' || path === '/api/auth/account')) onUnauthorized?.();
    throw new ApiError(json?.error?.code ?? 'server_error', json?.error?.message ?? 'Qualcosa è andato storto. Riprova.', res.status, json?.error?.fields);
  }
  return json as T;
}

export async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  return (await post<{ result: T }>('/api/call', { method, args })).result;
}

export interface AccountInfo {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  google: boolean;
  apple: boolean;
  mailEnabled: boolean;
}

export const auth = {
  login: async (email: string, password: string) => (await post<{ user: Me }>('/api/auth/login', { email, password })).user,
  google: async (idToken: string) => (await post<{ user: Me }>('/api/auth/google', { idToken })).user,
  register: async (email: string, password: string) => (await post<{ user: Me }>('/api/auth/register', { email, password })).user,
  logout: async () => void (await post('/api/auth/logout', {})),
  forgot: async (email: string) => void (await post('/api/auth/forgot', { email })),
  account: () => post<AccountInfo>('/api/auth/account', {}),
  changePassword: async (current: string, password: string) => void (await post('/api/auth/change-password', { current, password })),
  deleteAccount: async (p: { password?: string; confirm?: string }) => void (await post('/api/auth/delete', p)),
  usernameAvailable: async (username: string) => (await post<{ available: boolean }>('/api/auth/username-available', { username })).available,
  resendVerification: async () => void (await post('/api/auth/resend-verification', {})),
};

export interface Health {
  googleClientId: string | null;
  ok: boolean;
  features: { strava: boolean; geocoding: boolean; routing: boolean; weather: boolean; ai: boolean };
  registrationCodeRequired: boolean;
}

export async function health(): Promise<Health | null> {
  try {
    const r = await fetch(API_URL + '/api/health', { headers: { Accept: 'application/json' } });
    return r.ok ? ((await r.json()) as Health) : null;
  } catch {
    return null;
  }
}

export interface SyncSummary {
  at: string;
  imported: number;
  updated: number;
  duplicates: number;
  skipped: number;
  pages: number;
  partial: boolean;
  rateLimited: boolean;
  error: 'revoked' | 'strava_error' | 'network' | 'budget' | null;
}
export interface StravaStatus {
  configured: boolean;
  reason: string | null;
  connected: boolean;
  revoked: boolean;
  athleteId: number | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSync: SyncSummary | null;
}
export interface AiStatus {
  configured: boolean;
  reason: string | null;
  dailyLimit: number;
  used: number;
  remaining: number;
  serviceAvailable: boolean;
}
export interface AiAnswer {
  text: string;
  generic: boolean;
  simulated: boolean;
  remaining: number;
}
export interface WeatherResult {
  available: boolean;
  reason?: 'past' | 'too_far' | 'no_data';
  hour?: { time: string; tempC: number; rainProb: number | null; rainMm: number; windKmh: number; code: number; label: string };
  attribution: string;
}
export interface GeoPlace {
  name: string;
  lat: number;
  lng: number;
}
export interface RouteResult {
  distanceKm: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: Array<{ text: string; distanceKm: number }>;
  provider: string;
  attribution: string;
}

export const ext = {
  strava: {
    status: () => post<StravaStatus>('/api/strava/status', {}),
    connect: async () => (await post<{ url: string }>('/api/strava/connect', {})).url,
    sync: () => post<{ summary: SyncSummary; status: StravaStatus }>('/api/strava/sync', {}),
    streams: (logId: string) => post<{ streams: ActivityStreams | null; unavailable?: boolean }>('/api/strava/streams', { logId }),
    disconnect: (deleteData: boolean) => post<{ deleted: number }>('/api/strava/disconnect', { deleteData }),
  },
  geo: {
    search: (q: string) => post<{ results: GeoPlace[]; cached: boolean }>('/api/geo/search', { q }),
    route: (points: Array<{ lat: number; lng: number }>) => post<RouteResult>('/api/geo/route', { points }),
  },
  weather: (lat: number, lng: number, startsAt: string) => post<WeatherResult>('/api/weather', { lat, lng, startsAt }),
  ai: {
    status: () => post<AiStatus>('/api/ai/status', {}),
    chat: (p: { prompt: string; preset: string; useData: boolean }) => post<AiAnswer>('/api/ai/chat', p),
  },
};

export interface WorkoutBriefResult {
  brief: { text: string; at: string; ai: boolean };
  /** Fatti calcolati dal server (piano, storico, confronto anonimo): separati dall'interpretazione AI. */
  facts: import('@shared/brief.ts').BriefFacts;
  remaining: number;
}

/** Briefing dopo l'allenamento: il server lo scrive (Coach AI se disponibile, altrimenti riepilogo automatico) e lo salva. */
export const briefFor = (logId: string, refresh = false) => post<WorkoutBriefResult>('/api/ai/brief', { logId, refresh });
