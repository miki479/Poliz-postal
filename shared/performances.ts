/**
 * Migliori prestazioni. Metodi distinti e dichiarati:
 *  - "segment": porzione CONTINUA più veloce di una distanza (1, 5, 10 km) su una traccia GPS registrata dall'app,
 *    interpolando i tempi tra i punti. Escluse: tapis roulant, tracce con interruzioni, attività corrette a mano,
 *    passi non plausibili (sotto 2:30/km o sopra 20:00/km). Mai ricavata dal passo medio della corsa.
 *  - "total": tempo totale di una corsa la cui distanza è entro +5% della distanza di riferimento (non è un record
 *    su porzione: è il tempo della corsa intera).
 *  - "longest": distanza totale della corsa più lunga (dichiarata, registrata o importata; deduplicata tra fonti).
 *  - Record importati dai provider: non disponibili (l'importazione Strava legge solo i riepiloghi).
 * Solo corsa: la camminata non si confronta con la corsa.
 */
import { computeBadges } from './badges.ts';
import { AppError } from './engine.ts';
import { isRunFamily } from './sports.ts';
import { haversineKm } from './time.ts';
import type { Activity, DbState, Id, TrackPoint, WorkoutLog } from './types.ts';

export type PerformanceMethod = 'segment' | 'total' | 'longest' | 'consistency' | 'group';

export interface Performance {
  id: string;
  label: string;
  method: PerformanceMethod;
  /** Secondi (segment/total) o km (longest) o conteggio. */
  value: number;
  unit: 'sec' | 'km' | 'settimane' | 'uscite';
  date: string | null;
  activityTitle: string | null;
  /** Da dove viene il dato. */
  origin: string;
  methodText: string;
  estimate: boolean;
}

export interface PerformanceBook {
  recent: Performance[];
  allTime: Performance[];
  consistency: Performance[];
  group: Performance[];
  /** Tracce escluse dal calcolo dei segmenti, con il motivo. */
  excluded: Array<{ title: string; reason: string }>;
  limits: string[];
}

const SEGMENTS: Array<[number, string]> = [
  [1, 'Miglior 1 km'],
  [5, 'Migliori 5 km'],
  [10, 'Migliori 10 km'],
];
const TOTALS: Array<[number, string]> = [
  [5, '5 km · tempo totale'],
  [10, '10 km · tempo totale'],
  [21.0975, 'Mezza maratona · tempo totale'],
];
const RECENT_DAYS = 90;
const SRC: Record<Activity['source'], string> = { manual: 'Registrata nell’app o inserita a mano', event: 'Uscita di gruppo confermata', strava: 'Importata da Strava', file: 'Importata da file' };

/** Tempo minimo (s) su una porzione continua di `km` lungo la traccia, oppure null. */
export function bestSegmentSec(track: TrackPoint[], km: number): number | null {
  if (track.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + haversineKm(track[i - 1], track[i]));
  if (cum[cum.length - 1] < km) return null;
  let best: number | null = null;
  let i = 0;
  for (let j = 1; j < track.length; j++) {
    const target = cum[j] - km;
    if (target < 0) continue;
    while (i + 1 < j && cum[i + 1] <= target) i++;
    const seg = cum[i + 1] - cum[i];
    const tAt = seg > 0 ? track[i].t + ((target - cum[i]) / seg) * (track[i + 1].t - track[i].t) : track[i].t;
    const sec = track[j].t - tAt;
    if (sec > 0 && (best === null || sec < best)) best = sec;
  }
  return best === null ? null : Math.round(best);
}

export function trackIssue(l: WorkoutLog): string | null {
  if (!l.track || l.track.length < 2) return 'senza traccia';
  if (l.origin === 'strava') return 'tracciato importato senza tempi';
  if (l.environment === 'treadmill') return 'tapis roulant';
  if (l.sport === 'walking') return 'camminata';
  // Il passo non si confronta con la corsa su strada: dislivello (trail) o due andature alternate (corsa + camminata).
  if (l.trail) return 'trail';
  if (l.kind === 'run_walk') return 'corsa e camminata';
  if (l.edited) return 'distanza o durata corrette a mano';
  if (l.gpsQuality && l.gpsQuality.gaps > 0) return 'traccia con interruzioni';
  for (let i = 1; i < l.track.length; i++) if (l.track[i].t < l.track[i - 1].t) return 'tempi della traccia non coerenti';
  return null;
}

/** Motivi che non sono un difetto della traccia ma un'attività di altro tipo: non si elencano tra le escluse. */
const NOT_A_RUN_ISSUE = new Set(['senza traccia', 'camminata', 'trail', 'corsa e camminata']);

export function getPerformances(ctx: import('./engine.ts').Ctx): PerformanceBook {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return computePerformances(ctx.db, ctx.actorId, ctx.now);
}

export function computePerformances(db: DbState, userId: Id, now = new Date()): PerformanceBook {
  const nowIso = now.toISOString();
  const recentSince = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
  const logs = Object.values(db.workoutLogs).filter((l) => l.userId === userId && l.startedAt <= nowIso);
  const excluded: PerformanceBook['excluded'] = [];
  const recent: Performance[] = [];
  const allTime: Performance[] = [];

  const good = logs.filter((l) => {
    const why = trackIssue(l);
    if (why && !NOT_A_RUN_ISSUE.has(why)) excluded.push({ title: l.title, reason: why });
    return !why;
  });
  for (const [km, label] of SEGMENTS) {
    let bestAll: Performance | null = null;
    let bestRecent: Performance | null = null;
    for (const l of good) {
      const sec = bestSegmentSec(l.track!, km);
      if (sec === null) continue;
      const pace = sec / km;
      if (pace < 150 || pace > 1200) {
        excluded.push({ title: l.title, reason: 'passo non plausibile sulla traccia' });
        continue;
      }
      const p: Performance = { id: `segment_${km}`, label, method: 'segment', value: sec, unit: 'sec', date: l.startedAt, activityTitle: l.title, origin: 'Traccia GPS registrata nell’app', methodText: `Porzione continua più veloce di ${km} km sulla traccia, con tempi interpolati tra i punti GPS.`, estimate: false };
      if (!bestAll || sec < bestAll.value) bestAll = p;
      if (l.startedAt >= recentSince && (!bestRecent || sec < bestRecent.value)) bestRecent = p;
    }
    if (bestAll) allTime.push(bestAll);
    if (bestRecent) recent.push(bestRecent);
  }

  const acts = Object.values(db.activities).filter((a) => a.userId === userId && a.sport === 'running' && a.date <= nowIso);
  for (const [km, label] of TOTALS) {
    const fit = acts.filter((a) => a.distanceKm !== null && a.durationMin !== null && a.distanceKm >= km && a.distanceKm <= km * 1.05);
    const pick = (list: Activity[]) => list.sort((a, b) => a.durationMin! - b.durationMin!)[0];
    for (const [list, into] of [[fit, allTime], [fit.filter((a) => a.date >= recentSince), recent]] as const) {
      const a = pick([...list]);
      if (a) into.push({ id: `total_${km}`, label, method: 'total', value: Math.round(a.durationMin! * 60), unit: 'sec', date: a.date, activityTitle: a.title || null, origin: SRC[a.source], methodText: `Durata totale di una corsa tra ${km} e ${Math.round(km * 1.05 * 10) / 10} km: non è il tempo su una porzione.`, estimate: false });
    }
  }
  const longestOf = (list: Activity[]) => list.filter((a) => a.distanceKm !== null).sort((a, b) => b.distanceKm! - a.distanceKm!)[0];
  for (const [list, into] of [[acts, allTime], [acts.filter((a) => a.date >= recentSince), recent]] as const) {
    const a = longestOf([...list]);
    if (a) into.push({ id: 'longest', label: 'Corsa più lunga', method: 'longest', value: a.distanceKm!, unit: 'km', date: a.date, activityTitle: a.title || null, origin: SRC[a.source], methodText: 'Distanza totale dell’attività. Le corse arrivate da più fonti contano una volta sola.', estimate: false });
  }

  const badges = computeBadges(db, userId, now);
  const streak = badges.find((b) => b.id === 'streak_12');
  const consistency: Performance[] = streak && streak.current ? [{ id: 'best_streak', label: 'Settimane consecutive con almeno un’attività', method: 'consistency', value: streak.current, unit: 'settimane', date: null, activityTitle: null, origin: 'Tutte le attività, senza duplicati', methodText: 'Serie più lunga di settimane (lunedì–domenica) con almeno un’attività.', estimate: false }] : [];

  // Uscite di gruppo: contano anche trail e corsa + camminata (sono corse insieme, qui non si confronta il passo).
  const groupRuns = Object.values(db.activities).filter((a) => a.userId === userId && a.source === 'event' && isRunFamily(a.sport) && a.date <= nowIso).length;
  const organized = Object.values(db.events).filter((e) => e.organizerId === userId && e.status === 'active' && e.startsAt <= nowIso).length;
  const group: Performance[] = [];
  if (groupRuns) group.push({ id: 'group_runs', label: 'Uscite di gruppo corse', method: 'group', value: groupRuns, unit: 'uscite', date: null, activityTitle: null, origin: 'Uscite confermate su Runngo', methodText: 'Uscite di gruppo con presenza confermata.', estimate: false });
  if (organized) group.push({ id: 'organized', label: 'Uscite organizzate e svolte', method: 'group', value: organized, unit: 'uscite', date: null, activityTitle: null, origin: 'Uscite su Runngo', methodText: 'Uscite organizzate da te, svolte e non annullate.', estimate: false });

  return {
    recent,
    allTime,
    consistency,
    group,
    excluded,
    limits: ['I record su porzione richiedono una corsa registrata con il GPS dell’app, senza interruzioni.', 'I record calcolati da Strava non vengono importati: arrivano solo i riepiloghi delle attività.'],
  };
}
