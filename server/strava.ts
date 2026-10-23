/**
 * Integrazione Strava API v3 (OAuth 2.0). Token e segreti restano sul server, cifrati a riposo.
 * Nota sulle condizioni di Strava (verificate via ricerca, da ricontrollare prima del lancio): i dati di un atleta
 * possono essere mostrati solo a quell'atleta e non possono alimentare analisi/AI di terzi. Per questo le attività
 * importate sono SEMPRE private: non entrano in classifiche, sfide, feed né nell'AI.
 */
import { findDuplicate, newActivity } from '../shared/activities.ts';
import type { DbState } from '../shared/types.ts';
import { fetchT, hmac, safeEqual, seal, unseal, parseKey } from './util.ts';

export interface StravaConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  apiBase: string;
  oauthBase: string;
  maxPages: number;
  key: Buffer | null;
  /** Richieste massime per finestra di 15 minuti, da tenere sotto il limite dell'app. */
  budget15m: number;
  /** Motivo per cui l'integrazione non è attiva (mostrato all'utente). */
  reason: string | null;
}

export function stravaConfig(env: NodeJS.ProcessEnv, appUrl: string): StravaConfig {
  const key = parseKey(env.TOKEN_ENCRYPTION_KEY);
  const clientId = env.STRAVA_CLIENT_ID || '';
  const clientSecret = env.STRAVA_CLIENT_SECRET || '';
  let reason: string | null = null;
  if (!clientId || !clientSecret) reason = 'Credenziali Strava non configurate sul server.';
  else if (!key) reason = 'Manca TOKEN_ENCRYPTION_KEY: senza cifratura i token non vengono conservati.';
  else if (!appUrl && !env.STRAVA_REDIRECT_URI) reason = 'Manca APP_URL per l\'indirizzo di ritorno OAuth.';
  return {
    enabled: reason === null,
    clientId,
    clientSecret,
    redirectUri: env.STRAVA_REDIRECT_URI || `${appUrl}/api/strava/callback`,
    // Solo gli ambiti necessari: lettura profilo e attività pubbliche/“solo follower”. activity:read_all è opzionale (attività private).
    scope: env.STRAVA_SCOPE || 'read,activity:read',
    apiBase: (env.STRAVA_API_BASE || 'https://www.strava.com/api/v3').replace(/\/$/, ''),
    oauthBase: (env.STRAVA_OAUTH_BASE || 'https://www.strava.com/oauth').replace(/\/$/, ''),
    maxPages: Math.min(20, Math.max(1, Number(env.STRAVA_MAX_PAGES) || 8)),
    key,
    budget15m: Number(env.STRAVA_REQUESTS_PER_15MIN) || 80,
    reason,
  };
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

export interface StravaLink {
  athleteId: number;
  access: string; // cifrato
  refresh: string; // cifrato
  expiresAt: number; // epoch secondi
  scope: string;
  connectedAt: string;
  lastSyncAt: string | null;
  /** Epoch (s) della più recente attività vista: le sincronizzazioni successive partono da qui. */
  cursor: number | null;
  lastSync: SyncSummary | null;
  status: 'ok' | 'revoked';
}

/* ---------- budget di richieste ---------- */

let windowStart = 0;
let used = 0;
function takeRequest(cfg: StravaConfig): boolean {
  const now = Date.now();
  if (now - windowStart > 15 * 60_000) {
    windowStart = now;
    used = 0;
  }
  if (used >= cfg.budget15m) return false;
  used++;
  return true;
}
export const _resetBudget = () => {
  windowStart = 0;
  used = 0;
};

/* ---------- OAuth ---------- */

const stateKey = (cfg: StravaConfig) => (cfg.key ? hmac(cfg.key, 'strava-state') : '');

/** "state" firmato: lega il ritorno OAuth all'utente e alla sessione, con scadenza di 10 minuti. */
export function makeState(cfg: StravaConfig, userId: string, now = Date.now()): string {
  const body = `${userId}.${now + 600_000}.${Math.random().toString(36).slice(2, 10)}`;
  return `${Buffer.from(body).toString('base64url')}.${hmac(stateKey(cfg), body)}`;
}

export function verifyState(cfg: StravaConfig, state: string, now = Date.now()): string | null {
  const [b, sig] = String(state).split('.');
  if (!b || !sig) return null;
  const body = Buffer.from(b, 'base64url').toString('utf8');
  if (!safeEqual(hmac(stateKey(cfg), body), sig)) return null;
  const [userId, exp] = body.split('.');
  return Number(exp) >= now ? userId : null;
}

export function authorizeUrl(cfg: StravaConfig, userId: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', approval_prompt: 'auto', scope: cfg.scope, state: makeState(cfg, userId) });
  return `${cfg.oauthBase}/authorize?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

async function tokenRequest(cfg: StravaConfig, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetchT(`${cfg.oauthBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  if (!res.ok) throw Object.assign(new Error('token_rejected'), { status: res.status });
  return (await res.json()) as TokenResponse;
}

/** Scambia il codice con i token. Rifiuta se l'utente non ha concesso l'ambito di lettura delle attività. */
export async function exchangeCode(cfg: StravaConfig, code: string, grantedScope: string): Promise<StravaLink> {
  if (!/activity:read/.test(grantedScope)) throw Object.assign(new Error('scope_missing'), { status: 0 });
  const t = await tokenRequest(cfg, { code, grant_type: 'authorization_code' });
  return {
    athleteId: t.athlete?.id ?? 0,
    access: seal(cfg.key!, t.access_token),
    refresh: seal(cfg.key!, t.refresh_token),
    expiresAt: t.expires_at,
    scope: grantedScope,
    connectedAt: new Date().toISOString(),
    lastSyncAt: null,
    cursor: null,
    lastSync: null,
    status: 'ok',
  };
}

async function refresh(cfg: StravaConfig, link: StravaLink): Promise<boolean> {
  try {
    const t = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: unseal(cfg.key!, link.refresh) });
    link.access = seal(cfg.key!, t.access_token);
    link.refresh = seal(cfg.key!, t.refresh_token); // Strava può ruotare il refresh token: va sempre salvato quello nuovo
    link.expiresAt = t.expires_at;
    return true;
  } catch {
    return false;
  }
}

export async function deauthorize(cfg: StravaConfig, link: StravaLink): Promise<void> {
  try {
    await fetchT(`${cfg.oauthBase}/deauthorize`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: unseal(cfg.key!, link.access) }) });
  } catch {
    /* revoca best-effort: i token locali vengono comunque eliminati */
  }
}

/* ---------- sincronizzazione ---------- */

interface StravaActivity {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  private?: boolean;
}

const sportOf = (a: StravaActivity) => {
  const t = a.sport_type ?? a.type ?? '';
  if (/Run/.test(t)) return 'running' as const;
  if (/Walk|Hike/.test(t)) return 'walking' as const;
  return null;
};

export async function syncActivities(cfg: StravaConfig, link: StravaLink, db: DbState, userId: string, now = new Date()): Promise<SyncSummary> {
  const sum: SyncSummary = { at: now.toISOString(), imported: 0, updated: 0, duplicates: 0, skipped: 0, pages: 0, partial: false, rateLimited: false, error: null };
  if (link.status !== 'ok') return { ...sum, error: 'revoked' };

  if (link.expiresAt - 60 < now.getTime() / 1000 && !(await refresh(cfg, link))) {
    link.status = 'revoked';
    return { ...sum, error: 'revoked' };
  }
  const after = link.cursor ? link.cursor - 86_400 : Math.floor(now.getTime() / 1000) - 180 * 86_400;
  let newest = link.cursor ?? 0;
  let triedRefresh = false;

  for (let page = 1; page <= cfg.maxPages; page++) {
    if (!takeRequest(cfg)) return { ...sum, error: 'budget', rateLimited: true };
    let res: Response;
    try {
      res = await fetchT(`${cfg.apiBase}/athlete/activities?per_page=50&page=${page}&after=${after}`, { headers: { Authorization: `Bearer ${unseal(cfg.key!, link.access)}` } });
    } catch {
      return { ...sum, error: 'network' };
    }
    if (res.status === 401 && !triedRefresh) {
      triedRefresh = true;
      if (await refresh(cfg, link)) {
        page--;
        continue;
      }
      link.status = 'revoked';
      return { ...sum, error: 'revoked' };
    }
    if (res.status === 401) {
      link.status = 'revoked';
      return { ...sum, error: 'revoked' };
    }
    if (res.status === 429) return { ...sum, rateLimited: true };
    if (!res.ok) return { ...sum, error: 'strava_error' };
    sum.pages++;
    const items = (await res.json()) as StravaActivity[];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const it of items) {
      const sport = sportOf(it);
      const start = it.start_date ? Date.parse(it.start_date) : NaN;
      const km = typeof it.distance === 'number' && it.distance > 0 ? Math.round(it.distance) / 1000 : null;
      const min = it.moving_time ? Math.max(1, Math.round(it.moving_time / 60)) : null;
      if (!sport || Number.isNaN(start) || (km === null && min === null)) {
        sum.skipped++;
        continue;
      }
      newest = Math.max(newest, Math.floor(start / 1000));
      const externalId = `strava:${it.id}`;
      const date = new Date(start).toISOString();
      const existing = Object.values(db.activities).find((a) => a.userId === userId && a.externalId === externalId);
      if (existing) {
        const title = (it.name ?? '').slice(0, 80);
        if (existing.distanceKm !== km || existing.durationMin !== min || existing.date !== date || existing.title !== title) {
          Object.assign(existing, { distanceKm: km, durationMin: min, date, title, updatedAt: now.toISOString() });
          sum.updated++;
        }
        continue;
      }
      if (findDuplicate(db, { userId, sport, date, dayOnly: false, distanceKm: km, durationMin: min })) {
        sum.duplicates++;
        continue;
      }
      const a = newActivity(now, { userId, source: 'strava', sport, title: (it.name ?? '').slice(0, 80), date, distanceKm: km, durationMin: min, externalId });
      db.activities[a.id] = a;
      sum.imported++;
    }
    if (items.length < 50) break;
    if (page === cfg.maxPages) sum.partial = true;
  }
  if (!sum.partial) link.cursor = newest || link.cursor;
  link.lastSyncAt = sum.at;
  return sum;
}

export const stravaPublicStatus = (cfg: StravaConfig, link: StravaLink | undefined) => ({
  configured: cfg.enabled,
  reason: cfg.reason,
  scope: cfg.scope,
  connected: !!link && link.status === 'ok',
  revoked: !!link && link.status === 'revoked',
  athleteId: link?.athleteId ?? null,
  connectedAt: link?.connectedAt ?? null,
  lastSyncAt: link?.lastSyncAt ?? null,
  lastSync: link?.lastSync ?? null,
  grantedScope: link?.scope ?? null,
});
