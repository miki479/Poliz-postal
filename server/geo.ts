/**
 * Geocoding (Nominatim) e routing (OpenRouteService o OSRM) attraverso il server, con cache e limiti.
 * Policy rispettate: identificazione via User-Agent, massimo 1 richiesta/secondo verso Nominatim, nessun autocompletamento,
 * cache lunga, quote giornaliere interne sotto i piani gratuiti. Nessuna geometria o distanza viene inventata.
 */
import { AppError } from '../shared/engine.ts';
import { haversineKm } from '../shared/time.ts';
import type { LatLng } from '../shared/types.ts';
import { DailyCap, fetchT, Serial, TtlCache } from './util.ts';

export interface GeoConfig {
  searchEnabled: boolean;
  routingProvider: 'ors' | 'osrm' | 'none';
  nominatimUrl: string;
  userAgent: string;
  orsUrl: string;
  orsKey: string;
  osrmUrl: string;
  tileUrl: string;
  tileAttribution: string;
}

export function geoConfig(env: NodeJS.ProcessEnv): GeoConfig {
  const contact = env.GEO_CONTACT_EMAIL || env.GEO_CONTACT_URL || '';
  const provider = env.ORS_API_KEY ? 'ors' : env.OSRM_URL ? 'osrm' : 'none';
  return {
    // La policy di Nominatim richiede un recapito per identificare l'applicazione: senza, la ricerca resta spenta.
    searchEnabled: env.GEO_ENABLED !== '0' && !!contact,
    routingProvider: env.GEO_ENABLED === '0' ? 'none' : provider,
    nominatimUrl: (env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
    userAgent: `PodismoSocial/0.1 (${contact || 'contatto non configurato'})`,
    orsUrl: (env.ORS_URL || 'https://api.openrouteservice.org').replace(/\/$/, ''),
    orsKey: env.ORS_API_KEY || '',
    osrmUrl: (env.OSRM_URL || '').replace(/\/$/, ''),
    tileUrl: env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: env.TILE_ATTRIBUTION || '© OpenStreetMap contributors',
  };
}

export interface GeoPlace {
  name: string;
  lat: number;
  lng: number;
}
export interface RouteStep {
  text: string;
  distanceKm: number;
}
export interface RouteResult {
  distanceKm: number;
  geometry: LatLng[];
  steps: RouteStep[];
  provider: string;
  attribution: string;
}

const searchCache = new TtlCache<GeoPlace[]>(1000, 24 * 3_600_000);
const routeCache = new TtlCache<RouteResult>(500, 24 * 3_600_000);
const nominatimGate = new Serial(1100); // ≥ 1 s tra le richieste, come da policy
const searchCap = new DailyCap(Number(process.env.GEO_SEARCH_DAILY_CAP) || 1000);
const routeCap = new DailyCap(Number(process.env.GEO_ROUTE_DAILY_CAP) || 1500); // piano gratuito ORS: 2.000/giorno

export async function geocode(cfg: GeoConfig, q: string): Promise<{ results: GeoPlace[]; cached: boolean }> {
  if (!cfg.searchEnabled) throw new AppError('unavailable', 'La ricerca dei luoghi non è configurata su questo server. Puoi comunque inserire il luogo a mano.');
  const key = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (key.length < 3 || key.length > 120) throw new AppError('validation', 'Scrivi almeno 3 caratteri.', { q: 'Scrivi almeno 3 caratteri.' });
  const hit = searchCache.get(key);
  if (hit) return { results: hit, cached: true };
  if (!searchCap.take()) throw new AppError('quota', 'Limite giornaliero di ricerche raggiunto. Riprova domani o inserisci il luogo a mano.');
  const url = `${cfg.nominatimUrl}/search?${new URLSearchParams({ q: key, format: 'jsonv2', limit: '5', addressdetails: '0' })}`;
  let res: Response;
  try {
    res = await nominatimGate.run(() => fetchT(url, { headers: { 'User-Agent': cfg.userAgent, 'Accept-Language': 'it' } }));
  } catch {
    throw new AppError('unavailable', 'Servizio di ricerca non raggiungibile. Inserisci il luogo a mano.');
  }
  if (res.status === 429 || res.status === 403) throw new AppError('rate_limited', 'Il servizio di ricerca è temporaneamente al limite. Riprova tra poco o inserisci il luogo a mano.');
  if (!res.ok) throw new AppError('unavailable', 'Servizio di ricerca non disponibile. Inserisci il luogo a mano.');
  const raw = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  const results = (Array.isArray(raw) ? raw : [])
    .map((r) => ({ name: String(r.display_name ?? '').slice(0, 160), lat: Number(r.lat), lng: Number(r.lon) }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  searchCache.set(key, results);
  return { results, cached: false };
}

/* ---------- semplificazione della geometria (Douglas-Peucker) ---------- */

function perpKm(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rdp(pts: LatLng[], tolKm: number): LatLng[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpKm(pts[i], pts[s], pts[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (idx !== -1 && max > tolKm) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function simplify(pts: LatLng[], maxPoints = 800): LatLng[] {
  let tol = 0.005; // 5 m
  let out = pts;
  while (out.length > maxPoints && tol < 1) {
    out = rdp(pts, tol);
    tol *= 2;
  }
  return out.map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 }));
}

export function lengthKm(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}

export async function route(cfg: GeoConfig, points: LatLng[]): Promise<RouteResult> {
  if (cfg.routingProvider === 'none') throw new AppError('unavailable', 'Il calcolo dei percorsi non è configurato su questo server. Puoi salvare il percorso inserendo la distanza a mano.');
  if (!Array.isArray(points) || points.length < 2 || points.length > 10 || points.some((p) => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180))
    throw new AppError('validation', 'Servono da 2 a 10 punti validi.', { points: 'Servono da 2 a 10 punti validi.' });
  const key = `${cfg.routingProvider}:${points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const hit = routeCache.get(key);
  if (hit) return hit;
  if (!routeCap.take()) throw new AppError('quota', 'Limite giornaliero di calcoli di percorso raggiunto. Riprova domani o inserisci la distanza a mano.');

  let result: RouteResult;
  try {
    if (cfg.routingProvider === 'ors') {
      const res = await fetchT(`${cfg.orsUrl}/v2/directions/foot-walking/geojson`, {
        method: 'POST',
        headers: { Authorization: cfg.orsKey, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
        body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]), instructions: true, language: 'it', units: 'km' }),
        timeoutMs: 15_000,
      });
      if (res.status === 429) throw new AppError('rate_limited', 'Il servizio di percorsi è al limite. Riprova tra poco.');
      if (res.status === 401 || res.status === 403) throw new AppError('unavailable', 'Chiave del servizio di percorsi non valida.');
      if (!res.ok) throw new AppError('unavailable', 'Impossibile calcolare il percorso (punti non raggiungibili a piedi o servizio non disponibile). Puoi salvare il percorso inserendo la distanza a mano.');
      const j = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: { summary?: { distance?: number }; segments?: Array<{ steps?: Array<{ instruction?: string; distance?: number }> }> } }> };
      const f = j.features?.[0];
      const coords = f?.geometry?.coordinates;
      if (!coords || coords.length < 2 || typeof f?.properties?.summary?.distance !== 'number') throw new AppError('unavailable', 'Risposta del servizio di percorsi non valida.');
      const geometry = simplify(coords.map(([lng, lat]) => ({ lat, lng })));
      result = {
        distanceKm: Math.round(lengthKm(geometry) * 100) / 100, // la distanza è quella del tracciato restituito
        geometry,
        steps: (f.properties.segments ?? []).flatMap((s) => s.steps ?? []).map((s) => ({ text: String(s.instruction ?? ''), distanceKm: Math.round((s.distance ?? 0) * 100) / 100 })).filter((s) => s.text),
        provider: 'OpenRouteService',
        attribution: 'Percorso: OpenRouteService · dati © OpenStreetMap contributors',
      };
    } else {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
      const res = await fetchT(`${cfg.osrmUrl}/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`, { timeoutMs: 15_000 });
      if (res.status === 429) throw new AppError('rate_limited', 'Il servizio di percorsi è al limite. Riprova tra poco.');
      if (!res.ok) throw new AppError('unavailable', 'Impossibile calcolare il percorso. Puoi salvare il percorso inserendo la distanza a mano.');
      const j = (await res.json()) as { code?: string; routes?: Array<{ geometry?: { coordinates?: number[][] }; legs?: Array<{ steps?: Array<{ name?: string; distance?: number; maneuver?: { type?: string; modifier?: string } }> }> }> };
      const r = j.routes?.[0];
      if (j.code !== 'Ok' || !r?.geometry?.coordinates || r.geometry.coordinates.length < 2) throw new AppError('unavailable', 'Nessun percorso trovato tra i punti scelti. Puoi salvare il percorso inserendo la distanza a mano.');
      const geometry = simplify(r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })));
      result = {
        distanceKm: Math.round(lengthKm(geometry) * 100) / 100,
        geometry,
        steps: (r.legs ?? []).flatMap((l) => l.steps ?? []).filter((s) => s.name).map((s) => ({ text: `${s.maneuver?.type ?? ''} ${s.maneuver?.modifier ?? ''} su ${s.name}`.trim(), distanceKm: Math.round((s.distance ?? 0) / 10) / 100 })),
        provider: 'OSRM',
        attribution: 'Percorso: OSRM · dati © OpenStreetMap contributors',
      };
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('unavailable', 'Servizio di percorsi non raggiungibile. Puoi salvare il percorso inserendo la distanza a mano.');
  }
  routeCache.set(key, result);
  return result;
}
