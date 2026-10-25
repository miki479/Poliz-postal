import { findDuplicate, newActivity } from './activities.ts';
import { AppError, type Ctx } from './engine.ts';
import { SPORTS } from './sports.ts';
import type { Id, SportId } from './types.ts';

export interface ImportItem {
  externalId: string;
  sport: SportId;
  title: string;
  date: string;
  distanceKm: number | null;
  durationMin: number | null;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
}

const MAX_ITEMS = 500;

/**
 * Importa attività lette da file (GPX/TCX/Apple Salute) per l'utente corrente.
 * Le attività importate sono PRIVATE per impostazione predefinita (dati personali, anche di salute)
 * e non contano in sfide e classifiche finché l'utente non sceglie di condividerle una per una.
 */
export function importActivities(ctx: Ctx, items: ImportItem[]): ImportResult {
  const uid = ctx.actorId;
  if (!uid || !ctx.db.users[uid]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  if (!Array.isArray(items) || items.length === 0) throw new AppError('validation', 'Nessuna attività da importare.');
  if (items.length > MAX_ITEMS) throw new AppError('validation', `Puoi importare al massimo ${MAX_ITEMS} attività alla volta.`);
  const res: ImportResult = { imported: 0, duplicates: 0, invalid: 0 };
  const known = new Set(Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.externalId).map((a) => a.externalId));
  for (const it of items) {
    const t = Date.parse(it?.date);
    const okSport = SPORTS.some((s) => s.id === it?.sport && s.enabled);
    const km = it?.distanceKm;
    const min = it?.durationMin;
    if (
      !okSport || Number.isNaN(t) || t > ctx.now.getTime() + 3_600_000 || t < ctx.now.getTime() - 15 * 365 * 86_400_000 ||
      typeof it.externalId !== 'string' || it.externalId.length > 120 ||
      (km !== null && (typeof km !== 'number' || !(km > 0) || km > 500)) ||
      (min !== null && (typeof min !== 'number' || !(min >= 1) || min > 2880)) ||
      (km === null && min === null)
    ) {
      res.invalid++;
      continue;
    }
    const externalId = `file:${it.externalId}`;
    if (known.has(externalId) || findDuplicate(ctx.db, { userId: uid, sport: it.sport, date: new Date(t).toISOString(), dayOnly: false, distanceKm: km, durationMin: min })) {
      res.duplicates++;
      continue;
    }
    const a = newActivity(ctx.now, { userId: uid, source: 'file', sport: it.sport, title: String(it.title ?? '').slice(0, 80), date: new Date(t).toISOString(), distanceKm: km, durationMin: min, externalId });
    ctx.db.activities[a.id] = a;
    known.add(externalId);
    res.imported++;
  }
  return res;
}

/** Cancella le attività importate da una fonte (l'utente può sempre ritirare i dati importati). */
export function deleteImported(ctx: Ctx, source: 'file' | 'strava'): { deleted: number } {
  const uid: Id | null = ctx.actorId;
  if (!uid || !ctx.db.users[uid]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  if (source !== 'file' && source !== 'strava') throw new AppError('bad_request', 'Fonte non valida.');
  let n = 0;
  for (const a of Object.values(ctx.db.activities)) {
    if (a.userId === uid && a.source === source) {
      delete ctx.db.activities[a.id];
      n++;
    }
  }
  if (source === 'strava') for (const l of Object.values(ctx.db.workoutLogs)) if (l.userId === uid && l.origin === 'strava') delete ctx.db.workoutLogs[l.id];
  return { deleted: n };
}

/** Rende condivisibile (o di nuovo privata) un'attività importata da file: scelta esplicita dell'utente. */
export function setActivityVisibility(ctx: Ctx, id: Id, visibility: 'shared' | 'private'): { id: Id; visibility: 'shared' | 'private' } {
  const uid = ctx.actorId;
  if (!uid) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const a = ctx.db.activities[id];
  if (!a || a.userId !== uid) throw new AppError('not_found', 'Attività non trovata.');
  if (a.source === 'strava') throw new AppError('forbidden', 'I dati Strava restano privati: le condizioni dell\'API non ne consentono la condivisione.');
  if (visibility !== 'shared' && visibility !== 'private') throw new AppError('bad_request', 'Valore non valido.');
  a.visibility = visibility;
  a.updatedAt = ctx.now.toISOString();
  return { id: a.id, visibility };
}

export const importMethods = { importActivities, deleteImported, setActivityVisibility } as const;
