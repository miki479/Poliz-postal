/**
 * Racconti da Strava. Strava restituisce nella lista attività un tracciato semplificato (`map.summary_polyline`,
 * permesso `activity:read`) SENZA tempi. Da qui nasce un allenamento privato con tracciato:
 *  - nessun tempo viene inventato: i punti hanno t = 0, quindi il replay è solo una rivelazione grafica e i passaggi
 *    per chilometro non si calcolano;
 *  - resta privato (shared = false) e solo del proprietario, come tutti i dati Strava;
 *  - un solo allenamento per attività importata (collegato con activityId), quindi nessun doppione.
 */
import { newId } from './ids.ts';
import { isRunFamily } from './sports.ts';
import { downsample } from './track.ts';
import type { Activity, DbState, TrackPoint, WorkoutLog, ActivityMetrics, SportId } from './types.ts';

/** Decodifica il formato "encoded polyline" di Google (precisione 5), usato da Strava. */
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let shift = 0, result = 0, b: number;
      do {
        if (i >= encoded.length) return out;
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += d;
      else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/**
 * Misure del riepilogo Strava: solo quelle realmente presenti (altrimenti null).
 * Per corsa e trail Strava indica la cadenza di una gamba sola: qui si raddoppia; per la camminata no.
 */
export function metricsFromSummary(it: Record<string, unknown>, sport: SportId): ActivityMetrics {
  const perLeg = isRunFamily(sport);
  const n = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v > min ? v : null);
  const hasHr = it.has_heartrate !== false;
  const cad = n(it.average_cadence);
  const speed = n(it.max_speed);
  return {
    movingSec: n(it.moving_time),
    elapsedSec: n(it.elapsed_time),
    hrAvg: hasHr && n(it.average_heartrate) ? Math.round(n(it.average_heartrate)!) : null,
    hrMax: hasHr && n(it.max_heartrate) ? Math.round(n(it.max_heartrate)!) : null,
    // total_elevation_gain = 0 è un dato valido (percorso piatto) solo se la fonte lo dichiara: qui 0 viene ignorato per prudenza
    elevGainM: n(it.total_elevation_gain) ? Math.round(n(it.total_elevation_gain)!) : null,
    maxSpeedKmh: speed ? Math.round(speed * 3.6 * 10) / 10 : null,
    cadenceSpm: cad ? Math.round(perLeg ? cad * 2 : cad) : null,
    calories: n(it.calories),
    avgWatts: n(it.average_watts),
  };
}

/** Allinea le misure del racconto a quelle del riepilogo Strava (idempotente, anche per attività già importate). */
export function applyMetrics(db: DbState, activityId: string, m: ActivityMetrics): boolean {
  const log = Object.values(db.workoutLogs).find((l) => l.activityId === activityId && l.origin === 'strava');
  if (!log) return false;
  const has = Object.values(m).some((v) => v !== null);
  if (!has) return false;
  if (JSON.stringify(log.metrics ?? null) === JSON.stringify(m)) return false;
  log.metrics = m;
  return true;
}

const STORY_TITLE: Record<'running' | 'walking' | 'trail' | 'run_walk', string> = { running: 'Corsa', walking: 'Camminata', trail: 'Trail', run_walk: 'Corsa + camminata' };

/**
 * Allinea il racconto al tipo dell'attività (es. una corsa importata prima che esistesse il trail e poi riconosciuta
 * come "TrailRun"): idempotente, restituisce true se ha cambiato qualcosa.
 */
export function alignStoryLog(db: DbState, a: Activity): boolean {
  const log = Object.values(db.workoutLogs).find((l) => l.activityId === a.id && l.origin === 'strava');
  if (!log || log.sport === 'walking') return false;
  const trail = a.sport === 'trail';
  if (!!log.trail === trail) return false;
  if (trail) log.trail = true;
  else delete log.trail;
  return true;
}

/** Crea (una sola volta) l'allenamento con tracciato per un'attività Strava. Restituisce true se ne ha creato uno. */
export function ensureStoryLog(db: DbState, a: Activity, polyline: string | null | undefined, now: Date, metrics?: ActivityMetrics): boolean {
  if (!polyline || a.source !== 'strava') return false;
  // Solo corse (anche trail) e camminate hanno un racconto: per gli altri tipi non si saprebbe come mostrarlo.
  if (a.sport !== 'walking' && !isRunFamily(a.sport)) return false;
  if (Object.values(db.workoutLogs).some((l) => l.activityId === a.id)) return false;
  const pts = decodePolyline(polyline).filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  if (pts.length < 2) return false;
  const track: TrackPoint[] = downsample(pts.map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, t: 0 })), 900);
  const sec = Math.max(60, Math.round((a.durationMin ?? 1) * 60));
  const t = now.toISOString();
  const log: WorkoutLog = {
    id: newId('wkl'),
    userId: a.userId,
    plannedSessionId: null,
    kind: a.sport === 'walking' ? 'aerobic' : a.sport === 'run_walk' ? 'run_walk' : 'run_free',
    title: a.title || STORY_TITLE[a.sport === 'trail' || a.sport === 'run_walk' || a.sport === 'walking' ? a.sport : 'running'],
    startedAt: a.date,
    durationSec: sec,
    distanceKm: a.distanceKm,
    paceSecPerKm: a.distanceKm && a.distanceKm >= 0.5 ? Math.round(sec / a.distanceKm) : null,
    rpe: null,
    difficulties: '',
    notes: '',
    sets: [],
    mode: 'manual',
    activityId: a.id,
    shared: false,
    track,
    brief: null,
    metrics: metrics && Object.values(metrics).some((v) => v !== null) ? metrics : null,
    sport: a.sport === 'walking' ? 'walking' : 'running',
    ...(a.sport === 'trail' ? { trail: true } : {}),
    environment: 'outdoor',
    distanceSource: null,
    gpsQuality: null,
    eventId: null,
    edited: false,
    origin: 'strava',
    createdAt: t,
    updatedAt: t,
  };
  db.workoutLogs[log.id] = log;
  return true;
}
