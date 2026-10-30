/**
 * "Tu e gli altri": confronto con le persone con cui hai corso nelle uscite di gruppo.
 * Usa solo dati veri e consentiti: le uscite a cui hai partecipato (tuo allenamento collegato all'uscita) e gli allenamenti
 * che gli altri partecipanti hanno scelto di condividere con lo stesso collegamento. Niente stime: se manca un dato non compare.
 */
import { AppError, toPublic, type Ctx } from './engine.ts';
import type { Id, UserPublic, WorkoutLog } from './types.ts';

export interface PeerComparison {
  user: UserPublic;
  runsTogether: number;
  /** Differenza di passo media sulle uscite in comune (secondi/km): negativo = sei più veloce di lui/lei. */
  paceDiffSec: number | null;
  kmTogether: number;
}
export interface GroupComparison {
  groupRuns: number;
  /** Il tuo passo medio e quello medio degli altri nelle stesse uscite (secondi/km). */
  myPace: number | null;
  othersPace: number | null;
  /** Posizione per passo nelle uscite in cui altri hanno condiviso il tempo: 1 = il più veloce. */
  avgRank: number | null;
  longestWithGroupKm: number | null;
  peers: PeerComparison[];
}

const pace = (l: WorkoutLog) => (l.distanceKm && l.distanceKm >= 0.5 && l.durationSec > 0 ? l.durationSec / l.distanceKm : null);

export function groupComparison(ctx: Ctx): GroupComparison {
  const uid = ctx.actorId;
  if (!uid || !ctx.db.users[uid]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const { db } = ctx;
  const logs = Object.values(db.workoutLogs);
  const mine = logs.filter((l) => l.userId === uid && l.eventId);
  const peers = new Map<Id, { runs: number; km: number; diffs: number[] }>();
  const myPaces: number[] = [], otherPaces: number[] = [], ranks: number[] = [];
  let longest: number | null = null;
  for (const m of mine) {
    const mp = pace(m);
    if (m.distanceKm) longest = Math.max(longest ?? 0, m.distanceKm);
    const others = logs.filter((l) => l.eventId === m.eventId && l.userId !== uid && l.shared && db.users[l.userId]?.privacy.shareActivity);
    for (const o of others) {
      const p = peers.get(o.userId) ?? { runs: 0, km: 0, diffs: [] };
      p.runs++; p.km += o.distanceKm ?? 0;
      const op = pace(o);
      if (mp && op) p.diffs.push(mp - op);
      peers.set(o.userId, p);
    }
    const ops = others.map(pace).filter((x): x is number => x !== null);
    if (mp && ops.length) {
      myPaces.push(mp); otherPaces.push(ops.reduce((a, b) => a + b, 0) / ops.length);
      ranks.push(1 + ops.filter((x) => x < mp).length);
    }
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const round = (x: number | null) => (x === null ? null : Math.round(x));
  return {
    groupRuns: mine.length,
    myPace: round(avg(myPaces)),
    othersPace: round(avg(otherPaces)),
    avgRank: ranks.length ? Math.round((avg(ranks) ?? 0) * 10) / 10 : null,
    longestWithGroupKm: longest === null ? null : Math.round(longest * 10) / 10,
    peers: [...peers.entries()].map(([id, p]) => ({ user: toPublic(db, id), runsTogether: p.runs, kmTogether: Math.round(p.km * 10) / 10, paceDiffSec: p.diffs.length ? Math.round(avg(p.diffs)!) : null })).sort((a, b) => b.runsTogether - a.runsTogether).slice(0, 6),
  };
}
export const comparisonMethods = { groupComparison } as const;
export const COMPARISON_READ_ONLY = ['groupComparison'];
