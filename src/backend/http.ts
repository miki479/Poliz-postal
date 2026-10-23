import { methods, type MethodName } from '../../shared/api.ts';
import type { Me } from '../../shared/types.ts';
import { ApiError, type AccountInfo, type AuthApi, type AuthConfig, type Backend, type ExtApi, type Features } from './types.ts';

let onUnauthorized: (() => void) | null = null;
/** Chiamata quando una richiesta privata riceve 401: la sessione è scaduta o l'account non esiste più. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
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
    const e = json?.error;
    if (res.status === 401 && (path === '/api/call' || path === '/api/auth/account')) onUnauthorized?.();
    throw new ApiError(e?.code ?? 'server_error', e?.message ?? 'Qualcosa è andato storto. Riprova.', e?.fields);
  }
  return json as T;
}

export function createHttpBackend(config: AuthConfig, features: Features, map: { tileUrl: string; attribution: string }): Backend {
  const auth: AuthApi = {
    mode: 'server',
    config,
    register: async (p) => (await post<{ user: Me }>('/api/auth/register', p)).user,
    login: async (p) => (await post<{ user: Me }>('/api/auth/login', p)).user,
    google: (idToken) => post('/api/auth/google', { idToken }),
    apple: (idToken, name) => post('/api/auth/apple', { idToken, name }),
    logout: async () => void (await post('/api/auth/logout', {})),
    forgotPassword: async (email) => void (await post('/api/auth/forgot', { email })),
    resetPassword: async (token, password) => void (await post('/api/auth/reset', { token, password })),
    verifyEmail: async (token) => void (await post('/api/auth/verify', { token })),
    resendVerification: async () => void (await post('/api/auth/resend-verification', {})),
    account: () => post<AccountInfo>('/api/auth/account', {}),
    changePassword: async (current, password) => void (await post('/api/auth/change-password', { current, password })),
    deleteAccount: async (p) => void (await post('/api/auth/delete', p)),
    usernameAvailable: async (username) => (await post<{ available: boolean }>('/api/auth/username-available', { username })).available,
  };
  const ext: ExtApi = {
    features,
    map,
    strava: {
      status: () => post('/api/strava/status', {}),
      connect: async () => (await post<{ url: string }>('/api/strava/connect', {})).url,
      sync: () => post('/api/strava/sync', {}),
      disconnect: (deleteData) => post('/api/strava/disconnect', { deleteData }),
    },
    geo: {
      search: (q) => post('/api/geo/search', { q }),
      route: (points) => post('/api/geo/route', { points }),
    },
    weather: (lat, lng, startsAt) => post('/api/weather', { lat, lng, startsAt }),
    ai: {
      status: () => post('/api/ai/status', {}),
      chat: (p) => post('/api/ai/chat', p),
    },
  };
  const api: Record<string, unknown> = { auth, ext };
  for (const name of Object.keys(methods) as MethodName[]) {
    api[name] = async (...args: unknown[]) => (await post<{ result: unknown }>('/api/call', { method: name, args })).result;
  }
  return api as unknown as Backend;
}
