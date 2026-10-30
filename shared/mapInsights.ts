import { AppError, requireActorOf, type Ctx } from './engine.ts';
import { listRoutes } from './routes.ts';
import { haversineKm } from './time.ts';
import type { PlannedSession } from './types.ts';
import { listGear, type GearView } from './gear.ts';
import { hasMapConsent } from './mapConsent.ts';

export interface MapQuery { period?: 'global' | 'week' | 'night' | 'popular'; nearby?: { lat: number; lng: number; radiusKm: number } | null; gearId?: string | null }
export interface HeatCell { lat: number; lng: number; weight: number }
export interface SuggestedRoute { id: string; name: string; geometry: Array<{ lat: number; lng: number }>; distanceKm: number | null; favoriteCount: number; reason: string }
export interface MapInsights { heat: HeatCell[]; routes: SuggestedRoute[]; workouts: PlannedSession[]; basis: string | null; hasSharedTrace: boolean; gear: GearView | null }

/** Celle di circa 300 m: la risposta non contiene punti individuali né identificativi degli atleti. */
function cellOf(lat: number, lng: number) {
  const latStep = 300 / 111320;
  const row = Math.floor(lat / latStep);
  const centerLat = (row + 0.5) * latStep;
  const lngStep = 300 / (111320 * Math.max(0.05, Math.cos(centerLat * Math.PI / 180)));
  const col = Math.floor(lng / lngStep);
  return { key: `${row}:${col}`, lat: centerLat, lng: (col + 0.5) * lngStep };
}
const validPoint = (p: { lat: number; lng: number }) => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/**
 * Corse "notturne": partite tra le 20:00 e le 05:59 all'ora italiana (il fuso dell'utente non è salvato sull'allenamento:
 * limite dichiarato). Le celle restano aggregate e anonime come sempre.
 */
const ROME_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' });
export const isNight = (ms: number): boolean => {
  const h = Number(ROME_HOUR.format(new Date(ms)));
  return h >= 20 || h < 6;
};
/** "Più popolata": solo celle percorse da almeno 6 persone diverse (soglia doppia, quindi ancora più anonima). */
export const POPULAR_MIN = 6;

export function mapInsights(ctx: Ctx, query: MapQuery = {}): MapInsights {
  const me = requireActorOf(ctx);
  const q = query && typeof query === 'object' ? query : {};
  const near = q.nearby;
  const gear = q.gearId == null ? null : listGear(ctx, false).find((g) => g.id === q.gearId);
  if (q.gearId != null && !gear) throw new AppError('not_found', 'Attrezzatura non disponibile. Scegli un tuo elemento attivo.');
  if (q.period != null && !['global', 'week', 'night', 'popular'].includes(q.period)) throw new AppError('validation', 'Scegli il periodo della mappa.');
  if (near != null && (!validPoint(near) || !Number.isFinite(near.radiusKm) || near.radiusKm <= 0 || near.radiusKm > 500)) throw new AppError('validation', 'Scegli una zona valida per la mappa.');
  const since = q.period === 'week' ? ctx.now.getTime() - 7 * 86400000 : -Infinity;
  const cells = new Map<string, { lat: number; lng: number; users: Set<string>; logs: Set<string> }>();
  for (const log of Object.values(ctx.db.workoutLogs)) {
    if (!hasMapConsent(log) || !log.track?.length || !ctx.db.users[log.userId]) continue;
    const started = Date.parse(log.startedAt);
    if (!Number.isFinite(started) || started < since || started > ctx.now.getTime()) continue;
    if (q.period === 'night' && !isNight(started)) continue;
    const first = log.track[0], last = log.track[log.track.length - 1];
    const visited = new Set<string>();
    for (const point of log.track) {
      if (!validPoint(point) || !validPoint(first) || !validPoint(last) || haversineKm(first, point) < 0.3 || haversineKm(last, point) < 0.3 || (near && haversineKm(near, point) > near.radiusKm)) continue;
      const cell = cellOf(point.lat, point.lng);
      if (visited.has(cell.key)) continue;
      visited.add(cell.key);
      const existing = cells.get(cell.key) ?? { lat: cell.lat, lng: cell.lng, users: new Set(), logs: new Set() };
      existing.users.add(log.userId); existing.logs.add(log.id); cells.set(cell.key, existing);
    }
  }
  const heat = [...cells.values()]  .filter((c) => c.users.size >= (q.period === 'popular' ? POPULAR_MIN : 3)).map((c) => ({ lat: c.lat, lng: c.lng, weight: c.logs.size })).sort((a, b) => b.weight - a.weight || a.lat - b.lat || a.lng - b.lng).slice(0, 80);
  const gearLogs = gear ? Object.values(ctx.db.workoutLogs).filter((l) => l.userId === me.id && l.gearId === gear.id && (l.origin == null || l.origin === 'app') && l.distanceKm != null && Number.isFinite(l.distanceKm) && l.distanceKm > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10) : [];
  const recent = Object.values(ctx.db.activities).filter((a) => a.userId === me.id && a.source !== 'strava' && (!gear || a.sport === gear.sport) && a.distanceKm != null && Number.isFinite(a.distanceKm) && a.distanceKm > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const distances = (gearLogs.length ? gearLogs : recent).map((a) => a.distanceKm!).sort((a, b) => a - b);
  const median = distances.length ? distances[Math.floor(distances.length / 2)] : null;
  const candidates = new Map(listRoutes(ctx, { scope: 'explore' }).map((r) => [r.id, r]));
  for (const favorite of listRoutes(ctx, { scope: 'saved' })) candidates.set(favorite.id, favorite);
  const routes = [...candidates.values()].filter((r) => r.geometry && r.geometry.length > 1 && (!near || haversineKm(near, r.geometry[0]) <= near.radiusKm))
    .sort((a, b) => median != null ? Math.abs((a.distanceKm ?? Infinity) - median) - Math.abs((b.distanceKm ?? Infinity) - median) || b.favoriteCount - a.favoriteCount : b.favoriteCount - a.favoriteCount)
    .slice(0, 8).map((r): SuggestedRoute => ({ id: r.id, name: r.name, geometry: r.geometry!, distanceKm: r.distanceKm, favoriteCount: r.favoriteCount, reason: median != null && r.distanceKm != null ? gearLogs.length ? `Distanza simile alle tue uscite con ${gear!.name}` : gear ? `Distanza vicina alle tue attività di ${gear.sport === 'walking' ? 'camminata' : gear.sport === 'trail' ? 'trail' : 'corsa'}` : 'Distanza vicina alle tue ultime attività' : r.isFavorite ? 'Tra i tuoi percorsi salvati' : r.isOwner ? 'Un tuo percorso' : 'Percorso pubblico' }));
  const today = ctx.now.toISOString().slice(0, 10);
  const workouts = Object.values(ctx.db.sessions).filter((s) => s.userId === me.id && s.date >= today && (s.status === 'planned' || s.status === 'rescheduled') && (s.kind === 'aerobic' || s.kind.startsWith('run_')) && (!gear || (gear.sport === 'walking' ? s.kind === 'aerobic' : s.kind.startsWith('run_')))).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).slice(0, 5);
  const basis = gearLogs.length ? `Basato sulle tue ultime ${gearLogs.length} attività con ${gear!.name}.` : gear && recent.length ? `Non hai ancora uscite associate a ${gear.name}: uso le tue ultime ${recent.length} attività dello stesso sport.` : gear ? `Nessuna uscita associata a ${gear.name}: mostra i percorsi disponibili senza dedurre usura o distanze adatte.` : recent.length ? `Basato sulle tue ultime ${recent.length} attività registrate in Runngo o importate da file.` : null;
  return { heat, routes, workouts, basis, gear: gear ?? null, hasSharedTrace: Object.values(ctx.db.workoutLogs).some((l) => l.userId === me.id && hasMapConsent(l)) };
}

/** La condivisione del completamento non autorizza mai il GPS: serve questa scelta distinta. */
export function setMapVisibility(ctx: Ctx, id: string, on: boolean): { id: string; mapShared: boolean } {
  const me = requireActorOf(ctx);
  const log = ctx.db.workoutLogs[id];
  if (!log || log.userId !== me.id) throw new AppError('not_found', 'Attività non trovata.');
  if (typeof on !== 'boolean') throw new AppError('validation', 'Scegli se contribuire alla mappa di calore.');
  if ((log.origin != null && log.origin !== 'app') || !log.track?.length) throw new AppError('forbidden', 'Puoi contribuire solo con un percorso registrato da Runngo.');
  log.mapShared = on; log.heatmapConsent = on; log.updatedAt = ctx.now.toISOString();
  return { id, mapShared: on };
}

export const mapMethods = { mapInsights, setMapVisibility };
export const MAP_READ_ONLY = ['mapInsights'];
