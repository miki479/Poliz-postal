import { findDuplicate, newActivity } from './activities.ts';
import { AppError, registerPurger, type Ctx } from './engine.ts';
import { isRunKind, kindGroup } from './exercises.ts';
import { newId } from './ids.ts';
import { generatePlan } from './planGenerator.ts';
import { zonedToUtcIso } from './time.ts';
import type {
  ExerciseRoutine,
  Id,
  Intensity,
  LoggedSet,
  MuscleGroup,
  EquipmentId,
  PlanWizardInput,
  PlannedExercise,
  PlannedSession,
  RunEvent,
  Segment,
  SessionInput,
  SessionKind,
  TrackPoint,
  TrainingPlan,
  WorkoutLog,
  WorkoutLogInput,
} from './types.ts';
import { clean, type FieldErrors } from './validation.ts';

const KINDS: SessionKind[] = ['run_easy', 'run_continuous', 'run_intervals', 'run_progressive', 'run_long', 'run_free', 'run_walk', 'aerobic', 'strength', 'rest', 'recovery_active', 'mobility'];
const INTENSITIES: Intensity[] = ['low', 'moderate', 'high'];
const MUSCLES: MuscleGroup[] = ['legs', 'glutes', 'core', 'back', 'upper', 'full'];
const EQUIP: EquipmentId[] = ['bodyweight', 'dumbbells', 'barbell', 'machines', 'bands', 'kettlebell'];
const SEG_KINDS: Segment['kind'][] = ['warmup', 'run', 'walk', 'work', 'recovery', 'cooldown'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString();

const validDay = (s: unknown): s is string => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

const num = (v: unknown): number | null | undefined => (v === null || v === undefined || v === '' ? null : typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function validateExercises(raw: unknown, errors: FieldErrors, field = 'exercises'): PlannedExercise[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 30) {
    errors[field] = 'Massimo 30 esercizi.';
    return [];
  }
  const out: PlannedExercise[] = [];
  for (const e of raw as Array<Partial<PlannedExercise>>) {
    const name = clean(e?.name, 60);
    const load = num(e?.loadKg);
    if (name.length < 2 || !MUSCLES.includes(e?.muscle as MuscleGroup) || !EQUIP.includes(e?.equipment as EquipmentId) || !Number.isInteger(e?.sets) || (e!.sets as number) < 1 || (e!.sets as number) > 10 || !Number.isInteger(e?.reps) || (e!.reps as number) < 1 || (e!.reps as number) > 200 || load === undefined || (load !== null && (load < 0 || load > 1000)) || !Number.isInteger(e?.restSec) || (e!.restSec as number) < 0 || (e!.restSec as number) > 900) {
      errors[field] = 'Esercizio non valido: controlla nome, serie (1–10), ripetizioni, carico e recupero.';
      return [];
    }
    out.push({ name, muscle: e.muscle as MuscleGroup, equipment: e.equipment as EquipmentId, sets: e.sets as number, reps: e.reps as number, loadKg: load, restSec: e.restSec as number });
  }
  return out;
}

export function validateSessionInput(raw: Partial<SessionInput> | null | undefined): { ok: true; value: SessionInput } | { ok: false; errors: FieldErrors } {
  const r = raw ?? {};
  const errors: FieldErrors = {};
  if (!validDay(r.date)) errors.date = 'Data non valida.';
  const time = r.time === null || r.time === undefined || r.time === '' ? null : typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : undefined;
  if (time === undefined) errors.time = 'Ora non valida.';
  if (!KINDS.includes(r.kind as SessionKind)) errors.kind = 'Scegli il tipo di allenamento.';
  const title = clean(r.title, 80);
  if (title.length < 2) errors.title = 'Scrivi un nome per la sessione.';
  const description = clean(r.description, 500);
  const notes = clean(r.notes, 500);
  const isRest = r.kind === 'rest';
  const dur = r.durationMin;
  if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < (isRest ? 0 : 5) || dur > 360) errors.durationMin = isRest ? 'Durata non valida.' : 'La durata deve essere tra 5 e 360 minuti.';
  const dist = num(r.distanceKm);
  if (dist === undefined || (dist !== null && (dist < 0.1 || dist > 100))) errors.distanceKm = 'La distanza deve essere tra 0,1 e 100 km.';
  const pace = num(r.paceSecPerKm);
  if (pace === undefined || (pace !== null && (pace < 120 || pace > 900))) errors.paceSecPerKm = 'Ritmo non valido (tra 2:00 e 15:00 al km).';
  const intensity = r.intensity === null || r.intensity === undefined ? null : INTENSITIES.includes(r.intensity) ? r.intensity : undefined;
  if (intensity === undefined) errors.intensity = 'Intensità non valida.';
  const warm = r.warmupMin ?? 0;
  const cool = r.cooldownMin ?? 0;
  if (!Number.isFinite(warm) || warm < 0 || warm > 30) errors.warmupMin = 'Da 0 a 30 minuti.';
  if (!Number.isFinite(cool) || cool < 0 || cool > 30) errors.cooldownMin = 'Da 0 a 30 minuti.';
  const segments: Segment[] = [];
  if (r.segments !== undefined && r.segments !== null) {
    if (!Array.isArray(r.segments) || r.segments.length > 40) errors.segments = 'Massimo 40 blocchi.';
    else
      for (const s of r.segments) {
        if (!SEG_KINDS.includes(s?.kind) || !Number.isFinite(s?.durationSec) || s.durationSec < 5 || s.durationSec > 7200 || !Number.isInteger(s?.reps) || s.reps < 1 || s.reps > 50) {
          errors.segments = 'Blocco non valido: durata da 5 s a 2 ore, ripetizioni da 1 a 50.';
          break;
        }
        segments.push({ kind: s.kind, label: clean(s.label, 60), durationSec: Math.round(s.durationSec), reps: s.reps });
      }
  }
  const exercises = validateExercises(r.exercises, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      planId: typeof r.planId === 'string' ? r.planId : null,
      date: r.date as string,
      time: time ?? null,
      kind: r.kind as SessionKind,
      title,
      description,
      durationMin: Math.round(dur as number),
      distanceKm: dist ?? null,
      intensity: intensity ?? null,
      paceSecPerKm: pace ?? null,
      warmupMin: Math.round(warm),
      cooldownMin: Math.round(cool),
      segments,
      exercises,
      notes,
    },
  };
}

function own<T extends { userId: Id }>(ctx: Ctx, rec: T | undefined, what: string): T {
  if (!rec) throw new AppError('not_found', `${what} non trovato.`);
  if (rec.userId !== actor(ctx)) throw new AppError('not_found', `${what} non trovato.`); // non rivela l'esistenza di dati altrui
  return rec;
}

/* ---------- sessioni pianificate ---------- */

const pending = (s: PlannedSession) => s.status === 'planned' || s.status === 'rescheduled';

export function listSessions(ctx: Ctx, range?: { from?: string; to?: string } | null): PlannedSession[] {
  const uid = actor(ctx);
  const f = range && typeof range === 'object' ? range : {};
  return Object.values(ctx.db.sessions)
    .filter((s) => s.userId === uid && (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function getSession(ctx: Ctx, id: Id): PlannedSession {
  return own(ctx, ctx.db.sessions[id], 'Sessione');
}

export function createSession(ctx: Ctx, input: SessionInput): PlannedSession {
  const uid = actor(ctx);
  const v = validateSessionInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  if (Object.values(ctx.db.sessions).filter((s) => s.userId === uid).length >= 3000) throw new AppError('conflict', 'Hai raggiunto il limite di sessioni salvate.');
  const planId = v.value.planId && ctx.db.plans[v.value.planId]?.userId === uid ? v.value.planId : null;
  const s: PlannedSession = { id: newId('ses'), userId: uid, ...v.value, planId, status: 'planned', rescheduledFrom: null, eventId: null, logId: null, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  ctx.db.sessions[s.id] = s;
  return s;
}

export function updateSession(ctx: Ctx, id: Id, input: SessionInput): PlannedSession {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (s.status === 'completed') throw new AppError('conflict', 'Una sessione completata non si modifica: correggi il registro dell\'allenamento.');
  const v = validateSessionInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const oldDate = s.date;
  Object.assign(s, v.value, { planId: s.planId, updatedAt: iso(ctx.now) });
  if (s.date !== oldDate) {
    s.rescheduledFrom = s.rescheduledFrom ?? oldDate;
    s.status = 'rescheduled';
  }
  return s;
}

export function moveSession(ctx: Ctx, id: Id, date: string, time?: string | null): PlannedSession {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (s.status === 'completed') throw new AppError('conflict', 'Una sessione completata non si sposta.');
  if (!validDay(date)) throw new AppError('validation', 'Data non valida.', { date: 'Data non valida.' });
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError('validation', 'Ora non valida.', { time: 'Ora non valida.' });
  if (date !== s.date) {
    s.rescheduledFrom = s.rescheduledFrom ?? s.date;
    s.status = 'rescheduled';
    s.date = date;
  }
  if (time !== undefined) s.time = time || null;
  s.updatedAt = iso(ctx.now);
  return s;
}

export function skipSession(ctx: Ctx, id: Id, skipped = true): PlannedSession {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (s.status === 'completed') throw new AppError('conflict', 'La sessione è già completata.');
  s.status = skipped ? 'skipped' : s.rescheduledFrom ? 'rescheduled' : 'planned';
  s.updatedAt = iso(ctx.now);
  return s;
}

export function markSessionDone(ctx: Ctx, id: Id, done = true): PlannedSession {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (typeof done !== 'boolean') throw new AppError('validation', 'Stato non valido.');
  if (s.logId || s.linkedActivityId) throw new AppError('conflict', 'Questa seduta ha un’attività collegata: modifica la registrazione.');
  if (done && s.date > new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ctx.now)) throw new AppError('validation', 'Non puoi completare una seduta futura.');
  s.manualDone = done;
  s.status = done ? 'completed' : s.rescheduledFrom ? 'rescheduled' : 'planned';
  s.updatedAt = iso(ctx.now);
  return s;
}

export function deleteSession(ctx: Ctx, id: Id): { deleted: true } {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  delete ctx.db.sessions[s.id];
  return { deleted: true };
}

/** Collega la sessione a un'uscita di gruppo creata dall'utente. */
export function linkSessionEvent(ctx: Ctx, id: Id, eventId: Id | null): PlannedSession {
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (eventId) {
    const e = ctx.db.events[eventId];
    if (!e || e.organizerId !== s.userId) throw new AppError('forbidden', 'Puoi collegare solo uscite che hai organizzato tu.');
  }
  s.eventId = eventId;
  s.updatedAt = iso(ctx.now);
  return s;
}

/* ---------- registro allenamenti ---------- */

export function validateLog(raw: Partial<WorkoutLogInput> | null | undefined, now: Date): { ok: true; value: WorkoutLogInput } | { ok: false; errors: FieldErrors } {
  const r = raw ?? {};
  const errors: FieldErrors = {};
  if (!KINDS.includes(r.kind as SessionKind)) errors.kind = 'Tipo non valido.';
  const title = clean(r.title, 80);
  if (title.length < 2) errors.title = 'Scrivi un nome.';
  const started = typeof r.startedAt === 'string' ? Date.parse(r.startedAt) : NaN;
  if (Number.isNaN(started)) errors.startedAt = 'Data non valida.';
  else if (started > now.getTime() + 3_600_000) errors.startedAt = 'Non puoi registrare un allenamento futuro.';
  else if (started < now.getTime() - 5 * 365 * 86_400_000) errors.startedAt = 'Data troppo lontana.';
  const dur = r.durationSec;
  if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 60 || dur > 24 * 3600) errors.durationSec = 'La durata deve essere tra 1 minuto e 24 ore.';
  const dist = num(r.distanceKm);
  if (dist === undefined || (dist !== null && (dist <= 0 || dist > 300))) errors.distanceKm = 'Distanza non valida (0,1–300 km).';
  const rpe = num(r.rpe);
  if (rpe === undefined || (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10))) errors.rpe = 'La fatica va da 1 a 10.';
  const sets: LoggedSet[] = [];
  if (r.sets !== undefined && r.sets !== null) {
    if (!Array.isArray(r.sets) || r.sets.length > 200) errors.sets = 'Massimo 200 serie.';
    else
      for (const s of r.sets) {
        const load = num(s?.loadKg);
        const exercise = clean(s?.exercise, 60);
        if (exercise.length < 2 || !Number.isInteger(s?.set) || s.set < 1 || s.set > 50 || !Number.isInteger(s?.reps) || s.reps < 0 || s.reps > 500 || load === undefined || (load !== null && (load < 0 || load > 1000))) {
          errors.sets = 'Serie non valida: controlla esercizio, ripetizioni e carico.';
          break;
        }
        sets.push({ exercise, set: s.set, reps: s.reps, loadKg: load, done: s.done !== false });
      }
  }
  if (r.mode !== 'manual' && r.mode !== 'timer') errors.mode = 'Modalità non valida.';
  const track = cleanTrack(r.track);
  if (track === undefined) errors.track = 'Tracciato non valido.';
  const sport = r.sport === 'walking' ? 'walking' : 'running';
  const environment = r.environment === 'treadmill' ? 'treadmill' : 'outdoor';
  // Tapis roulant: nessuna traccia GPS e nessuna distanza "GPS".
  if (environment === 'treadmill' && track) errors.track = 'Il tapis roulant non ha traccia GPS.';
  const distanceSource = r.distanceSource === 'gps' || r.distanceSource === 'manual' ? r.distanceSource : null;
  if (distanceSource === 'gps' && (environment === 'treadmill' || !track)) errors.distanceKm = 'Distanza GPS senza traccia.';
  const gq = r.gpsQuality;
  const gpsQuality = gq && Number.isInteger(gq.gaps) && gq.gaps >= 0 && gq.gaps < 1000 && typeof gq.lostSec === 'number' && gq.lostSec >= 0 && gq.lostSec <= 24 * 3600 ? { gaps: gq.gaps, lostSec: Math.round(gq.lostSec) } : null;
  const eventId = typeof r.eventId === 'string' && r.eventId ? r.eventId : null;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      plannedSessionId: typeof r.plannedSessionId === 'string' ? r.plannedSessionId : null,
      kind: r.kind as SessionKind,
      title,
      startedAt: new Date(started).toISOString(),
      durationSec: Math.round(dur as number),
      distanceKm: dist ?? null,
      rpe: rpe ?? null,
      difficulties: clean(r.difficulties, 300),
      notes: clean(r.notes, 500),
      sets,
      mode: r.mode as 'manual' | 'timer',
      shared: r.shared === true,
      heatmapConsent: r.heatmapConsent === true && !!track && environment === 'outdoor',
      timezone: typeof r.timezone === 'string' ? r.timezone : 'Europe/Rome',
      track: track ?? null,
      sport,
      environment,
      distanceSource: dist ? distanceSource ?? 'manual' : null,
      gpsQuality,
      eventId,
    },
  };
}

const MAX_TRACK_POINTS = 1500;

/** Accetta solo punti GPS plausibili (max 1500, già semplificati dal client). `undefined` = non valido, `null` = assente. */
function cleanTrack(raw: unknown): TrackPoint[] | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length > MAX_TRACK_POINTS) return undefined;
  const out: TrackPoint[] = [];
  for (const p of raw as Array<Partial<TrackPoint>>) {
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || typeof p.t !== 'number') return undefined;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !Number.isFinite(p.t) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || p.t < 0 || p.t > 24 * 3600) return undefined;
    const alt = typeof p.alt === 'number' && Number.isFinite(p.alt) && p.alt > -500 && p.alt < 9000 ? Math.round(p.alt * 10) / 10 : undefined;
    out.push(alt === undefined ? { lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, t: Math.round(p.t) } : { lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, t: Math.round(p.t), alt });
  }
  raw.forEach((p, i) => { if (p?.breakBefore === true) out[i].breakBefore = true; });
  return out.length >= 2 ? out : null;
}

export interface CompleteResult {
  log: WorkoutLog;
  session: PlannedSession | null;
  /** Se l'attività equivalente era già nello storico (es. importata da Strava), è stata collegata invece di duplicarla. */
  linkedExisting: boolean;
}

function record(ctx: Ctx, uid: Id, input: WorkoutLogInput, session: PlannedSession | null): CompleteResult {
  const log: WorkoutLog = {
    id: newId('wkl'),
    userId: uid,
    plannedSessionId: session?.id ?? null,
    kind: input.kind,
    title: input.title,
    startedAt: input.startedAt,
    durationSec: input.durationSec,
    distanceKm: input.distanceKm,
    paceSecPerKm: input.distanceKm ? Math.round(input.durationSec / input.distanceKm) : null,
    rpe: input.rpe,
    difficulties: input.difficulties,
    notes: input.notes,
    sets: input.sets,
    mode: input.mode,
    activityId: null,
    shared: input.shared,
    heatmapConsent: input.heatmapConsent === true,
    mapShared: input.heatmapConsent === true,
    track: input.track ?? null,
    brief: null,
    sport: input.sport ?? 'running',
    environment: input.environment ?? 'outdoor',
    distanceSource: input.distanceSource ?? null,
    gpsQuality: input.gpsQuality ?? null,
    eventId: null,
    edited: false,
    createdAt: iso(ctx.now),
    updatedAt: iso(ctx.now),
  };
  let linkedExisting = false;
  const sport = input.sport ?? 'running';
  // Uscita di gruppo come contesto: valida solo se eri iscritto e la registrazione cade vicino all'orario dell'uscita.
  let event: RunEvent | null = null;
  if (input.eventId) {
    const e = ctx.db.events[input.eventId];
    const t = Date.parse(input.startedAt);
    const okTime = e && t >= Date.parse(e.startsAt) - 2 * 3_600_000 && t <= Date.parse(e.startsAt) + 6 * 3_600_000;
    if (!e || e.status !== 'active' || !ctx.db.participations[`${e.id}__${uid}`] || !okTime) throw new AppError('validation', 'Questa registrazione non corrisponde a un’uscita a cui sei iscritto.', { eventId: 'Uscita non valida.' });
    event = e;
    log.eventId = e.id;
  }
  if (isRunKind(input.kind) || sport === 'walking') {
    const cand = { userId: uid, sport, date: input.startedAt, dayOnly: input.mode === 'manual', distanceKm: input.distanceKm, durationMin: Math.round(input.durationSec / 60) };
    // Se l'uscita è già stata confermata, la registrazione si collega a quella (nessun doppio conteggio né doppi riconoscimenti).
    const already = event ? Object.values(ctx.db.activities).find((a) => a.userId === uid && a.eventId === event!.id) : undefined;
    const dup = already ?? findDuplicate(ctx.db, cand);
    if (dup) {
      log.activityId = dup.id;
      linkedExisting = true;
    } else {
      const a = newActivity(ctx.now, { userId: uid, source: event ? 'event' : 'manual', eventId: event?.id ?? null, sport, title: input.title || event?.title || '', date: input.startedAt, dayOnly: cand.dayOnly, distanceKm: input.distanceKm, durationMin: cand.durationMin, planSessionId: session?.id ?? null, visibility: input.shared ? 'shared' : 'private' });
      ctx.db.activities[a.id] = a;
      log.activityId = a.id;
    }
  }
  ctx.db.workoutLogs[log.id] = log;
  if (session) {
    session.status = 'completed';
    session.logId = log.id;
    session.updatedAt = iso(ctx.now);
  }
  return { log, session, linkedExisting };
}

export function completeSession(ctx: Ctx, id: Id, input: WorkoutLogInput): CompleteResult {
  const uid = actor(ctx);
  const s = own(ctx, ctx.db.sessions[id], 'Sessione');
  if (s.status === 'completed') throw new AppError('conflict', 'Questa sessione è già stata completata.');
  const v = validateLog({ ...input, plannedSessionId: s.id, kind: s.kind }, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  return record(ctx, uid, v.value, s);
}

export function logWorkout(ctx: Ctx, input: WorkoutLogInput): CompleteResult {
  const uid = actor(ctx);
  const v = validateLog({ ...input, plannedSessionId: null }, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  return record(ctx, uid, v.value, null);
}

export function listWorkoutLogs(ctx: Ctx, filter?: { from?: string | null; to?: string | null; kind?: SessionKind | null } | null): WorkoutLog[] {
  const uid = actor(ctx);
  const f = filter && typeof filter === 'object' ? filter : {};
  return Object.values(ctx.db.workoutLogs)
    .filter((l) => l.userId === uid && (!f.from || l.startedAt >= f.from) && (!f.to || l.startedAt < f.to) && (!f.kind || l.kind === f.kind))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 500);
}

export function getWorkoutLog(ctx: Ctx, id: Id): WorkoutLog {
  return own(ctx, ctx.db.workoutLogs[id], 'Allenamento');
}

export function updateWorkoutLog(ctx: Ctx, id: Id, patch: Partial<WorkoutLogInput>): WorkoutLog {
  const l = own(ctx, ctx.db.workoutLogs[id], 'Allenamento');
  const merged = { ...l, ...patch, plannedSessionId: l.plannedSessionId, kind: l.kind, timezone: 'UTC', mode: l.mode } as unknown as Partial<WorkoutLogInput>;
  const v = validateLog(merged, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const edited = l.edited || (!!l.track && (v.value.distanceKm !== l.distanceKm || v.value.durationSec !== l.durationSec));
  if (patch.sport && !l.plannedSessionId) {
    l.sport = patch.sport === 'walking' ? 'walking' : 'running';
    // Un trail cambiato in camminata non è più un trail; "corsa" lo lascia trail (il modulo non distingue la strada).
    if (l.sport === 'walking') delete l.trail;
  }
  if (edited && l.distanceKm !== v.value.distanceKm) l.distanceSource = v.value.distanceKm ? 'manual' : null;
  // I dati Strava restano privati anche se un vecchio client invia shared:true.
  const shared = l.origin === 'strava' ? false : v.value.shared;
  l.brief = null;
  if (Object.prototype.hasOwnProperty.call(patch, 'heatmapConsent')) {
    const consent = (l.origin == null || l.origin === 'app') && v.value.heatmapConsent === true;
    l.heatmapConsent = consent; l.mapShared = consent;
  }
  Object.assign(l, { edited, title: v.value.title, durationSec: v.value.durationSec, distanceKm: v.value.distanceKm, paceSecPerKm: v.value.distanceKm ? Math.round(v.value.durationSec / v.value.distanceKm) : null, rpe: v.value.rpe, difficulties: v.value.difficulties, notes: v.value.notes, sets: v.value.sets, shared, updatedAt: iso(ctx.now) });
  // Se il log ha creato un'attività sua (non collegata a una già esistente), tiene allineati i valori.
  const a = l.activityId ? ctx.db.activities[l.activityId] : undefined;
  if (a && a.planSessionId === l.plannedSessionId && a.source === 'manual' && a.userId === l.userId) {
    Object.assign(a, { distanceKm: l.distanceKm, durationMin: Math.round(l.durationSec / 60), visibility: l.shared ? 'shared' : 'private', sport: l.trail ? 'trail' : l.sport ?? a.sport, updatedAt: iso(ctx.now) });
  }
  return l;
}

export function deleteWorkoutLog(ctx: Ctx, id: Id): { deleted: true } {
  const l = own(ctx, ctx.db.workoutLogs[id], 'Allenamento');
  const a = l.activityId ? ctx.db.activities[l.activityId] : undefined;
  if (a && a.source === 'manual' && a.planSessionId === l.plannedSessionId && a.userId === l.userId && (l.plannedSessionId !== null || a.title === l.title)) delete ctx.db.activities[a.id];
  const s = l.plannedSessionId ? ctx.db.sessions[l.plannedSessionId] : undefined;
  if (s && s.logId === l.id) {
    s.status = s.rescheduledFrom ? 'rescheduled' : 'planned';
    s.logId = null;
  }
  delete ctx.db.workoutLogs[l.id];
  return { deleted: true };
}

/* ---------- piani ---------- */

function validateWizard(raw: Partial<PlanWizardInput> | null | undefined): { ok: true; value: PlanWizardInput } | { ok: false; errors: FieldErrors } {
  const r = raw ?? {};
  const errors: FieldErrors = {};
  const name = clean(r.name, 60) || 'Il mio piano';
  if (!['start_running', 'endurance', 'distance', 'pace', 'strength_support', 'general_fitness', 'race_5k', 'race_10k', 'half_marathon'].includes(r.goal as string)) errors.goal = 'Scegli un obiettivo.';
  if (!['beginner', 'intermediate', 'advanced'].includes(r.level as string)) errors.level = 'Scegli il livello.';
  const weekdays = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))] : [];
  if (!weekdays.length) errors.weekdays = 'Scegli almeno un giorno disponibile.';
  const maxMinutes = r.maxMinutes;
  if (typeof maxMinutes !== 'number' || maxMinutes < 20 || maxMinutes > 180) errors.maxMinutes = 'La durata massima deve essere tra 20 e 180 minuti.';
  const equipment = Array.isArray(r.equipment) ? r.equipment.filter((e): e is EquipmentId => EQUIP.includes(e)) : [];
  if (!['solo', 'group', 'mixed'].includes(r.preference as string)) errors.preference = 'Scegli una preferenza.';
  if (!validDay(r.startDate) || new Date(`${r.startDate}T12:00:00Z`).getUTCDay() !== 1) errors.startDate = 'La settimana di inizio deve partire di lunedì.';
  const weeks = r.weeks;
  if (!Number.isInteger(weeks) || (weeks as number) < 1 || (weeks as number) > 12) errors.weeks = 'Da 1 a 12 settimane.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, goal: r.goal!, level: r.level!, weekdays, maxMinutes: maxMinutes as number, equipment, preference: r.preference!, includeStrength: r.includeStrength === true, includeMobility: r.includeMobility === true, startDate: r.startDate as string, weeks: weeks as number } };
}

/** Anteprima del piano generato, SENZA salvarlo: l'utente può rivederlo prima di confermare. */
export function previewPlan(ctx: Ctx, input: PlanWizardInput): { sessions: SessionInput[]; warnings: string[] } {
  actor(ctx);
  const v = validateWizard(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  return generatePlan(v.value);
}

export function createPlanFromWizard(ctx: Ctx, input: PlanWizardInput): { plan: TrainingPlan; sessions: PlannedSession[] } {
  const uid = actor(ctx);
  const v = validateWizard(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const gen = generatePlan(v.value);
  const plan = insertPlan(ctx, uid, v.value, 'wizard');
  const created = gen.sessions.map((s) => insertSession(ctx, uid, s, plan.id));
  return { plan, sessions: created };
}

export function createPlan(ctx: Ctx, input: { name: string; startDate: string; weeks: number }): TrainingPlan {
  const uid = actor(ctx);
  const name = clean(input?.name, 60);
  if (name.length < 2) throw new AppError('validation', 'Dai un nome al piano.', { name: 'Dai un nome al piano.' });
  if (!validDay(input?.startDate)) throw new AppError('validation', 'Data non valida.', { startDate: 'Data non valida.' });
  const weeks = Number.isInteger(input?.weeks) ? Math.min(52, Math.max(1, input.weeks)) : 4;
  return insertPlan(ctx, uid, { name, goal: 'endurance', level: 'beginner', weekdays: [], maxMinutes: 60, equipment: [], preference: 'mixed', includeStrength: false, startDate: input.startDate, weeks }, 'manual');
}

function insertPlan(ctx: Ctx, uid: Id, w: PlanWizardInput, origin: 'manual' | 'wizard'): TrainingPlan {
  if (Object.values(ctx.db.plans).filter((p) => p.userId === uid && !p.archived).length >= 20) throw new AppError('conflict', 'Hai già molti piani attivi: archiviane qualcuno.');
  const plan: TrainingPlan = { id: newId('pln'), userId: uid, name: w.name, goal: w.goal, level: w.level, weekdays: w.weekdays, maxMinutes: w.maxMinutes, equipment: w.equipment, preference: w.preference, startDate: w.startDate, weeks: w.weeks, origin, archived: false, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  ctx.db.plans[plan.id] = plan;
  return plan;
}

function insertSession(ctx: Ctx, uid: Id, input: SessionInput, planId: Id | null): PlannedSession {
  const s: PlannedSession = { id: newId('ses'), userId: uid, ...input, planId, status: 'planned', rescheduledFrom: null, eventId: null, logId: null, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  ctx.db.sessions[s.id] = s;
  return s;
}

export function listPlans(ctx: Ctx): TrainingPlan[] {
  const uid = actor(ctx);
  return Object.values(ctx.db.plans).filter((p) => p.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function archivePlan(ctx: Ctx, id: Id, archived = true): TrainingPlan {
  const p = own(ctx, ctx.db.plans[id], 'Piano');
  p.archived = archived;
  p.updatedAt = iso(ctx.now);
  return p;
}

/** Elimina il piano e le sessioni non ancora svolte. Le sessioni completate restano nello storico. */
export function deletePlan(ctx: Ctx, id: Id): { deleted: true; removedSessions: number } {
  const p = own(ctx, ctx.db.plans[id], 'Piano');
  let removed = 0;
  for (const s of Object.values(ctx.db.sessions)) {
    if (s.planId !== p.id) continue;
    if (s.status === 'completed') s.planId = null;
    else {
      delete ctx.db.sessions[s.id];
      removed++;
    }
  }
  delete ctx.db.plans[p.id];
  return { deleted: true, removedSessions: removed };
}

/* ---------- routine di forza ---------- */

export function listRoutines(ctx: Ctx): ExerciseRoutine[] {
  const uid = actor(ctx);
  return Object.values(ctx.db.routines).filter((r) => r.userId === uid).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveRoutine(ctx: Ctx, input: { id?: Id | null; name: string; exercises: PlannedExercise[] }): ExerciseRoutine {
  const uid = actor(ctx);
  const errors: FieldErrors = {};
  const name = clean(input?.name, 60);
  if (name.length < 2) errors.name = 'Dai un nome alla routine.';
  const exercises = validateExercises(input?.exercises, errors);
  if (!errors.exercises && exercises.length === 0) errors.exercises = 'Aggiungi almeno un esercizio.';
  if (Object.keys(errors).length) throw new AppError('validation', 'Controlla i campi evidenziati.', errors);
  const existing = input.id ? own(ctx, ctx.db.routines[input.id], 'Routine') : null;
  if (!existing && Object.values(ctx.db.routines).filter((r) => r.userId === uid).length >= 50) throw new AppError('conflict', 'Hai raggiunto il limite di routine.');
  const r: ExerciseRoutine = existing ?? { id: newId('rtn'), userId: uid, name, exercises, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  Object.assign(r, { name, exercises, updatedAt: iso(ctx.now) });
  ctx.db.routines[r.id] = r;
  return r;
}

export function deleteRoutine(ctx: Ctx, id: Id): { deleted: true } {
  const r = own(ctx, ctx.db.routines[id], 'Routine');
  delete ctx.db.routines[r.id];
  return { deleted: true };
}

/* ---------- riepiloghi e progressione (solo dati reali) ---------- */

export interface WeekSummary {
  weekStart: string;
  planned: { count: number; minutes: number };
  completed: { count: number; minutes: number };
  skipped: number;
  /** Carico soggettivo = minuti × fatica percepita (1–10), solo per i log con fatica inserita dall'utente. */
  perceivedLoad: number | null;
  byKind: Record<string, number>;
  /** Fonti mostrate separatamente. */
  sources: { plannedSessions: number; manualLogs: number; importedActivities: number; importedKm: number; manualKm: number };
}

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};

export function weekSummary(ctx: Ctx, weekStart: string, tz = 'Europe/Rome'): WeekSummary {
  const uid = actor(ctx);
  if (!validDay(weekStart)) throw new AppError('validation', 'Data non valida.', { weekStart: 'Data non valida.' });
  const end = addDays(weekStart, 6);
  const sessions = Object.values(ctx.db.sessions).filter((s) => s.userId === uid && s.date >= weekStart && s.date <= end && kindGroup(s.kind) !== 'recovery');
  const from = zonedToUtcIso(weekStart, '00:00', tz) ?? `${weekStart}T00:00:00Z`;
  const to = zonedToUtcIso(addDays(weekStart, 7), '00:00', tz) ?? `${addDays(weekStart, 7)}T00:00:00Z`;
  const logs = Object.values(ctx.db.workoutLogs).filter((l) => l.userId === uid && l.startedAt >= from && l.startedAt < to);
  const acts = Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.date >= from && a.date < to);
  const byKind: Record<string, number> = {};
  for (const l of logs) byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
  const withRpe = logs.filter((l) => l.rpe !== null);
  const imported = acts.filter((a) => a.source === 'strava' || a.source === 'file');
  const manual = acts.filter((a) => a.source === 'manual' || a.source === 'event');
  return {
    weekStart,
    planned: { count: sessions.length, minutes: sessions.reduce((s, x) => s + x.durationMin, 0) },
    completed: { count: logs.length, minutes: Math.round(logs.reduce((s, l) => s + l.durationSec, 0) / 60) },
    skipped: sessions.filter((s) => s.status === 'skipped').length,
    perceivedLoad: withRpe.length ? Math.round(withRpe.reduce((s, l) => s + (l.durationSec / 60) * (l.rpe as number), 0)) : null,
    byKind,
    sources: {
      plannedSessions: sessions.length,
      manualLogs: logs.length,
      importedActivities: imported.length,
      importedKm: Math.round(imported.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10,
      manualKm: Math.round(manual.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10,
    },
  };
}

export function trainingProgress(ctx: Ctx, weeks = 8, endWeekStart: string, tz = 'Europe/Rome'): WeekSummary[] {
  actor(ctx);
  const n = Math.min(26, Math.max(1, Number(weeks) || 8));
  const out: WeekSummary[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(weekSummary(ctx, addDays(endWeekStart, -7 * i), tz));
  return out;
}

export interface StrengthPoint {
  date: string;
  topLoadKg: number | null;
  volumeKg: number;
  sets: number;
  bestReps: number;
}

/** Progressione per esercizio: serie completate dall'utente. Un carico più alto non è "forma fisica": è solo un dato registrato. */
export function strengthProgress(ctx: Ctx): Array<{ exercise: string; points: StrengthPoint[] }> {
  const uid = actor(ctx);
  const map = new Map<string, Map<string, StrengthPoint>>();
  for (const l of Object.values(ctx.db.workoutLogs)) {
    if (l.userId !== uid) continue;
    for (const s of l.sets) {
      if (!s.done) continue;
      const day = l.startedAt.slice(0, 10);
      const ex = map.get(s.exercise) ?? new Map<string, StrengthPoint>();
      const p = ex.get(day) ?? { date: day, topLoadKg: null, volumeKg: 0, sets: 0, bestReps: 0 };
      p.sets++;
      p.bestReps = Math.max(p.bestReps, s.reps);
      if (s.loadKg !== null) {
        p.topLoadKg = Math.max(p.topLoadKg ?? 0, s.loadKg);
        p.volumeKg = Math.round((p.volumeKg + s.loadKg * s.reps) * 10) / 10;
      }
      ex.set(day, p);
      map.set(s.exercise, ex);
    }
  }
  return [...map.entries()]
    .map(([exercise, pts]) => ({ exercise, points: [...pts.values()].sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.points.length - a.points.length || a.exercise.localeCompare(b.exercise));
}

registerPurger((ctx, userId) => {
  for (const s of Object.values(ctx.db.sessions)) if (s.userId === userId) delete ctx.db.sessions[s.id];
  for (const p of Object.values(ctx.db.plans)) if (p.userId === userId) delete ctx.db.plans[p.id];
  for (const l of Object.values(ctx.db.workoutLogs)) if (l.userId === userId) delete ctx.db.workoutLogs[l.id];
  for (const r of Object.values(ctx.db.routines)) if (r.userId === userId) delete ctx.db.routines[r.id];
});

export const trainingMethods = {
  listSessions,
  getSession,
  createSession,
  updateSession,
  moveSession,
  skipSession,
  markSessionDone,
  deleteSession,
  linkSessionEvent,
  completeSession,
  logWorkout,
  listWorkoutLogs,
  getWorkoutLog,
  updateWorkoutLog,
  deleteWorkoutLog,
  previewPlan,
  createPlanFromWizard,
  createPlan,
  listPlans,
  archivePlan,
  deletePlan,
  listRoutines,
  saveRoutine,
  deleteRoutine,
  weekSummary,
  trainingProgress,
  strengthProgress,
} as const;
