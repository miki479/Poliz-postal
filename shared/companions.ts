/**
 * "Con chi hai corso": come i gruppi di attività, ma calcolato solo sui dati di Runngo.
 * Due allenamenti sono della stessa corsa se:
 *  - entrambi hanno una traccia GPS registrata nell'app;
 *  - le partenze sono entro 15 minuti e entro 300 m;
 *  - almeno il 60% dei punti della traccia più corta sta entro 60 m dall'altra traccia.
 * Vale anche fuori dai club e anche per una corsa avviata "da solo".
 * Privacy: compare solo chi ha reso l'allenamento visibile ai compagni (shared) e condivide le attività
 * (privacy.shareActivity). Si mostra solo il nome pubblico, mai il percorso dell'altra persona.
 */
import { AppError, toPublic, type Ctx } from './engine.ts';
import { haversineKm } from './time.ts';
import { downsample } from './track.ts';
import type { Id, TrackPoint, UserPublic, WorkoutLog } from './types.ts';

const START_MIN = 15;
const START_KM = 0.3;
const NEAR_KM = 0.06;
const OVERLAP = 0.6;

function overlap(a: TrackPoint[], b: TrackPoint[]): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const s = downsample(short, 120);
  const l = downsample(long, 600);
  let near = 0;
  for (const p of s) if (l.some((q) => haversineKm(p, q) <= NEAR_KM)) near++;
  return s.length ? near / s.length : 0;
}

export function sameRun(a: WorkoutLog, b: WorkoutLog): boolean {
  if (!a.track || !b.track || a.track.length < 2 || b.track.length < 2) return false;
  if (Math.abs(Date.parse(a.startedAt) - Date.parse(b.startedAt)) > START_MIN * 60_000) return false;
  if (haversineKm(a.track[0], b.track[0]) > START_KM) return false;
  return overlap(a.track, b.track) >= OVERLAP;
}

/** Persone che hanno fatto la stessa corsa (solo chi ha scelto di condividere). */
export function companionsOf(db: Ctx['db'], log: WorkoutLog): UserPublic[] {
  if (!log.track || log.track.length < 2) return [];
  const t = Date.parse(log.startedAt);
  const out = new Map<Id, UserPublic>();
  for (const o of Object.values(db.workoutLogs)) {
    if (o.userId === log.userId || out.has(o.userId) || !o.shared) continue;
    if (Math.abs(Date.parse(o.startedAt) - t) > START_MIN * 60_000) continue;
    const u = db.users[o.userId];
    if (!u || !u.privacy.shareActivity) continue;
    if (sameRun(log, o)) out.set(o.userId, toPublic(db, o.userId));
  }
  return [...out.values()];
}

export function runCompanions(ctx: Ctx, logId: Id): UserPublic[] {
  const log = ctx.db.workoutLogs[logId];
  if (!ctx.actorId || !log || log.userId !== ctx.actorId) throw new AppError('not_found', 'Allenamento non trovato.');
  const confirmed = Object.values(ctx.db.workoutCompanions ?? {}).filter((r) => r.logId === logId && r.fromId === ctx.actorId && r.status === 'accepted' && ctx.db.users[r.toId]);
  return confirmed.map((r) => toPublic(ctx.db,r.toId));
}
