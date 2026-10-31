/**
 * Report della corsa di gruppo: temporaneo, compare dopo la fine dell'uscita più una pausa di attesa (i membri hanno il tempo di
 * salvare), e sparisce dopo 72 ore. Confronta SOLO chi ha davvero corso insieme sullo stesso tragitto:
 *  - serve un tragitto GPS con tempi (app Runngo o file); chi ha solo un riepilogo senza traccia non si può verificare e non compare;
 *  - chi è nel gruppo ma ha corso altrove o in un altro gruppo non compare;
 *  - chi si stacca compare solo per il tratto in cui è stato con il gruppo (fino al punto in cui si allontana).
 * Classifica per cadenza (passi/minuto) se almeno due hanno il dato, altrimenti per passo. Solo allenamenti condivisi dai partecipanti.
 */
import { AppError, toPublic, type Ctx } from './engine.ts';
import { haversineKm } from './time.ts';
import { downsample } from './track.ts';
import type { Id, TrackPoint, UserPublic, WorkoutLog } from './types.ts';

const STANDBY_MIN = 30;
const LIFETIME_H = 72;
const TOGETHER_M = 120;
const MIN_TOGETHER_KM = 0.8;

export interface ReportEntry {
  user: UserPublic;
  togetherKm: number;
  togetherSec: number;
  paceSec: number | null;
  cadenceSpm: number | null;
  /** Km dopo i quali si è staccato dal gruppo; null = è rimasto fino alla fine. */
  leftAtKm: number | null;
  source: 'Runngo' | 'File' | 'Strava';
  me: boolean;
}
export interface GroupReport {
  ready: boolean;
  availableAt: string;
  expiresAt: string;
  metric: 'cadence' | 'pace';
  entries: ReportEntry[];
  /** Primi tre per la metrica scelta. */
  podium: Id[];
  /** Tragitti dei corridori, semplificati, per la mappa comune. */
  tracks: Array<{ userId: Id; points: Array<{ lat: number; lng: number }> }>;
}

function nearest(p: TrackPoint, ref: TrackPoint[]): number {
  let best = Infinity;
  for (const r of ref) { const d = haversineKm(p, r) * 1000; if (d < best) best = d; }
  return best;
}

/** Tratto iniziale con il gruppo: si ferma al primo allontanamento (3 campioni di fila oltre la soglia). */
function togetherSlice(track: TrackPoint[], ref: TrackPoint[]): { pts: TrackPoint[]; left: boolean } {
  const pts = downsample(track.filter((p) => !p.breakBefore || true), 400);
  let out = 0;
  for (let i = 0; i < pts.length; i++) {
    if (nearest(pts[i], ref) > TOGETHER_M) { out++; if (out >= 3) return { pts: pts.slice(0, Math.max(0, i - 2)), left: true }; } else out = 0;
  }
  return { pts, left: false };
}
const lenKm = (pts: TrackPoint[]) => pts.reduce((n, p, i) => (i ? n + haversineKm(pts[i - 1], p) : 0), 0);

export function groupReport(ctx: Ctx, eventId: Id): GroupReport | null {
  const uid = ctx.actorId;
  if (!uid || !ctx.db.users[uid]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const { db, now } = ctx;
  const ev = db.events[eventId];
  if (!ev || ev.status !== 'active') return null;
  if (!db.participations[`${eventId}__${uid}`]) throw new AppError('forbidden', 'Il report è per chi partecipa all’uscita.');
  const expectedMin = ev.distanceKm && ev.paceSecPerKm ? (ev.distanceKm * ev.paceSecPerKm) / 60 : 90;
  const availableAt = new Date(Date.parse(ev.startsAt) + (expectedMin + STANDBY_MIN) * 60_000);
  const expiresAt = new Date(availableAt.getTime() + LIFETIME_H * 3_600_000);
  const base = { availableAt: availableAt.toISOString(), expiresAt: expiresAt.toISOString() };
  if (now < availableAt) return { ready: false, ...base, metric: 'pace', entries: [], podium: [], tracks: [] };
  if (now > expiresAt) return null;

  const logs = Object.values(db.workoutLogs).filter((l): l is WorkoutLog => l.eventId === eventId && (l.userId === uid || (l.shared && !!db.users[l.userId]?.privacy.shareActivity)) && !!l.track && l.track.length > 5 && l.track.every((p, i, a) => i === 0 || p.t >= a[i - 1].t) && l.track[l.track.length - 1].t > l.track[0].t);
  if (logs.length < 2) return { ready: true, ...base, metric: 'pace', entries: [], podium: [], tracks: [] };
  const ref = downsample([...logs].sort((a, b) => b.track!.length - a.track!.length)[0].track!, 300);
  const entries: ReportEntry[] = [];
  const tracks: GroupReport['tracks'] = [];
  for (const l of logs) {
    const { pts, left } = togetherSlice(l.track!, ref);
    const km = lenKm(pts);
    if (pts.length < 3 || km < MIN_TOGETHER_KM) continue;
    const sec = pts[pts.length - 1].t - pts[0].t;
    if (sec <= 0) continue;
    entries.push({
      user: toPublic(db, l.userId), togetherKm: Math.round(km * 100) / 100, togetherSec: Math.round(sec), paceSec: Math.round(sec / km), cadenceSpm: l.metrics?.cadenceSpm ?? null,
      leftAtKm: left ? Math.round(km * 10) / 10 : null, source: l.origin === 'strava' ? 'Strava' : l.origin === 'file' ? 'File' : 'Runngo', me: l.userId === uid,
    });
    tracks.push({ userId: l.userId, points: downsample(pts, 80).map((p) => ({ lat: p.lat, lng: p.lng })) });
  }
  const withCad = entries.filter((e) => e.cadenceSpm !== null);
  const metric: GroupReport['metric'] = withCad.length >= 2 ? 'cadence' : 'pace';
  const ranked = metric === 'cadence' ? [...withCad].sort((a, b) => b.cadenceSpm! - a.cadenceSpm!) : [...entries].sort((a, b) => a.paceSec! - b.paceSec!);
  return { ready: true, ...base, metric, entries, podium: ranked.slice(0, 3).map((e) => e.user.id), tracks };
}
export const groupReportMethods = { groupReport } as const;
export const GROUP_REPORT_READ_ONLY = ['groupReport'];
