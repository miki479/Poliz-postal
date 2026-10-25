import { findDuplicate, newActivity } from './activities.ts';
import { AppError, type Ctx } from './engine.ts';
import { SPORTS } from './sports.ts';
import type { Activity, Id, SportId, WorkoutLog } from './types.ts';
import { assertFileDocumentSize, cleanFileSamples, cleanFileSummary, type FileSample, type FileSummary } from './fileMeasurements.ts';
import { newId } from './ids.ts';

export interface ImportItem {
  samples?: FileSample[];
  summary?: FileSummary;
  durationSec?: number | null;
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
  // Tutti i limiti dei sensori vengono controllati prima della prima mutazione del database.
  let prepared: Array<ImportItem & { samples: FileSample[]; summary: FileSummary }>;
  try {
    prepared = items.map((item) => {
      const samples = cleanFileSamples(item?.samples); const summary = cleanFileSummary(item?.summary);
      assertFileDocumentSize({ samples, summary });
      return { ...item, samples, summary };
    });
  } catch (error) {
    throw new AppError('validation', error instanceof Error ? error.message : 'Il file contiene troppi dati. Suddividilo in attività più brevi.');
  }
  const res: ImportResult = { imported: 0, duplicates: 0, invalid: 0 };
  const known = new Set(Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.externalId).map((a) => a.externalId));
  const working = { ...ctx.db, activities: { ...ctx.db.activities } };
  const activities: Activity[] = []; const logs: WorkoutLog[] = [];
  for (const it of prepared) {
    const t = Date.parse(it?.date);
    const okSport = SPORTS.some((s) => s.id === it?.sport && s.enabled);
    const km = it?.distanceKm;
    const durationSec = it.durationSec === undefined ? (it.durationMin != null ? it.durationMin * 60 : null) : it.durationSec;
    const min = durationSec != null ? durationSec / 60 : null;
    const hasMeasurements = it.samples.some((s) => s.hr != null || s.alt != null || s.cadence != null) || Object.keys(it.summary).length > 0;
    if (
      !okSport || Number.isNaN(t) || t > ctx.now.getTime() + 3_600_000 || t < ctx.now.getTime() - 15 * 365 * 86_400_000 ||
      typeof it.externalId !== 'string' || it.externalId.length > 120 ||
      (km !== null && (typeof km !== 'number' || !(km > 0) || km > 500)) ||
      (min !== null && (typeof min !== 'number' || !Number.isFinite(min) || !(min > 0) || min > 2880)) ||
      (durationSec !== null && (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || !(durationSec > 0) || durationSec > 2880 * 60)) ||
      (km === null && min === null && !hasMeasurements)
    ) {
      res.invalid++;
      continue;
    }
    const externalId = `file:${it.externalId}`;
    if (known.has(externalId) || findDuplicate(working, { userId: uid, sport: it.sport, date: new Date(t).toISOString(), dayOnly: false, distanceKm: km, durationMin: min })) {
      res.duplicates++;
      continue;
    }
    const a = newActivity(ctx.now, { userId: uid, source: 'file', sport: it.sport, title: String(it.title ?? '').slice(0, 80), date: new Date(t).toISOString(), distanceKm: km, durationMin: min, externalId });
    const { samples, summary } = it;
    // Senza durata non si fabbrica un WorkoutLog con tempo zero: i sensori restano nell'attività privata.
    a.fileData = { durationSec, samples: durationSec != null && hasMeasurements ? [] : samples, summary };
    let log: WorkoutLog | undefined;
    if (durationSec != null && hasMeasurements) {
      const id = newId('wkl');
      log = { id, userId: uid, activityId: a.id, plannedSessionId: null, kind: it.sport === 'walking' ? 'aerobic' : 'run_free', title: a.title, startedAt: a.date, durationSec, distanceKm: km, paceSecPerKm: km ? Math.round(durationSec / km) : null, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', shared: false, origin: 'file', fileSamples: samples, fileSummary: summary, sport: it.sport === 'walking' ? 'walking' : 'running', ...(it.sport === 'trail' ? { trail: true } : {}), createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() };
    }
    try { assertFileDocumentSize(a); if (log) assertFileDocumentSize(log); }
    catch (error) { throw new AppError('validation', (error as Error).message); }
    activities.push(a); working.activities[a.id] = a;
    if (log) logs.push(log);
    known.add(externalId);
    res.imported++;
  }
  for (const activity of activities) ctx.db.activities[activity.id] = activity;
  for (const log of logs) ctx.db.workoutLogs[log.id] = log;
  return res;
}

/** Il dettaglio con i campioni sanitari è leggibile solo dal proprietario. */
export function getFileActivity(ctx: Ctx, id: Id): Activity {
  const activity = ctx.db.activities[id];
  if (!ctx.actorId || !activity || activity.userId !== ctx.actorId || activity.source !== 'file') throw new AppError('not_found', 'Attività non trovata.');
  const log = Object.values(ctx.db.workoutLogs).find((l) => l.activityId === activity.id && l.userId === ctx.actorId && l.origin === 'file');
  return log ? { ...activity, fileData: { durationSec: log.durationSec, samples: log.fileSamples ?? [], summary: log.fileSummary ?? {} } } : activity;
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
  for (const l of Object.values(ctx.db.workoutLogs)) if (l.userId === uid && l.origin === source) delete ctx.db.workoutLogs[l.id];
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

export const importMethods = { importActivities, deleteImported, setActivityVisibility, getFileActivity } as const;
