/**
 * Modalità demo: stessa logica del server (shared/engine) ma i dati vivono nel
 * localStorage di questo dispositivo. NON è un backend: nessun account reale,
 * nessuna condivisione tra dispositivi.
 */
import { AppError, createUser, emptyDb, suggestUsername, type Ctx } from '../../shared/engine.ts';
import { call, methods, type MethodName } from '../../shared/api.ts';
import { seedDemo } from '../../shared/demo.ts';
import { newId } from '../../shared/ids.ts';
import type { DbState, Me } from '../../shared/types.ts';
import { ApiError, type Backend } from './types.ts';

const DB_KEY = 'podismo-demo-db-v1';
const SESSION_KEY = 'podismo-demo-session-v1';

function loadDb(): DbState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { ...emptyDb(), ...(JSON.parse(raw) as DbState) };
  } catch {
    /* dati corrotti o storage non disponibile: riparte pulito */
  }
  const db = emptyDb();
  seedDemo(db, new Date());
  saveDb(db);
  return db;
}

function saveDb(db: DbState) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new ApiError('storage', 'Impossibile salvare i dati demo su questo dispositivo (spazio o permessi).');
  }
}

function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function setSession(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof AppError) throw new ApiError(e.code, e.message, e.fields);
    throw e;
  }
}

export function createLocalBackend(): Backend {
  const api: Record<string, unknown> = {};
  for (const name of Object.keys(methods) as MethodName[]) {
    api[name] = async (...args: unknown[]) =>
      wrap(() => {
        const db = loadDb();
        const actorId = getSession();
        const ctx: Ctx = { db, now: new Date(), actorId: actorId && db.users[actorId] ? actorId : null };
        // Come sul server: i metodi privati richiedono una sessione.
        const result = call(ctx, name, JSON.parse(JSON.stringify(args ?? [])));
        if (name === 'deleteAccount') setSession(null);
        saveDb(db);
        return result === undefined ? null : JSON.parse(JSON.stringify(result));
      });
  }
  const noAccounts = async (): Promise<never> => {
    throw new ApiError('unavailable', 'Backend non configurato: in modalità demo non esistono account reali.');
  };
  const off = async (): Promise<never> => {
    throw new ApiError('unavailable', 'Non disponibile in modalità demo: serve il server configurato.');
  };
  api.ext = {
    features: { strava: false, geocoding: false, routing: false, weather: false, ai: false },
    map: { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
    strava: { status: off, connect: off, sync: off, disconnect: off },
    geo: { search: off, route: off },
    weather: off,
    ai: { status: off, chat: off },
  };
  api.auth = {
    mode: 'demo',
    config: { registrationCodeRequired: false, emailEnabled: false, googleClientId: null, appleClientId: null, appleRedirectUri: null },
    register: noAccounts,
    login: noAccounts,
    google: noAccounts,
    apple: noAccounts,
    forgotPassword: noAccounts,
    resetPassword: noAccounts,
    verifyEmail: noAccounts,
    resendVerification: noAccounts,
    account: noAccounts,
    changePassword: noAccounts,
    usernameAvailable: async (u: string) => !Object.values(loadDb().users).some((x) => x.username === u.trim().toLowerCase() && x.id !== getSession()),
    demoEnter: async () => {
      const db = loadDb();
      let user = Object.values(db.users).find((u) => u.id.startsWith('usr_'));
      if (!user) {
        user = createUser(db, new Date(), { displayName: 'Ospite demo', username: suggestUsername(db, 'ospite'), hue: 200, profileCompleted: true });
        saveDb(db);
      }
      setSession(user.id);
      return user as Me;
    },
    logout: async () => setSession(null),
    deleteAccount: async () => {
      wrap(() => {
        const db = loadDb();
        const id = getSession();
        if (id && db.users[id]) {
          call({ db, now: new Date(), actorId: id }, 'deleteAccount', []);
          saveDb(db);
        }
      });
      setSession(null);
    },
    resetDemo: () => {
      try {
        localStorage.removeItem(DB_KEY);
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignora */
      }
    },
  };
  return api as unknown as Backend;
}
