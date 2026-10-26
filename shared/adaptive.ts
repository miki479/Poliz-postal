/**
 * Piano adattivo: check-in privati, regole ESPLICITE di adattamento, anteprima, conferma e annullamento.
 *
 * Separazione dei ruoli:
 *  - questo modulo decide quali azioni sono ammesse e calcola l'anteprima (deterministico, testato);
 *  - l'AI può solo spiegare: non sceglie né scrive modifiche;
 *  - nulla cambia senza `applyPlanChange`, che riverifica stato e versioni (proposte obsolete → conflitto)
 *    ed è idempotente per `requestId` (doppio tap, retry).
 *
 * Regole di carico (revisionabili, non cliniche):
 *  R1 Stanchezza (energia ≤ 2) o fatica alta nell’ultimo allenamento (RPE ≥ 8 nelle 36 h): un allenamento intenso di oggi/domani
 *     può diventare corsa facile al 70% della durata (min 20'), essere spostata o saltata. Mai aumentare.
 *  R2 Poco tempo: se i minuti disponibili sono meno dell’allenamento, si riduce la durata (min 15'); gli allenamenti intensi
 *     si trasformano in facili invece di comprimere l'intensità.
 *  R3 Dolore o malessere: solo "salta" o "pausa". Nessuna alternativa "sicura", nessun invito a continuare.
 *  R4 Spostamento: solo nei 7 giorni successivi, in un giorno senza altri allenamenti; un allenamento intenso non va
 *     accanto a un'altra intensa.
 *  R5 Pausa/vacanza: gli allenamenti del periodo diventano "in pausa" (o ridotte e facili in vacanza "ridotta");
 *     alla ripresa NON si recuperano gli allenamenti persi.
 */
import { AppError, type Ctx } from './engine.ts';
import { isRunKind } from './exercises.ts';
import { newId } from './ids.ts';
import { isRunFamily } from './sports.ts';
import type { AdjustAction, CheckIn, CheckInKind, Id, PlanChange, PlanState, PlannedSession, SessionChangePreview, SessionKind } from './types.ts';
import { clean } from './validation.ts';

const iso = (d: Date) => d.toISOString();
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HIGH: SessionKind[] = ['run_intervals', 'run_progressive', 'run_continuous'];
const isHigh = (s: Pick<PlannedSession, 'kind' | 'intensity'>) => HIGH.includes(s.kind) || s.intensity === 'high';
const pending = (s: PlannedSession) => s.status === 'planned' || s.status === 'rescheduled';
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

const mySessions = (ctx: Ctx, uid: Id) => Object.values(ctx.db.sessions).filter((s) => s.userId === uid);

export function planStateOf(ctx: Ctx, uid: Id): PlanState {
  return ctx.db.planStates[uid] ?? { userId: uid, mode: 'active', from: null, until: null, vacation: null, updatedAt: '' };
}

/* ---------- check-in ---------- */

export interface CheckInInput {
  date: string;
  kind: CheckInKind;
  energy?: number | null;
  minutes?: number | null;
  pain?: CheckIn['pain'];
  note?: string;
}

/** Salva (o corregge) il check-in del giorno per quel tipo. Privato: nessun altro lo vede. */
export function saveCheckIn(ctx: Ctx, input: CheckInInput): CheckIn {
  const uid = actor(ctx);
  if (!input || !DAY_RE.test(input.date)) throw new AppError('validation', 'Data non valida.', { date: 'Data non valida.' });
  if (!['feeling', 'time', 'pain', 'illness'].includes(input.kind)) throw new AppError('validation', 'Tipo non valido.');
  const energy = input.kind === 'feeling' ? input.energy : null;
  if (input.kind === 'feeling' && (typeof energy !== 'number' || !Number.isInteger(energy) || energy < 1 || energy > 5)) throw new AppError('validation', 'Indica come ti senti da 1 a 5.', { energy: 'Da 1 a 5.' });
  const minutes = input.kind === 'time' ? input.minutes : null;
  if (input.kind === 'time' && (typeof minutes !== 'number' || minutes < 0 || minutes > 600)) throw new AppError('validation', 'Minuti non validi.', { minutes: 'Tra 0 e 600.' });
  let pain: CheckIn['pain'] = null;
  if (input.kind === 'pain') {
    const p = input.pain;
    if (!p || !['mild', 'moderate', 'severe'].includes(p.level) || !['new', 'persistent', 'worse'].includes(p.trend)) throw new AppError('validation', 'Descrivi intensità e andamento del dolore.');
    pain = { area: clean(p.area, 40), level: p.level, trend: p.trend, urgent: p.urgent === true };
  }
  const key = Object.values(ctx.db.checkins).find((c) => c.userId === uid && c.date === input.date && c.kind === input.kind);
  const now = iso(ctx.now);
  const c: CheckIn = { id: key?.id ?? newId('chk'), userId: uid, date: input.date, kind: input.kind, energy: energy ?? null, minutes: minutes ?? null, pain, note: clean(input.note, 200), createdAt: key?.createdAt ?? now, updatedAt: now };
  ctx.db.checkins[c.id] = c;
  return c;
}

export function deleteCheckIn(ctx: Ctx, id: Id): { deleted: true } {
  const uid = actor(ctx);
  const c = ctx.db.checkins[id];
  if (!c || c.userId !== uid) throw new AppError('not_found', 'Check-in non trovato.');
  delete ctx.db.checkins[id];
  return { deleted: true };
}

/* ---------- consigli: quali azioni sono pertinenti adesso ---------- */

export type AdviceTone = 'info' | 'care' | 'urgent';

export interface AdviceOption {
  action: AdjustAction;
  label: string;
  params: ChangeParams;
}

export interface PlanAdvice {
  date: string;
  state: PlanState;
  /** Allenamento a cui si riferisce il consiglio (oggi o la prossima entro 2 giorni). */
  session: PlannedSession | null;
  tone: AdviceTone;
  /** Messaggio breve; null se non c'è nulla da decidere. */
  message: string | null;
  /** Su quali dati si basa (mostrato all'utente). */
  basis: string[];
  options: AdviceOption[];
  /** "Parliamone": il Coach AI può spiegare, mai modificare. */
  canTalk: boolean;
  /** Stati dichiarati oggi nel check-in (servono ai colori: infortunio ≠ pausa ≠ riposo). Nessuna diagnosi. */
  flags: { pain: boolean; illness: boolean };
}

export type ChangeParams = { sessionId?: Id; date?: string; minutes?: number; from?: string; until?: string | null; style?: 'pause' | 'reduced'; maxMinutes?: number | null };

/** Prima data libera entro 7 giorni che rispetta R4. */
function freeDay(ctx: Ctx, uid: Id, s: PlannedSession, today: string): string | null {
  const all = mySessions(ctx, uid).filter((x) => x.id !== s.id && (pending(x) || x.status === 'completed'));
  for (let i = 1; i <= 7; i++) {
    const d = addDays(s.date < today ? today : s.date, i);
    if (all.some((x) => x.date === d)) continue;
    if (isHigh(s) && all.some((x) => isHigh(x) && (x.date === addDays(d, -1) || x.date === addDays(d, 1)))) continue;
    return d;
  }
  return null;
}

export function planAdvice(ctx: Ctx, date: string): PlanAdvice {
  const uid = actor(ctx);
  if (!DAY_RE.test(date)) throw new AppError('validation', 'Data non valida.');
  const state = planStateOf(ctx, uid);
  const base: PlanAdvice = { date, state, session: null, tone: 'info', message: null, basis: [], options: [], canTalk: false, flags: { pain: false, illness: false } };
  if (state.mode !== 'active') {
    return { ...base, message: state.mode === 'vacation' ? `Sei in vacanza${state.until ? ` fino al ${state.until.slice(8)}/${state.until.slice(5, 7)}` : ''}. Il piano aspetta te.` : 'Il piano è in pausa. Storico e progressi restano dove sono.', options: [{ action: 'resume', label: 'Riprendi il piano', params: { date } }] };
  }
  const upcoming = mySessions(ctx, uid).filter((s) => pending(s) && s.date >= date && s.date <= addDays(date, 2)).sort((a, b) => a.date.localeCompare(b.date));
  const session = upcoming.find((s) => s.date === date) ?? upcoming[0] ?? null;
  const checks = Object.values(ctx.db.checkins).filter((c) => c.userId === uid && c.date === date);
  const pain = checks.find((c) => c.kind === 'pain');
  const ill = checks.find((c) => c.kind === 'illness');
  const feel = checks.find((c) => c.kind === 'feeling');
  const time = checks.find((c) => c.kind === 'time');
  const opts: AdviceOption[] = [];
  const skip = (s: PlannedSession): AdviceOption => ({ action: 'skip', label: 'Salta questo allenamento', params: { sessionId: s.id } });
  const pause: AdviceOption = { action: 'pause', label: 'Metti in pausa il piano', params: { from: date, until: null } };

  // R3: dolore o malessere hanno la precedenza e non offrono alternative "sicure".
  if (pain?.pain) {
    const urgent = pain.pain.urgent || pain.pain.level === 'severe';
    const msg = urgent
      ? 'Hai segnalato un dolore forte o sintomi che ti preoccupano: interrompi l’attività. Se hai dolore al petto, difficoltà a respirare, svenimento o un trauma, chiama il 112.'
      : `Hai segnalato dolore${pain.pain.area ? ` (${pain.pain.area})` : ''}${pain.pain.trend === 'worse' ? ' in peggioramento' : pain.pain.trend === 'persistent' ? ' che persiste' : ''}. Interrompi l’attività che lo provoca e, se continua o peggiora, fatti valutare da un medico o da un fisioterapista.`;
    return { ...base, flags: { pain: true, illness: !!ill }, session, tone: urgent ? 'urgent' : 'care', message: msg, basis: ['Il tuo check-in di oggi (dolore)'], options: [...(session ? [skip(session)] : []), pause], canTalk: !urgent };
  }
  if (ill) return { ...base, flags: { pain: false, illness: true }, session, tone: 'care', message: 'Hai indicato di non stare bene. Riposa: il piano può aspettare.', basis: ['Il tuo check-in di oggi (malessere)'], options: [...(session ? [skip(session)] : []), pause], canTalk: true };
  if (!session) return base;

  const basis: string[] = [];
  let tired = false;
  if (feel && feel.energy !== null && feel.energy <= 2) {
    tired = true;
    basis.push(`Check-in di oggi: energia ${feel.energy}/5`);
  }
  const lastLog = Object.values(ctx.db.workoutLogs)
    .filter((l) => l.userId === uid && l.rpe !== null && Date.parse(l.startedAt) >= ctx.now.getTime() - 36 * 3_600_000)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (lastLog && (lastLog.rpe ?? 0) >= 8) {
    tired = true;
    basis.push(`Fatica percepita ${lastLog.rpe}/10 in “${lastLog.title}”`);
  }

  // R2: poco tempo.
  if (time && time.minutes !== null && time.minutes < session.durationMin) {
    basis.push(`Oggi hai ${time.minutes} minuti; l’allenamento ne prevede ${session.durationMin}`);
    if (time.minutes >= 15) opts.push(isHigh(session) ? { action: 'swap_easy', label: `Corsa facile di ${round5(time.minutes)}'`, params: { sessionId: session.id, minutes: time.minutes } } : { action: 'shorten', label: `Riduci a ${round5(time.minutes)}'`, params: { sessionId: session.id, minutes: time.minutes } });
    const d = freeDay(ctx, uid, session, date);
    if (d) opts.push({ action: 'move', label: `Sposta al ${d.slice(8)}/${d.slice(5, 7)}`, params: { sessionId: session.id, date: d } });
    opts.push(skip(session));
    return { ...base, session, message: 'Oggi hai meno tempo del previsto. Scegli tu come adattare l’allenamento.', basis, options: opts, canTalk: true };
  }

  // R1: stanchezza.
  if (tired && isRunKind(session.kind)) {
    if (isHigh(session)) opts.push({ action: 'swap_easy', label: 'Vedi alternativa leggera', params: { sessionId: session.id } });
    else opts.push({ action: 'shorten', label: `Riduci a ${round5(Math.max(20, session.durationMin * 0.7))}'`, params: { sessionId: session.id, minutes: Math.max(20, session.durationMin * 0.7) } });
    const d = freeDay(ctx, uid, session, date);
    if (d) opts.push({ action: 'move', label: `Sposta al ${d.slice(8)}/${d.slice(5, 7)}`, params: { sessionId: session.id, date: d } });
    opts.push(skip(session));
    return { ...base, session, message: isHigh(session) ? 'Hai indicato una fatica elevata. Possiamo rivedere l’allenamento intenso in programma.' : 'Hai indicato una fatica elevata. Se vuoi, alleggeriamo l’allenamento.', basis, options: opts, canTalk: true };
  }
  return { ...base, session };
}

/* ---------- anteprima e conferma ---------- */

interface Draft {
  sessions: Array<{ before: PlannedSession; after: PlannedSession; label: string }>;
  stateAfter: PlanState | null;
}

function draftFor(ctx: Ctx, uid: Id, action: AdjustAction, p: ChangeParams, today: string): Draft {
  const out: Draft = { sessions: [], stateAfter: null };
  const one = () => {
    const s = p.sessionId ? ctx.db.sessions[p.sessionId] : undefined;
    if (!s || s.userId !== uid) throw new AppError('not_found', 'Allenamento non trovato.');
    if (!pending(s)) throw new AppError('conflict', 'Questo allenamento è già stato completato, saltato o messo in pausa.');
    return s;
  };
  const stamp = (s: PlannedSession, over: Partial<PlannedSession>, label: string, adj: AdjustAction) =>
    out.sessions.push({ before: structuredClone(s), after: { ...structuredClone(s), ...over, adjustment: { action: adj, at: iso(ctx.now), from: { kind: s.kind, title: s.title, durationMin: s.durationMin, date: s.date } }, updatedAt: iso(ctx.now) }, label });

  switch (action) {
    case 'swap_easy': {
      const s = one();
      if (!isRunKind(s.kind)) throw new AppError('validation', 'Solo gli allenamenti di corsa hanno un’alternativa facile.');
      const mins = round5(Math.min(s.durationMin, p.minutes ?? Math.max(20, s.durationMin * 0.7)));
      stamp(s, { kind: 'run_easy', title: 'Corsa facile', intensity: 'low', durationMin: mins, distanceKm: null, paceSecPerKm: null, segments: [], description: `Al posto di “${s.title}”: corsa facile e rilassata, a un ritmo in cui riesci a parlare.` }, `“${s.title}” diventa corsa facile di ${mins}'`, action);
      break;
    }
    case 'shorten': {
      const s = one();
      const mins = round5(p.minutes ?? 0);
      if (!p.minutes || mins < 10 || mins >= s.durationMin) throw new AppError('validation', 'La nuova durata deve essere più breve e di almeno 10 minuti.');
      stamp(s, { durationMin: mins, distanceKm: s.distanceKm ? Math.round(s.distanceKm * (mins / s.durationMin) * 10) / 10 : null, segments: s.segments.length && isHigh(s) ? [] : s.segments }, `“${s.title}” passa da ${s.durationMin}' a ${mins}'`, action);
      break;
    }
    case 'move': {
      const s = one();
      if (!p.date || !DAY_RE.test(p.date) || p.date < today || p.date > addDays(today, 7)) throw new AppError('validation', 'Puoi spostare l’allenamento nei prossimi 7 giorni.');
      const busy = mySessions(ctx, uid).some((x) => x.id !== s.id && x.date === p.date && (pending(x) || x.status === 'completed'));
      if (busy) throw new AppError('conflict', 'In quel giorno c’è già un altro allenamento.');
      if (isHigh(s) && mySessions(ctx, uid).some((x) => x.id !== s.id && isHigh(x) && pending(x) && (x.date === addDays(p.date!, -1) || x.date === addDays(p.date!, 1)))) throw new AppError('conflict', 'Due allenamenti intensi vicini non lasciano recupero: scegli un altro giorno.');
      stamp(s, { date: p.date, status: 'rescheduled', rescheduledFrom: s.date }, `“${s.title}” spostata dal ${s.date.slice(8)}/${s.date.slice(5, 7)} al ${p.date.slice(8)}/${p.date.slice(5, 7)}`, action);
      break;
    }
    case 'skip': {
      const s = one();
      stamp(s, { status: 'skipped' }, `“${s.title}” saltata (per scelta)`, action);
      break;
    }
    case 'pause':
    case 'vacation': {
      const from = p.from && DAY_RE.test(p.from) ? p.from : today;
      const until = p.until && DAY_RE.test(p.until) ? p.until : null;
      if (until && until < from) throw new AppError('validation', 'La data di rientro è prima dell’inizio.');
      if (action === 'vacation' && !until) throw new AppError('validation', 'Indica fino a quando sei in vacanza (puoi cambiarlo dopo).');
      const style = action === 'vacation' ? (p.style === 'reduced' ? 'reduced' : 'pause') : 'pause';
      const max = style === 'reduced' ? Math.min(180, Math.max(10, p.maxMinutes ?? 30)) : null;
      const inRange = mySessions(ctx, uid).filter((s) => pending(s) && s.date >= from && (!until || s.date <= until));
      for (const s of inRange) {
        if (style === 'reduced' && isRunKind(s.kind)) {
          const mins = round5(Math.min(s.durationMin, max!));
          stamp(s, { kind: isHigh(s) ? 'run_easy' : s.kind, title: isHigh(s) ? 'Corsa facile' : s.title, intensity: 'low', durationMin: mins, segments: [], distanceKm: null }, `“${s.title}” ridotta a ${mins}' facili`, action);
        } else stamp(s, { status: 'paused' }, `“${s.title}” in pausa`, action);
      }
      out.stateAfter = { userId: uid, mode: action === 'vacation' ? 'vacation' : 'paused', from, until, vacation: action === 'vacation' ? { style, maxMinutes: max } : null, updatedAt: iso(ctx.now) };
      break;
    }
    case 'resume': {
      const from = p.date && DAY_RE.test(p.date) ? p.date : today;
      // R5: tornano in programma solo gli allenamenti dalla ripresa in poi. Quelle perse restano "in pausa": nessun recupero forzato.
      for (const s of mySessions(ctx, uid).filter((x) => x.status === 'paused' && x.date >= from)) stamp(s, { status: 'planned' }, `“${s.title}” del ${s.date.slice(8)}/${s.date.slice(5, 7)} torna in programma`, action);
      out.stateAfter = { userId: uid, mode: 'active', from: null, until: null, vacation: null, updatedAt: iso(ctx.now) };
      break;
    }
    default:
      throw new AppError('validation', 'Azione non supportata.');
  }
  return out;
}

export interface ChangePreview {
  action: AdjustAction;
  changes: SessionChangePreview[];
  stateAfter: PlanState | null;
  /** Impatto sull'obiettivo, in parole semplici. */
  impact: string;
  /** Firma delle versioni coinvolte: se cambia prima della conferma, la proposta è obsoleta. */
  token: string;
}

const tokenOf = (ctx: Ctx, uid: Id, d: Draft) => [planStateOf(ctx, uid).updatedAt, ...d.sessions.map((x) => `${x.before.id}@${x.before.updatedAt}`)].join('|');

function impactOf(action: AdjustAction, d: Draft): string {
  if (action === 'resume') return d.sessions.length ? 'Gli allenamenti dalla ripresa in poi tornano in programma. Quelli passati non vengono recuperati.' : 'Il piano riprende; non ci sono allenamenti da riattivare.';
  if (action === 'pause' || action === 'vacation') return `${d.sessions.length} ${d.sessions.length === 1 ? 'allenamento' : 'allenamenti'} nel periodo. Se prepari una gara con data fissa, una pausa lunga può rendere l’obiettivo meno realistico.`;
  if (action === 'skip') return 'Un allenamento in meno questa settimana: non verrà recuperato in automatico.';
  if (action === 'move') return 'Il volume della settimana non cambia.';
  return 'Il volume della settimana si riduce leggermente.';
}

export function previewPlanChange(ctx: Ctx, action: AdjustAction, params: ChangeParams, today: string): ChangePreview {
  const uid = actor(ctx);
  if (!DAY_RE.test(today)) throw new AppError('validation', 'Data non valida.');
  const d = draftFor(ctx, uid, action, params ?? {}, today);
  const pv = (s: PlannedSession) => ({ date: s.date, title: s.title, kind: s.kind, durationMin: s.durationMin, status: s.status });
  return { action, changes: d.sessions.map((x) => ({ sessionId: x.before.id, label: x.label, before: pv(x.before), after: pv(x.after) })), stateAfter: d.stateAfter, impact: impactOf(action, d), token: tokenOf(ctx, uid, d) };
}

/** Scrive la modifica SOLO se nulla è cambiato dall'anteprima. Tutto o niente; idempotente per requestId. */
export function applyPlanChange(ctx: Ctx, action: AdjustAction, params: ChangeParams, today: string, token: string, requestId: string): PlanChange {
  const uid = actor(ctx);
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 80) throw new AppError('validation', 'Richiesta non valida.');
  const done = Object.values(ctx.db.planChanges).find((c) => c.userId === uid && c.requestId === requestId);
  if (done) return done; // doppio tap o retry: stesso risultato, nessuna doppia scrittura
  const d = draftFor(ctx, uid, action, params ?? {}, today);
  if (tokenOf(ctx, uid, d) !== token) throw new AppError('conflict', 'Il piano è cambiato nel frattempo: rivedi la proposta aggiornata.');
  const stateBefore = ctx.db.planStates[uid] ? structuredClone(ctx.db.planStates[uid]) : null;
  // Calcolo completato senza errori: ora si scrive tutto insieme.
  for (const x of d.sessions) ctx.db.sessions[x.after.id] = x.after;
  if (d.stateAfter) ctx.db.planStates[uid] = d.stateAfter;
  const change: PlanChange = { id: newId('pch'), userId: uid, action, requestId, createdAt: iso(ctx.now), undone: false, sessions: d.sessions.map((x) => ({ before: x.before, afterUpdatedAt: x.after.updatedAt })), stateBefore, stateAfter: d.stateAfter };
  ctx.db.planChanges[change.id] = change;
  return change;
}

/** Annulla una modifica se gli allenamenti non sono state toccate dopo; altrimenti non tocca nulla. */
export function undoPlanChange(ctx: Ctx, id: Id): PlanChange {
  const uid = actor(ctx);
  const c = ctx.db.planChanges[id];
  if (!c || c.userId !== uid) throw new AppError('not_found', 'Modifica non trovata.');
  if (c.undone) return c;
  for (const x of c.sessions) {
    const cur = ctx.db.sessions[x.before.id];
    if (cur && cur.updatedAt !== x.afterUpdatedAt) throw new AppError('conflict', 'Un allenamento è stato modificato dopo: non posso annullare in automatico.');
  }
  for (const x of c.sessions) if (ctx.db.sessions[x.before.id]) ctx.db.sessions[x.before.id] = { ...x.before, updatedAt: iso(ctx.now) };
  if (c.stateAfter) {
    if (c.stateBefore) ctx.db.planStates[uid] = { ...c.stateBefore, updatedAt: iso(ctx.now) };
    else delete ctx.db.planStates[uid];
  }
  c.undone = true;
  return c;
}

export function getPlanState(ctx: Ctx): PlanState {
  return planStateOf(ctx, actor(ctx));
}

/* ---------- corse reali e piano ---------- */

export interface SessionMatch {
  session: PlannedSession;
  reasons: string[];
}

/**
 * Sedute compatibili con un'attività reale. Criteri dichiarati: corsa (anche trail o corsa + camminata); stesso giorno o ±1;
 * allenamento ancora da fare; durata tra 50% e 160% del previsto (se nota); distanza tra 60% e 150% (se nota).
 */
export function sessionMatches(ctx: Ctx, activityId: Id): SessionMatch[] {
  const uid = actor(ctx);
  const a = ctx.db.activities[activityId];
  if (!a || a.userId !== uid) throw new AppError('not_found', 'Attività non trovata.');
  // Corsa, trail e corsa + camminata possono completare un allenamento di corsa del piano (come le corse Strava di prima).
  if (!isRunFamily(a.sport) || a.planSessionId) return [];
  if (Object.values(ctx.db.sessions).some((s) => s.linkedActivityId === a.id)) return [];
  const day = a.date.slice(0, 10);
  const out: SessionMatch[] = [];
  for (const s of mySessions(ctx, uid)) {
    if (!pending(s) || !isRunKind(s.kind)) continue;
    if (![addDays(day, -1), day, addDays(day, 1)].includes(s.date)) continue;
    const reasons = [s.date === day ? 'Stesso giorno dell’allenamento' : 'Giorno vicino all’allenamento'];
    if (a.durationMin !== null && s.durationMin > 0) {
      const r = a.durationMin / s.durationMin;
      if (r < 0.5 || r > 1.6) continue;
      reasons.push(`Durata ${a.durationMin}' su ${s.durationMin}' previsti`);
    }
    if (a.distanceKm !== null && s.distanceKm) {
      const r = a.distanceKm / s.distanceKm;
      if (r < 0.6 || r > 1.5) continue;
      reasons.push(`Distanza ${a.distanceKm} km su ${s.distanceKm} km previsti`);
    }
    out.push({ session: s, reasons });
  }
  return out.sort((x, y) => (x.session.date === day ? -1 : 0) - (y.session.date === day ? -1 : 0));
}

/** Associa un'attività a un allenamento: una corsa completa un solo allenamento e viceversa. */
export function linkActivityToSession(ctx: Ctx, activityId: Id, sessionId: Id): PlannedSession {
  const uid = actor(ctx);
  const ok = sessionMatches(ctx, activityId).find((m) => m.session.id === sessionId);
  if (!ok) throw new AppError('conflict', 'Questa attività non è compatibile con l’allenamento, oppure è già associata.');
  const a = ctx.db.activities[activityId];
  const s = ctx.db.sessions[sessionId];
  if (s.userId !== uid) throw new AppError('not_found', 'Allenamento non trovato.');
  a.planSessionId = s.id;
  a.updatedAt = iso(ctx.now);
  s.status = 'completed';
  s.linkedActivityId = a.id;
  s.updatedAt = iso(ctx.now);
  return s;
}

export function dismissActivityLink(ctx: Ctx, activityId: Id): { ok: true } {
  const uid = actor(ctx);
  const a = ctx.db.activities[activityId];
  if (!a || a.userId !== uid) throw new AppError('not_found', 'Attività non trovata.');
  a.planLinkDismissed = true;
  return { ok: true };
}

/** Attività recenti (48 h) non ancora associate per cui esiste un allenamento compatibile. */
export function pendingActivityLinks(ctx: Ctx): Array<{ activityId: Id; title: string; source: string; date: string; matches: SessionMatch[] }> {
  const uid = actor(ctx);
  const since = ctx.now.getTime() - 48 * 3_600_000;
  return Object.values(ctx.db.activities)
    .filter((a) => a.userId === uid && !a.planSessionId && !a.planLinkDismissed && Date.parse(a.date) >= since)
    .map((a) => ({ activityId: a.id, title: a.title, source: a.source, date: a.date, matches: sessionMatches(ctx, a.id) }))
    .filter((x) => x.matches.length > 0);
}

export const adaptiveMethods = { saveCheckIn, deleteCheckIn, planAdvice, previewPlanChange, applyPlanChange, undoPlanChange, getPlanState, sessionMatches, linkActivityToSession, dismissActivityLink, pendingActivityLinks } as const;
export const ADAPTIVE_READ_ONLY = ['planAdvice', 'previewPlanChange', 'getPlanState', 'sessionMatches', 'pendingActivityLinks'];
