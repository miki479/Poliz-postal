/**
 * Integrazione Strava API v3 (OAuth 2.0). Token e segreti restano sul server, cifrati a riposo.
 * Nota sulle condizioni di Strava (verificate via ricerca, da ricontrollare prima del lancio): i dati di un atleta
 * possono essere mostrati solo a quell'atleta e non possono alimentare analisi/AI di terzi. Per questo le attività
 * importate sono SEMPRE private: non entrano in classifiche, sfide, feed né nell'AI.
 */
import { findDuplicate, newActivity } from '../shared/activities.ts';
import { isRunFamily } from '../shared/sports.ts';
import type { ActivityStreams, SportId } from '../shared/types.ts';
import { alignStoryLog, applyMetrics, ensureStoryLog, metricsFromSummary } from '../shared/stravaStories.ts';
import type { DbState } from '../shared/types.ts';
import { fetchT, hmac, safeEqual, seal, unseal, parseKey } from './util.ts';
import { parseHeartZones, type HeartZonesResult } from '../shared/heartZones.ts';

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
    scope: env.STRAVA_SCOPE || 'read,activity:read,profile:read_all',
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
  /** true dopo aver creato i racconti per le attività già importate prima che i racconti esistessero. */
  storiesBackfilled?: boolean;
  /** true dopo aver riletto il riepilogo delle attività già importate per recuperare cuore, dislivello e cadenza. */
  metricsBackfilled?: boolean;
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
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', approval_prompt: 'force', scope: cfg.scope, state: makeState(cfg, userId) });
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
  /** Tracciato semplificato senza tempi (permesso activity:read). */
  map?: { summary_polyline?: string | null };
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  max_speed?: number;
  average_cadence?: number;
  average_watts?: number;
  calories?: number;
}

/**
 * Tipo dell'attività Strava: "TrailRun" → trail (sport_type; il vecchio campo `type` lo indica come "Run"),
 * "Run"/"VirtualRun" → corsa, "Walk" e "Hike" → camminata. Gli altri sport non vengono importati.
 */
export function stravaSportOf(a: Pick<StravaActivity, 'sport_type' | 'type'>): 'running' | 'walking' | 'trail' | null {
  const t = a.sport_type ?? a.type ?? '';
  if (/TrailRun/.test(t)) return 'trail';
  if (/Run/.test(t)) return 'running';
  if (/Walk|Hike/.test(t)) return 'walking';
  return null;
}

export async function syncActivities(cfg: StravaConfig, link: StravaLink, db: DbState, userId: string, now = new Date()): Promise<SyncSummary> {
  const sum: SyncSummary = { at: now.toISOString(), imported: 0, updated: 0, duplicates: 0, skipped: 0, pages: 0, partial: false, rateLimited: false, error: null };
  if (link.status !== 'ok') return { ...sum, error: 'revoked' };

  if (link.expiresAt - 60 < now.getTime() / 1000 && !(await refresh(cfg, link))) {
    link.status = 'revoked';
    return { ...sum, error: 'revoked' };
  }
  const backfill = !link.storiesBackfilled || !link.metricsBackfilled;
  const after = link.cursor && !backfill ? link.cursor - 86_400 : Math.floor(now.getTime() / 1000) - 180 * 86_400;
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
      const sport = stravaSportOf(it);
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
        // Corsa ↔ trail: le corse su sentiero importate prima che esistesse il trail prendono il tipo giusto (e viceversa).
        const retype = existing.sport !== sport && isRunFamily(existing.sport) && isRunFamily(sport) ? sport : existing.sport;
        if (existing.distanceKm !== km || existing.durationMin !== min || existing.date !== date || existing.title !== title || existing.sport !== retype) {
          Object.assign(existing, { distanceKm: km, durationMin: min, date, title, sport: retype, updatedAt: now.toISOString() });
          alignStoryLog(db, existing);
          sum.updated++;
        }
        // Attività già importata ma senza racconto (importata prima di questa correzione): lo crea ora.
        if (ensureStoryLog(db, existing, it.map?.summary_polyline, now, metricsFromSummary(it as unknown as Record<string, unknown>, sport))) sum.updated++;
        else if (applyMetrics(db, existing.id, metricsFromSummary(it as unknown as Record<string, unknown>, sport))) sum.updated++;
        continue;
      }
      if (findDuplicate(db, { userId, sport, date, dayOnly: false, distanceKm: km, durationMin: min })) {
        sum.duplicates++;
        continue;
      }
      const a = newActivity(now, { userId, source: 'strava', sport, title: (it.name ?? '').slice(0, 80), date, distanceKm: km, durationMin: min, externalId });
      db.activities[a.id] = a;
      ensureStoryLog(db, a, it.map?.summary_polyline, now, metricsFromSummary(it as unknown as Record<string, unknown>, sport));
      sum.imported++;
    }
    if (items.length < 50) break;
    if (page === cfg.maxPages) sum.partial = true;
  }
  if (!sum.partial) {
    link.cursor = newest || link.cursor;
    link.storiesBackfilled = true;
    link.metricsBackfilled = true;
  }
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

/* ---------- serie temporali (cuore, altitudine, cadenza) ---------- */

const streamCache = new Map<string, { at: number; data: ActivityStreams | null }>();
const STREAM_TTL = 6 * 3_600_000;
const POINTS = 120;

function thin(a: number[] | undefined): number[] | null {
  if (!Array.isArray(a) || a.length < 5) return null;
  if (a.length <= POINTS) return a;
  return Array.from({ length: POINTS }, (_, i) => a[Math.round((i / (POINTS - 1)) * (a.length - 1))]);
}

function gainLoss(alt: number[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  let ref = alt[0];
  for (const v of alt) {
    if (v - ref >= 3) {
      gain += v - ref;
      ref = v;
    } else if (ref - v >= 3) {
      loss += ref - v;
      ref = v;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

/**
 * Serie dell'attività dalla fonte, SOLO a richiesta (apertura del dettaglio) e con cache in memoria: i limiti di Strava
 * sono bassi. Restituisce null se Strava non le ha (es. attività senza cardiofrequenzimetro).
 */
export async function fetchStreams(cfg: StravaConfig, link: StravaLink, stravaId: string, sport: SportId, now = Date.now()): Promise<ActivityStreams | null> {
  const hit = streamCache.get(stravaId);
  if (hit && now - hit.at < STREAM_TTL) return hit.data;
  if (link.status !== 'ok') return null;
  if (link.expiresAt - 60 < now / 1000 && !(await refresh(cfg, link))) return null;
  if (!takeRequest(cfg)) throw Object.assign(new Error('budget'), { status: 429 });
  let res: Response;
  try {
    res = await fetchT(`${cfg.apiBase}/activities/${encodeURIComponent(stravaId)}/streams?keys=distance,heartrate,altitude,cadence&key_by_type=true`, { headers: { Authorization: `Bearer ${unseal(cfg.key!, link.access)}` } });
  } catch {
    throw Object.assign(new Error('network'), { status: 502 });
  }
  let data: ActivityStreams | null = null;
  if (res.ok) {
    const j = (await res.json()) as Record<string, { data?: number[] } | undefined>;
    const dist = j.distance?.data;
    const hr = thin(j.heartrate?.data);
    const alt = thin(j.altitude?.data);
    const cad = thin(j.cadence?.data);
    if (hr || alt || cad) {
      const gl = alt ? gainLoss(alt) : null;
      data = {
        distKm: (thin(dist) ?? []).map((m) => Math.round(m) / 1000),
        hr: hr ? hr.map(Math.round) : null,
        alt: alt ? alt.map((v) => Math.round(v * 10) / 10) : null,
        // Corsa e trail: Strava indica una gamba sola, si raddoppia (come nel riepilogo).
        cadence: cad ? cad.map((v) => Math.round(isRunFamily(sport) ? v * 2 : v)) : null,
        elevGainM: gl ? gl.gain : null,
        elevLossM: gl ? gl.loss : null,
      };
    }
  } else if (res.status === 401) {
    link.status = 'revoked';
    return null;
  } else if (res.status === 429) {
    throw Object.assign(new Error('budget'), { status: 429 });
  }
  if (streamCache.size > 200) streamCache.delete(streamCache.keys().next().value as string);
  streamCache.set(stravaId, { at: now, data });
  return data;
}


/* Zone del profilo: cache isolata per atleta e collegamento. */
const zonesCache = new Map<string, { at: number; result: HeartZonesResult }>();
export async function fetchHeartZones(cfg: StravaConfig, link: StravaLink, now = Date.now()): Promise<HeartZonesResult> {
  if (link.status !== 'ok') return { zones: null, needsReconnect: true };
  if (!link.scope.split(',').includes('profile:read_all')) return { zones: null, needsReconnect: true };
  const key = `${cfg.apiBase}:${link.athleteId}:${link.connectedAt}`;
  const hit = zonesCache.get(key);
  if (hit && now - hit.at < 6 * 3600000) return hit.result;
  if (link.expiresAt - 60 < now / 1000 && !(await refresh(cfg, link))) return { zones: null, needsReconnect: true };
  if (!takeRequest(cfg)) return { zones: null, unavailable: true };
  try {
    const res = await fetchT(`${cfg.apiBase}/athlete/zones`, { headers: { Authorization: `Bearer ${unseal(cfg.key!, link.access)}` } });
    if (res.status === 401) { link.status = 'revoked'; return { zones: null, needsReconnect: true }; }
    if (res.status === 403) return { zones: null, needsReconnect: true };
    if (!res.ok) return { zones: null, unavailable: true };
    const result = { zones: parseHeartZones(await res.json()) };
    if (zonesCache.size >= 200) zonesCache.delete(zonesCache.keys().next().value!);
    zonesCache.set(key, { at: now, result });
    return result;
  } catch { return { zones: null, unavailable: true }; }
}
