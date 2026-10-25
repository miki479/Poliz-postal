import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/src/index.ts';
import { Client, startServer, type Srv } from './helpers.ts';
import { mockServer, type Mock } from './mocks.ts';

const base = 8900 + Math.floor(Math.random() * 40) * 5;
const KEY = Buffer.alloc(32, 7).toString('base64');
const tmp: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'podismo-int-'));
  tmp.push(d);
  return d;
};
afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

const evInput = () => ({ title: 'Corsa', sport: 'running', startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(), timezone: 'Europe/Rome', meetingPlace: 'Parco', area: '', lat: null, lng: null, distanceKm: 8, paceSecPerKm: 330, level: 'medium', notes: '', maxParticipants: null, visibility: 'public', clubId: null, routeId: null });

/* ====================================================================== */
describe('Strava (server mock): non configurato', () => {
  let srv: Srv;
  beforeAll(async () => {
    srv = await startServer({ port: base, dataFile: join(dir(), 'db.json') });
  });
  afterAll(() => srv.stop());

  it('dichiara chiaramente che non è attivo e non rompe l\'app', async () => {
    const c = new Client(srv.base);
    await c.register('nostrava@example.com');
    const st = (await c.post('/api/strava/status', {})).json;
    expect(st).toMatchObject({ configured: false, connected: false });
    expect(st.reason).toMatch(/non configurat/i);
    const r = await c.post('/api/strava/connect', {});
    expect(r.status).toBe(503);
    expect((await c.call('getStats', 'UTC')).status).toBe(200);
    const logs = await c.call('listWorkoutLogs', null);
    expect(logs.status).toBe(200);
    expect(logs.json.result).toEqual([]);
    expect((await (await fetch(`${srv.base}/api/health`)).json()).features).toEqual({ strava: false, geocoding: false, routing: false, weather: false, ai: false });
  });

  it('i metodi di integrazione richiedono sessione', async () => {
    const anon = new Client(srv.base);
    for (const p of ['/api/strava/zones', '/api/strava/status', '/api/strava/connect', '/api/strava/sync', '/api/strava/disconnect', '/api/geo/search', '/api/geo/route', '/api/ai/status', '/api/ai/chat'])
      expect((await anon.post(p, {})).status, p).toBe(401);
  });

  it('il callback con stato assente o falso reindirizza senza collegare nulla', async () => {
    const res = await fetch(`${srv.base}/api/strava/callback?code=x&state=falso`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/strava=unavailable/);
  });
});

/* ====================================================================== */
describe('Strava (server mock): collegamento, sincronizzazione, rinnovo token, errori', () => {
  let srv: Srv;
  let strava: Mock;
  let state = { expiresAt: 0, rotations: 0, failRefresh: false, force401Once: false, rate429: false, activities: [] as unknown[] };
  const nowS = () => Math.floor(Date.now() / 1000);
  const act = (id: number, over: Record<string, unknown> = {}) => ({ id, name: `Corsa ${id}`, type: 'Run', sport_type: 'Run', start_date: new Date(Date.now() - id * 86_400_000).toISOString(), distance: 5000 + id * 10, moving_time: 1800, elapsed_time: 1900, ...over });

  beforeAll(async () => {
    strava = await mockServer(({ method, path, search, headers, body }) => {
      if (path === '/api/v3/athlete/zones') return { json: { heart_rate: { custom: true, zones: [{ min: 0, max: 130 }, { min: 130, max: -1 }] } } };
      if (path === '/oauth/token' && method === 'POST') {
        const p = new URLSearchParams(body);
        if (p.get('client_secret') !== 'segreto-test') return { status: 401, json: {} };
        if (p.get('grant_type') === 'authorization_code') return { json: { access_token: 'acc-1', refresh_token: 'ref-1', expires_at: state.expiresAt || nowS() + 21600, athlete: { id: Number((p.get('code') ?? 'athlete-0').split('-')[1]) } } };
        if (p.get('grant_type') === 'refresh_token') {
          if (state.failRefresh) return { status: 400, json: { message: 'Bad Request' } };
          state.rotations++;
          return { json: { access_token: `acc-r${state.rotations}`, refresh_token: `ref-r${state.rotations}`, expires_at: nowS() + 21600 } };
        }
      }
      if (path === '/oauth/deauthorize') return { json: {} };
      if (path === '/api/v3/athlete/activities') {
        if (state.rate429) return { status: 429, json: { message: 'Rate Limit Exceeded' }, headers: { 'X-RateLimit-Limit': '100,1000', 'X-RateLimit-Usage': '101,200' } };
        if (state.force401Once) {
          state.force401Once = false;
          return { status: 401, json: { message: 'Authorization Error' } };
        }
        if (!headers.authorization?.startsWith('Bearer acc-')) return { status: 401, json: {} };
        const page = Number(search.get('page') ?? 1);
        return { json: (state.activities as unknown[]).slice((page - 1) * 50, page * 50) };
      }
      return { status: 404, json: {} };
    });
    srv = await startServer({
      port: base + 1, dataFile: join(dir(), 'db.json'),
      env: { STRAVA_CLIENT_ID: '999', STRAVA_CLIENT_SECRET: 'segreto-test', TOKEN_ENCRYPTION_KEY: KEY, STRAVA_API_BASE: `${strava.url}/api/v3`, STRAVA_OAUTH_BASE: `${strava.url}/oauth`, STRAVA_SYNC_COOLDOWN_MS: '0', STRAVA_MAX_PAGES: '3' },
    });
  });
  afterAll(async () => {
    await srv.stop();
    await strava.close();
  });

  const reset = () => {
    state = { expiresAt: 0, rotations: 0, failRefresh: false, force401Once: false, rate429: false, activities: [] };
    strava.hits.length = 0;
  };
  const callback = async (c: Client, q: Record<string, string>) => {
    const res = await fetch(`${srv.base}/api/strava/callback?${new URLSearchParams(q)}`, { headers: { Cookie: c.cookie }, redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location') ?? '' };
  };
  let nextAthlete = 5000;
  /** Ogni utente di test ha un proprio atleta Strava (il codice porta l'id nel mock). */
  const connect = async (c: Client, scope = 'read,activity:read', athlete = nextAthlete++) => {
    const url = new URL((await c.post('/api/strava/connect', {})).json.url);
    const r = await callback(c, { code: `athlete-${athlete}`, state: url.searchParams.get('state')!, scope });
    return { url, ...r };
  };

  it('zone: richiede nuovo consenso, mantiene attività utilizzabili e isola cache per atleta', async () => {
    reset();
    const a = new Client(srv.base); await a.register('zones-a@example.com'); await connect(a);
    expect((await a.post('/api/strava/zones', {})).json).toEqual({ zones: null, needsReconnect: true });
    expect(strava.hits.filter((h) => h.path === '/api/v3/athlete/zones')).toHaveLength(0);
    await connect(a, 'read,activity:read,profile:read_all');
    expect((await a.post('/api/strava/zones', {})).json.zones).toEqual({ custom: true, zones: [{ min: 0, max: 130 }, { min: 130, max: -1 }] });
    await a.post('/api/strava/zones', {});
    expect(strava.hits.filter((h) => h.path === '/api/v3/athlete/zones')).toHaveLength(1);
    const b = new Client(srv.base); await b.register('zones-b@example.com');
    expect((await b.post('/api/strava/zones', {})).json.zones).toBeNull();
    await connect(b, 'read,activity:read,profile:read_all'); await b.post('/api/strava/zones', {});
    expect(strava.hits.filter((h) => h.path === '/api/v3/athlete/zones')).toHaveLength(2);
    await a.post('/api/strava/disconnect', { deleteData: false });
    expect((await a.post('/api/strava/zones', {})).json.zones).toBeNull();
  });

  it('costruisce l\'URL OAuth con soli ambiti necessari e senza segreti', async () => {
    reset();
    const c = new Client(srv.base);
    await c.register('oauth1@example.com');
    const { json } = await c.post('/api/strava/connect', {});
    const u = new URL(json.url);
    expect(u.origin + u.pathname).toBe(`${strava.url}/oauth/authorize`);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: '999', response_type: 'code', scope: 'read,activity:read,profile:read_all' });
    expect(u.searchParams.get('redirect_uri')).toMatch(/\/api\/strava\/callback$/);
    expect(json.url).not.toMatch(/segreto-test/);
    expect((await (await fetch(`${srv.base}/api/health`)).json()).features.strava).toBe(true);
  });

  it('callback: stato di un altro utente, negazione e ambito mancante non collegano nulla', async () => {
    reset();
    const a = new Client(srv.base);
    const b = new Client(srv.base);
    await a.register('cb-a@example.com');
    await b.register('cb-b@example.com');
    const stateA = new URL((await a.post('/api/strava/connect', {})).json.url).searchParams.get('state')!;
    expect((await callback(b, { code: 'x', state: stateA, scope: 'read,activity:read' })).location).toMatch(/state_error/); // sessione di B con lo stato di A
    expect((await callback(new Client(srv.base), { code: 'x', state: stateA })).location).toMatch(/state_error/); // senza sessione
    expect((await callback(a, { code: 'x', state: 'manomesso.abc' })).location).toMatch(/state_error/);
    expect((await callback(a, { error: 'access_denied', state: stateA })).location).toMatch(/denied/);
    expect((await callback(a, { code: 'x', state: stateA, scope: 'read' })).location).toMatch(/scope_missing/); // ha tolto la lettura attività
    expect((await a.post('/api/strava/status', {})).json.connected).toBe(false);
    expect(strava.hits.filter((h) => h.path === '/oauth/token')).toHaveLength(0);
  });

  it('collegamento riuscito: stato visibile, nessun token esposto al client', async () => {
    reset();
    const c = new Client(srv.base);
    await c.register('link1@example.com');
    expect((await connect(c, 'read,activity:read', 4242)).location).toMatch(/strava=ok/);
    const st = (await c.post('/api/strava/status', {})).json;
    expect(st).toMatchObject({ configured: true, connected: true, athleteId: 4242, lastSyncAt: null });
    expect(JSON.stringify(st)).not.toMatch(/acc-1|ref-1|segreto/);
    // lo stesso atleta non si può collegare a un secondo account
    const d = new Client(srv.base);
    await d.register('link2@example.com');
    expect((await connect(d, 'read,activity:read', 4242)).location).toMatch(/already_linked/);
  });

  it('sincronizza con paginazione, importa solo corsa/camminata, deduplica e tiene i dati privati', async () => {
    reset();
    const c = new Client(srv.base);
    await c.register('sync1@example.com');
    state.activities = [
      ...Array.from({ length: 53 }, (_, i) => act(i + 1)),
      act(100, { type: 'Ride', sport_type: 'Ride' }),
      act(101, { type: 'Walk', sport_type: 'Walk', distance: 3000, moving_time: 2400 }),
    ];
    await connect(c);
    // un'attività inserita a mano che coincide con la Strava #5: non deve duplicarsi
    const dupDate = (state.activities[4] as { start_date: string }).start_date;
    expect((await c.call('logActivity', { date: dupDate, sport: 'running', distanceKm: 5.05, durationMin: 30, note: '', dayOnly: false })).status).toBe(200);
    const r = await c.post('/api/strava/sync', {});
    expect(r.status).toBe(200);
    expect(r.json.summary).toMatchObject({ pages: 2, partial: false, rateLimited: false, error: null, imported: 53, duplicates: 1, skipped: 1 });
    const list = (await c.call('listActivities', {})).json.result as Array<{ source: string; cls: string; visibility: string; externalId: string | null }>;
    const imported = list.filter((a) => a.source === 'strava');
    expect(imported).toHaveLength(53);
    expect(imported.every((a) => a.cls === 'imported' && a.visibility === 'private' && a.externalId?.startsWith('strava:'))).toBe(true);
    expect(list.filter((a) => a.source === 'manual')).toHaveLength(1);
    // la visibilità non si può cambiare: i dati Strava non si condividono
    const id = (await c.call('listActivities', {})).json.result.find((a: { source: string }) => a.source === 'strava').id;
    expect((await c.call('setActivityVisibility', id, 'shared')).status).toBe(403);
    expect((await c.call('updateActivity', id, { distanceKm: 1 })).status).toBe(403);
    const st = (await c.post('/api/strava/status', {})).json;
    expect(st.lastSyncAt).toBeTruthy();
    expect(st.lastSync).toMatchObject({ imported: 53 });
    // seconda sincronizzazione: nessun duplicato; una modifica su Strava aggiorna il record
    (state.activities[0] as { distance: number }).distance = 7777;
    const r2 = await c.post('/api/strava/sync', {});
    expect(r2.json.summary).toMatchObject({ imported: 0, updated: 1 });
    expect((await c.call('listActivities', {})).json.result.filter((a: { source: string }) => a.source === 'strava')).toHaveLength(53);
  });

  it('TrailRun diventa trail (anche se prima era una corsa), Hike resta camminata', async () => {
    reset();
    const c = new Client(srv.base);
    await c.register('trail1@example.com');
    state.activities = [
      act(1, { name: 'Trail del monte', type: 'Run', sport_type: 'TrailRun', map: { summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }),
      act(2, { name: 'Escursione', type: 'Hike', sport_type: 'Hike', distance: 9000, moving_time: 9000 }),
      act(3, { name: 'Corsa al parco', type: 'Run', sport_type: 'Run' }),
    ];
    await connect(c);
    expect((await c.post('/api/strava/sync', {})).json.summary).toMatchObject({ imported: 3, skipped: 0, error: null });
    const sportOf = async (title: string) => ((await c.call('listActivities', {})).json.result as Array<{ title: string; sport: string }>).find((a) => a.title === title)?.sport;
    expect(await sportOf('Trail del monte')).toBe('trail');
    expect(await sportOf('Escursione')).toBe('walking');
    expect(await sportOf('Corsa al parco')).toBe('running');
    const story = ((await c.call('listWorkoutLogs', null)).json.result as Array<{ title: string; sport: string; trail?: boolean; origin?: string }>).find((l) => l.title === 'Trail del monte');
    expect(story).toMatchObject({ sport: 'running', trail: true, origin: 'strava' });
    // Strava riclassifica la corsa come TrailRun: il tipo si aggiorna, senza duplicati
    (state.activities[2] as { sport_type: string }).sport_type = 'TrailRun';
    expect((await c.post('/api/strava/sync', {})).json.summary).toMatchObject({ imported: 0, updated: 1 });
    expect(await sportOf('Corsa al parco')).toBe('trail');
    expect((await c.call('listActivities', {})).json.result.filter((a: { source: string }) => a.source === 'strava')).toHaveLength(3);
  });

  it('i dati Strava non compaiono in classifiche e feed degli altri', async () => {
    reset();
    const a = new Client(srv.base);
    const b = new Client(srv.base);
    await a.register('priv-a@example.com');
    await b.register('priv-b@example.com');
    state.activities = [act(1, { distance: 40000 })];
    await connect(a);
    const club = (await a.call('createClub', { name: 'Palestra', description: '', sport: 'running', area: '', imageDataUrl: null })).json.result;
    await b.call('joinClub', club.inviteCode);
    await a.post('/api/strava/sync', {});
    expect((await a.call('getStats', 'UTC')).json.result.totals.distanceKm).toBeGreaterThan(30); // le vede lui
    const lb = (await b.call('clubLeaderboard', club.id, 'distance', '2000-01-01T00:00:00Z')).json.result;
    expect(lb.rows).toHaveLength(0);
    expect(JSON.stringify((await b.call('getFeed')).json)).not.toMatch(/strava|Corsa 1/);
    expect((await b.call('getProfile', (await a.call('me')).json.result.id)).json.result.activities).toBeNull();
  });

  it('rinnova il token scaduto prima di chiamare l\'API e salva il nuovo refresh token', async () => {
    reset();
    state.expiresAt = nowS() - 100; // già scaduto alla connessione
    state.activities = [act(1)];
    const c = new Client(srv.base);
    await c.register('refresh1@example.com');
    await connect(c);
    const r = await c.post('/api/strava/sync', {});
    expect(r.json.summary).toMatchObject({ imported: 1, error: null });
    expect(state.rotations).toBe(1);
    const call = strava.hits.find((h) => h.path === '/api/v3/athlete/activities')!;
    expect(call.headers.authorization).toBe('Bearer acc-r1');
    expect(new URLSearchParams(strava.hits.filter((h) => h.path === '/oauth/token').pop()!.body).get('refresh_token')).toBe('ref-1');
  });

  it('401 dall\'API: tenta un solo rinnovo e riprova; se il rinnovo fallisce segna il collegamento come revocato', async () => {
    reset();
    state.activities = [act(1)];
    const c = new Client(srv.base);
    await c.register('revoke1@example.com');
    await connect(c);
    state.force401Once = true;
    expect((await c.post('/api/strava/sync', {})).json.summary).toMatchObject({ imported: 1, error: null });
    expect(state.rotations).toBe(1);
    state.force401Once = true;
    state.failRefresh = true;
    const r = await c.post('/api/strava/sync', {});
    expect(r.status).toBe(200); // l'app non si blocca
    expect(r.json.summary.error).toBe('revoked');
    expect((await c.post('/api/strava/status', {})).json).toMatchObject({ connected: false, revoked: true });
    expect((await c.call('getHome', new Date().toISOString())).status).toBe(200); // il resto dell'app funziona
  });

  it('429 di Strava: lo segnala senza errori e senza perdere i dati già importati', async () => {
    reset();
    state.activities = [act(1)];
    const c = new Client(srv.base);
    await c.register('rate1@example.com');
    await connect(c);
    await c.post('/api/strava/sync', {});
    state.rate429 = true;
    const r = await c.post('/api/strava/sync', {});
    expect(r.status).toBe(200);
    expect(r.json.summary).toMatchObject({ rateLimited: true, imported: 0 });
    expect((await c.call('listActivities', {})).json.result).toHaveLength(1);
  });

  it('disconnessione: revoca su Strava, elimina token e (a scelta) i dati importati; non tocca gli altri utenti', async () => {
    reset();
    state.activities = [act(1), act(2)];
    const a = new Client(srv.base);
    const b = new Client(srv.base);
    await a.register('disc-a@example.com');
    await b.register('disc-b@example.com');
    await b.call('logActivity', { date: new Date(Date.now() - 86400000).toISOString(), sport: 'running', distanceKm: 3, durationMin: 20, note: '' });
    await connect(a);
    await a.post('/api/strava/sync', {});
    await a.call('logActivity', { date: new Date(Date.now() - 20 * 86400000).toISOString(), sport: 'running', distanceKm: 9, durationMin: 50, note: '' });
    const r = await a.post('/api/strava/disconnect', { deleteData: true });
    expect(r.json).toMatchObject({ ok: true, deleted: 2 });
    expect(strava.hits.some((h) => h.path === '/oauth/deauthorize')).toBe(true);
    expect((await a.post('/api/strava/status', {})).json.connected).toBe(false);
    expect((await a.call('listActivities', {})).json.result.map((x: { source: string }) => x.source)).toEqual(['manual']);
    expect((await b.call('listActivities', {})).json.result).toHaveLength(1);
    expect((await a.post('/api/strava/sync', {})).status).toBe(400); // non più collegato
  });

  it('il file dei dati non contiene token in chiaro', async () => {
    reset();
    const d = dir();
    const s = await startServer({ port: base + 2, dataFile: join(d, 'db.json'), env: { STRAVA_CLIENT_ID: '999', STRAVA_CLIENT_SECRET: 'segreto-test', TOKEN_ENCRYPTION_KEY: KEY, STRAVA_API_BASE: `${strava.url}/api/v3`, STRAVA_OAUTH_BASE: `${strava.url}/oauth` } });
    const c = new Client(s.base);
    await c.register('file1@example.com');
    const url = new URL((await c.post('/api/strava/connect', {})).json.url);
    await fetch(`${s.base}/api/strava/callback?${new URLSearchParams({ code: 'athlete-4242', state: url.searchParams.get('state')!, scope: 'read,activity:read' })}`, { headers: { Cookie: c.cookie }, redirect: 'manual' });
    await s.stop();
    const raw = (await import('node:fs')).readFileSync(join(d, 'db.json'), 'utf8');
    expect(raw).toContain('"athleteId":4242');
    expect(raw).not.toMatch(/acc-1|ref-1/);
  });
});

/* ====================================================================== */
describe('Geocoding, routing e meteo (server mock)', () => {
  let srv: Srv;
  let nominatim: Mock;
  let ors: Mock;
  let meteo: Mock;
  const nowH = () => new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 24 * 3_600_000);
  const hourIso = (d: Date) => d.toISOString().slice(0, 13) + ':00';

  beforeAll(async () => {
    nominatim = await mockServer(({ search }) => ({ json: [{ display_name: `Risultato per ${search.get('q')}`, lat: '44.22', lon: '12.04' }, { display_name: 'rotto', lat: 'x', lon: 'y' }] }));
    ors = await mockServer(({ method, headers, body }) => {
      if (headers.authorization !== 'chiave-ors') return { status: 403, json: {} };
      const coords = (JSON.parse(body || '{}').coordinates ?? []) as number[][];
      if (coords.some((c) => c[0] === 0)) return { status: 404, json: {} };
      return method === 'POST' ? { json: { features: [{ geometry: { coordinates: [[12.04, 44.22], [12.04, 44.23], [12.04, 44.24]] }, properties: { summary: { distance: 2.22 }, segments: [{ steps: [{ instruction: 'Vai dritto per 2 km', distance: 2.22 }] }] } }] } } : { status: 405, json: {} };
    });
    meteo = await mockServer(() => {
      const times = Array.from({ length: 24 * 16 }, (_, i) => hourIso(new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + i * 3_600_000)));
      return { json: { hourly: { time: times, temperature_2m: times.map(() => 17.4), precipitation_probability: times.map(() => 35), precipitation: times.map(() => 0.2), wind_speed_10m: times.map(() => 12.2), weather_code: times.map(() => 61) } } };
    });
    srv = await startServer({
      port: base + 3, dataFile: join(dir(), 'db.json'),
      env: { GEO_CONTACT_EMAIL: 'admin@example.com', NOMINATIM_URL: nominatim.url, ORS_API_KEY: 'chiave-ors', ORS_URL: ors.url, WEATHER_ENABLED: '1', OPEN_METEO_URL: meteo.url, GEO_SEARCH_DAILY_CAP: '3', GEO_ROUTE_DAILY_CAP: '2', WEATHER_DAILY_CAP: '1' },
    });
  });
  afterAll(async () => {
    await srv.stop();
    await Promise.all([nominatim.close(), ors.close(), meteo.close()]);
  });

  it('geocoding: identifica l\'app, rispetta cache e quota giornaliera, scarta risultati incompleti', async () => {
    const c = new Client(srv.base);
    await c.register('geo1@example.com');
    const a = await c.post('/api/geo/search', { q: 'Forlì centro' });
    expect(a.status).toBe(200);
    expect(a.json.results).toEqual([{ name: 'Risultato per forlì centro', lat: 44.22, lng: 12.04 }]);
    const b = await c.post('/api/geo/search', { q: '  FORLÌ   centro ' });
    expect(b.json.cached).toBe(true);
    expect(nominatim.hits).toHaveLength(1); // la seconda ricerca arriva dalla cache
    expect(nominatim.hits[0].headers['user-agent']).toMatch(/Runngo.*admin@example\.com/);
    expect((await c.post('/api/geo/search', { q: 'ab' })).status).toBe(422);
    await c.post('/api/geo/search', { q: 'Cesena' });
    await c.post('/api/geo/search', { q: 'Ravenna' });
    const over = await c.post('/api/geo/search', { q: 'Rimini' });
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe('quota');
    expect(over.json.error.message).toMatch(/a mano/);
  });

  it('routing: distanza e geometria vengono dal servizio; errori chiari; quota', async () => {
    const c = new Client(srv.base);
    await c.register('route1@example.com');
    const pts = [{ lat: 44.22, lng: 12.04 }, { lat: 44.24, lng: 12.04 }];
    const r = await c.post('/api/geo/route', { points: pts });
    expect(r.status).toBe(200);
    expect(r.json.geometry).toHaveLength(3);
    expect(r.json.distanceKm).toBeCloseTo(2.22, 1);
    expect(r.json.attribution).toMatch(/OpenStreetMap/);
    expect(r.json.steps[0].text).toMatch(/dritto/);
    // il percorso così ottenuto si può salvare: la distanza coincide col tracciato
    const saved = await c.call('createRoute', { name: 'Da routing', description: '', startName: 'Punto A', endName: 'Punto B', area: '', distanceKm: r.json.distanceKm, distanceSource: 'routing', notes: '', start: pts[0], end: pts[1], geometry: r.json.geometry, geometryProvider: r.json.provider, visibility: 'link' });
    expect(saved.status).toBe(200);
    // distanza inventata con geometria reale → rifiutata dal server
    expect((await c.call('createRoute', { name: 'Falso', description: '', startName: 'Punto A', endName: 'Punto B', area: '', distanceKm: 15, distanceSource: 'routing', notes: '', start: pts[0], end: pts[1], geometry: r.json.geometry, geometryProvider: 'OpenRouteService', visibility: 'link' })).status).toBe(422);
    expect((await c.post('/api/geo/route', { points: [pts[0]] })).status).toBe(422);
    const bad = await c.post('/api/geo/route', { points: [{ lat: 10, lng: 0 }, { lat: 11, lng: 1 }] });
    expect(bad.status).toBe(503);
    expect(bad.json.error.message).toMatch(/a mano/); // si può comunque salvare a mano
    expect((await c.post('/api/geo/route', { points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] })).json.error?.code).toBe('quota'); // tetto giornaliero (2) raggiunto
  });

  it('meteo: ora più vicina, cache, avviso di aggiornamento e limiti temporali', async () => {
    const c = new Client(srv.base);
    const at = nowH().toISOString();
    const w = await c.post('/api/weather', { lat: 44.22, lng: 12.04, startsAt: at });
    expect(w.status).toBe(200);
    expect(w.json).toMatchObject({ available: true, attribution: expect.stringMatching(/Open-Meteo/) });
    expect(w.json.hour).toMatchObject({ tempC: 17, rainProb: 35, rainMm: 0.2, windKmh: 12, code: 61, label: 'Pioggia debole' });
    expect(w.json.fetchedAt).toBeTruthy();
    const again = await c.post('/api/weather', { lat: 44.23, lng: 12.03, startsAt: at }); // stessa area (~10 km): cache
    expect(again.json.available).toBe(true);
    expect(meteo.hits).toHaveLength(1);
    expect(meteo.hits[0].path).toBe('/v1/forecast');
    expect(new URLSearchParams(meteo.hits[0].path + '?' + '').toString()).toBeDefined();
    expect((await c.post('/api/weather', { lat: 44.22, lng: 12.04, startsAt: new Date(Date.now() - 5 * 86400000).toISOString() })).json).toMatchObject({ available: false, reason: 'past' });
    expect((await c.post('/api/weather', { lat: 44.22, lng: 12.04, startsAt: new Date(Date.now() + 30 * 86400000).toISOString() })).json).toMatchObject({ available: false, reason: 'too_far' });
    expect((await c.post('/api/weather', { lat: 999, lng: 12.04, startsAt: at })).status).toBe(422);
    // nuova area → serve una nuova richiesta, ma il tetto giornaliero (1) è già stato usato
    expect((await c.post('/api/weather', { lat: 41.9, lng: 12.5, startsAt: at })).json.error.code).toBe('quota');
  });

  it('meteo disattivato di default', async () => {
    const d = dir();
    const s = await startServer({ port: base + 4, dataFile: join(d, 'db.json') });
    const r = await new Client(s.base).post('/api/weather', { lat: 44, lng: 12, startsAt: new Date(Date.now() + 86400000).toISOString() });
    expect(r.status).toBe(503);
    expect(r.json.error.message).toMatch(/non sono attive/);
    await s.stop();
  });
});

/* ====================================================================== */
describe('Coach AI: configurazione, quote, autenticazione', () => {
  let srv: Srv;
  let aiw: Mock;
  let mode: 'ok' | 'fail' | 'quota' | 'empty' = 'ok';
  const SECRET = 'segreto-condiviso';

  beforeAll(async () => {
    aiw = await mockServer(({ headers, body }) => {
      const ts = String(headers['x-timestamp']);
      const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
      if (sig !== headers['x-signature'] || Math.abs(Date.now() / 1000 - Number(ts)) > 60) return { status: 401, json: { error: 'bad_signature' } };
      if (mode === 'fail') return { status: 502, json: {} };
      if (mode === 'quota') return { status: 429, json: { error: 'quota' } };
      if (mode === 'empty') return { json: { response: '   ' } };
      return { json: { response: 'Consiglio generico:\n- Corri piano.' } };
    });
    srv = await startServer({ port: base + 5, dataFile: join(dir(), 'db.json'), env: { AI_ENABLED: '1', AI_WORKER_URL: aiw.url, AI_WORKER_SECRET: SECRET, AI_DAILY_LIMIT: '2', AI_GLOBAL_DAILY_LIMIT: '4' } });
  });
  afterAll(async () => {
    await srv.stop();
    await aiw.close();
  });

  const user = async (email: string) => {
    const c = new Client(srv.base);
    await c.register(email);
    return c;
  };
  const wait = () => new Promise((r) => setTimeout(r, 5100)); // distanza minima di 5 s tra richieste

  it('stato, risposta in italiano e quota per account verificata sul server', async () => {
    const c = await user('ai1@example.com');
    expect((await c.post('/api/ai/status', {})).json).toMatchObject({ configured: true, dailyLimit: 2, used: 0, remaining: 2, serviceAvailable: true });
    const r = await c.post('/api/ai/chat', { prompt: 'Preparami una settimana di corsa', preset: 'week_plan', useData: false });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ text: expect.stringContaining('Consiglio generico'), generic: true, simulated: false, remaining: 1 });
    // il Worker ha ricevuto il prompt di sistema con le regole e nessun dato personale
    const sent = JSON.parse(aiw.hits.at(-1)!.body);
    expect(sent.messages[0].content).toMatch(/non fare diagnosi/);
    expect(sent.messages[0].content).toMatch(/Nessun dato personale fornito/);
    expect(JSON.stringify(sent)).not.toMatch(/ai1@example\.com|usr_/);
    // richiesta troppo ravvicinata
    expect((await c.post('/api/ai/chat', { prompt: 'Altro consiglio', useData: false })).json.error.code).toBe('rate_limited');
    await wait();
    expect((await c.post('/api/ai/chat', { prompt: 'Seconda richiesta valida', useData: false })).status).toBe(200);
    await wait();
    const over = await c.post('/api/ai/chat', { prompt: 'Terza richiesta', useData: false });
    expect(over.status).toBe(429);
    expect(over.json.error).toMatchObject({ code: 'quota' });
    expect(over.json.error.message).toMatch(/domani/);
    expect((await c.post('/api/ai/status', {})).json).toMatchObject({ used: 2, remaining: 0 });
    // un altro account ha la sua quota
    const other = await user('ai2@example.com');
    expect((await other.post('/api/ai/status', {})).json.remaining).toBe(2);
  }, 30_000);

  it('con i dati autorizzati invia solo un riepilogo anonimo di attività autodichiarate (mai Strava/file)', async () => {
    const c = await user('ai3@example.com');
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await c.call('logActivity', { date: day(1), sport: 'running', distanceKm: 5, durationMin: 30, note: 'segreto personale', title: 'Titolo privato' });
    const imp = await c.call('importActivities', [{ externalId: 'a', sport: 'running', title: 'da file', date: day(2), distanceKm: 99, durationMin: 600 }]);
    expect(imp.status).toBe(200);
    const r = await c.post('/api/ai/chat', { prompt: 'Riepiloga la mia settimana', preset: 'weekly_summary', useData: true });
    expect(r.json.generic).toBe(false);
    const sys = JSON.parse(aiw.hits.at(-1)!.body).messages[0].content as string;
    expect(sys).toMatch(/DATI UTENTE.*1 attività, 5 km, 30 minuti/s);
    expect(sys).not.toMatch(/99|segreto personale|Titolo privato|da file/);
  });

  it('errori del Worker: rimborsa la quota, segnala timeout/limiti, non inventa risposte', async () => {
    const c = await user('ai4@example.com');
    mode = 'fail';
    const f = await c.post('/api/ai/chat', { prompt: 'Una richiesta che fallisce', useData: false });
    expect(f.status).toBe(503);
    expect((await c.post('/api/ai/status', {})).json.used).toBe(0); // quota non consumata
    await wait();
    mode = 'quota';
    const q = await c.post('/api/ai/chat', { prompt: 'Quota esaurita a monte', useData: false });
    expect(q.json.error).toMatchObject({ code: 'quota' });
    expect(q.json.error.message).toMatch(/quota gratuita/);
    await wait();
    mode = 'empty';
    expect((await c.post('/api/ai/chat', { prompt: 'Risposta vuota dal modello', useData: false })).status).toBe(503);
    mode = 'ok';
    expect((await c.post('/api/ai/status', {})).json.used).toBe(0);
  }, 30_000);

  it('rifiuta richieste non autorizzate o non valide', async () => {
    expect((await new Client(srv.base).post('/api/ai/chat', { prompt: 'Ciao ciao', useData: false })).status).toBe(401);
    const c = await user('ai5@example.com');
    expect((await c.post('/api/ai/chat', { prompt: 'ab' })).status).toBe(422);
    expect((await c.post('/api/ai/chat', { prompt: 'x'.repeat(501) })).status).toBe(422);
    expect((await c.post('/api/ai/status', {})).json.used).toBe(0);
  });

  it('il tetto globale protegge il piano gratuito', async () => {
    const d = dir();
    const s = await startServer({ port: base + 6, dataFile: join(d, 'db.json'), env: { AI_ENABLED: '1', AI_WORKER_URL: aiw.url, AI_WORKER_SECRET: SECRET, AI_DAILY_LIMIT: '5', AI_GLOBAL_DAILY_LIMIT: '1' } });
    const a = new Client(s.base);
    const b = new Client(s.base);
    await a.register('g1@example.com');
    await b.register('g2@example.com');
    expect((await a.post('/api/ai/chat', { prompt: 'Prima richiesta', useData: false })).status).toBe(200);
    const r = await b.post('/api/ai/chat', { prompt: 'Seconda richiesta', useData: false });
    expect(r.status).toBe(429);
    expect(r.json.error.message).toMatch(/tutti gli utenti/);
    expect((await b.post('/api/ai/status', {})).json.serviceAvailable).toBe(false);
    await s.stop();
  });

  it('senza configurazione: stato esplicito, nessuna risposta simulata, app utilizzabile', async () => {
    const d = dir();
    const s = await startServer({ port: base + 7, dataFile: join(d, 'db.json') });
    const c = new Client(s.base);
    await c.register('noai@example.com');
    expect((await c.post('/api/ai/status', {})).json).toMatchObject({ configured: false });
    const r = await c.post('/api/ai/chat', { prompt: 'Preparami un piano', useData: false });
    expect(r.status).toBe(503);
    expect(r.json.error.message).toMatch(/disattivato/);
    expect((await c.call('getHome', new Date().toISOString())).status).toBe(200);
    await s.stop();
  });
});

/* ====================================================================== */
describe('Worker Cloudflare: verifica della firma e validazione', () => {
  const SECRET = 's3cret';
  const calls: unknown[] = [];
  const env: Env = { SHARED_SECRET: SECRET, AI: { run: async (model, input) => (calls.push({ model, input }), { response: 'ok dal modello' }) } };
  const sign = (ts: number, body: string, secret = SECRET) => createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const req = (body: string, h: Record<string, string>) => new Request('https://w.example/', { method: 'POST', body, headers: h });
  const good = JSON.stringify({ messages: [{ role: 'system', content: 'regole' }, { role: 'user', content: 'ciao' }], maxTokens: 9999 });

  it('accetta una richiesta correttamente firmata e limita i token', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await worker.fetch(req(good, { 'X-Timestamp': String(ts), 'X-Signature': sign(ts, good) }), env);
    expect(res.status).toBe(200);
    expect((await res.json()) as { response: string }).toMatchObject({ response: 'ok dal modello' });
    expect((calls.at(-1) as { model: string; input: { max_tokens: number } }).input.max_tokens).toBe(400); // tetto
    expect((calls.at(-1) as { model: string }).model).toBe('@cf/meta/llama-3.1-8b-instruct');
  });

  it('rifiuta firma errata, richieste scadute (replay), metodo errato e segreto non configurato', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const before = calls.length;
    expect((await worker.fetch(req(good, { 'X-Timestamp': String(ts), 'X-Signature': sign(ts, good, 'altro') }), env)).status).toBe(401);
    expect((await worker.fetch(req(good, { 'X-Timestamp': String(ts), 'X-Signature': 'x' }), env)).status).toBe(401);
    expect((await worker.fetch(req(good, { 'X-Timestamp': String(ts - 3600), 'X-Signature': sign(ts - 3600, good) }), env)).status).toBe(401);
    expect((await worker.fetch(req(good, {}), env)).status).toBe(401);
    expect((await worker.fetch(new Request('https://w.example/', { method: 'GET' }), env)).status).toBe(405);
    expect((await worker.fetch(req(good, { 'X-Timestamp': String(ts), 'X-Signature': sign(ts, good) }), { ...env, SHARED_SECRET: '' })).status).toBe(503);
    expect(calls.length).toBe(before); // il modello non viene mai chiamato senza autorizzazione
  });

  it('valida i messaggi e gestisce errori e quota del modello', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const post = (b: unknown, e: Env = env) => { const s = JSON.stringify(b); return worker.fetch(req(s, { 'X-Timestamp': String(ts), 'X-Signature': sign(ts, s) }), e); };
    expect((await post({ messages: [{ role: 'assistant', content: 'x' }] })).status).toBe(400);
    expect((await post({ messages: [] })).status).toBe(400);
    expect((await post({ messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).status).toBe(400);
    expect((await post({ messages: [{ role: 'user', content: 'ciao' }] }, { ...env, AI: { run: async () => { throw new Error('daily neuron limit exceeded'); } } })).status).toBe(429);
    expect((await post({ messages: [{ role: 'user', content: 'ciao' }] }, { ...env, AI: { run: async () => { throw new Error('boom'); } } })).status).toBe(502);
    expect((await post({ messages: [{ role: 'user', content: 'ciao' }] }, { ...env, AI: { run: async () => ({}) } })).status).toBe(502);
  });
});
