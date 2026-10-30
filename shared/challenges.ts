import { newId, newInviteCode, normalizeInviteCode } from './ids.ts';
import { AppError, notify, registerPurger, toPublic, type Ctx } from './engine.ts';
import { SPORTS } from './sports.ts';
import { isValidTimezone, utcToZoned } from './time.ts';
import type {
  Challenge,
  ChallengeInput,
  ChallengePhase,
  ChallengeResultRow,
  ChallengeType,
  ChallengeView,
  Id,
} from './types.ts';
import { clean, type FieldErrors } from './validation.ts';

const TYPES: ChallengeType[] = ['most_runs', 'most_distance', 'most_active_days', 'collective_distance', 'personal_goal'];
/** Dopo la fine, per 24 h si possono ancora registrare attività svolte nella finestra; poi i risultati si congelano. */
export const GRACE_MS = 24 * 3_600_000;
const MAX_ACTIVE_CREATED = 25;
const MAX_PARTICIPANTS = 200;
const DAY = 86_400_000;

export const TYPE_LABEL: Record<ChallengeType, string> = {
  most_runs: 'Più uscite completate',
  most_distance: 'Più distanza totale',
  most_active_days: 'Più giorni attivi',
  collective_distance: 'Obiettivo collettivo',
  personal_goal: 'Obiettivo personale',
};

const DATA_NOTE = 'Contano solo attività registrate a mano o dopo un\'uscita (dati autodichiarati). Le attività importate da servizi esterni restano private e non entrano nelle sfide.';

const pKey = (cid: Id, uid: Id) => `${cid}__${uid}`;
const iso = (d: Date) => d.toISOString();

export function validateChallengeInput(raw: Partial<ChallengeInput> | null | undefined, now: Date): { ok: true; value: ChallengeInput } | { ok: false; errors: FieldErrors } {
  const r = raw ?? {};
  const errors: FieldErrors = {};
  const name = clean(r.name, 60);
  if (name.length < 3) errors.name = 'Il nome deve avere almeno 3 caratteri.';
  else if (name.length > 60) errors.name = 'Massimo 60 caratteri.';
  const description = clean(r.description, 300);
  if (description.length > 300) errors.description = 'Massimo 300 caratteri.';
  if (!TYPES.includes(r.type as ChallengeType)) errors.type = 'Scegli un tipo di sfida.';
  if (!SPORTS.some((s) => s.id === r.sport && s.enabled)) errors.sport = 'Scegli uno sport disponibile.';
  const tz = typeof r.timezone === 'string' ? r.timezone : '';
  if (!isValidTimezone(tz)) errors.timezone = 'Fuso orario non valido.';
  const s = typeof r.startsAt === 'string' ? Date.parse(r.startsAt) : NaN;
  const e = typeof r.endsAt === 'string' ? Date.parse(r.endsAt) : NaN;
  if (Number.isNaN(s)) errors.startsAt = 'Data di inizio non valida.';
  else if (s < now.getTime() - 7 * DAY) errors.startsAt = 'L\'inizio non può essere più di 7 giorni fa.';
  else if (s > now.getTime() + 365 * DAY) errors.startsAt = 'L\'inizio deve essere entro un anno.';
  if (Number.isNaN(e)) errors.endsAt = 'Data di fine non valida.';
  else if (!Number.isNaN(s) && e <= s) errors.endsAt = 'La fine deve essere dopo l\'inizio.';
  else if (!Number.isNaN(s) && e - s > 366 * DAY) errors.endsAt = 'Durata massima: un anno.';
  else if (!Number.isNaN(s) && e - s < 24 * 3_600_000 - 1) errors.endsAt = 'Durata minima: un giorno.';
  let goalKm: number | null = null;
  if (r.type === 'collective_distance') {
    if (typeof r.goalKm !== 'number' || !Number.isFinite(r.goalKm) || r.goalKm < 1 || r.goalKm > 100_000) errors.goalKm = 'Indica l\'obiettivo del gruppo in km (da 1 a 100000).';
    else goalKm = Math.round(r.goalKm * 10) / 10;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, description, type: r.type as ChallengeType, sport: r.sport!, startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString(), timezone: tz, goalKm, clubId: typeof r.clubId === 'string' && r.clubId ? r.clubId : null },
  };
}

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

function phaseOf(ctx: Ctx, c: Challenge): ChallengePhase {
  if (c.status === 'cancelled') return 'cancelled';
  const t = ctx.now.getTime();
  if (t < Date.parse(c.startsAt)) return 'upcoming';
  if (t < Date.parse(c.endsAt)) return 'running';
  if (t < Date.parse(c.endsAt) + GRACE_MS && !c.final) return 'closing';
  return 'ended';
}

const participantsOf = (ctx: Ctx, cid: Id) => Object.values(ctx.db.challengeParticipants).filter((p) => p.challengeId === cid);

/** Calcola la classifica dai dati persistenti. Conta solo attività condivisibili, nello sport e nella finestra, registrate entro il termine. */
function compute(ctx: Ctx, c: Challenge): { rows: ChallengeResultRow[]; totalKm: number } {
  const start = Date.parse(c.startsAt);
  const end = Date.parse(c.endsAt);
  const deadline = end + GRACE_MS;
  const now = ctx.now.getTime();
  const raw = participantsOf(ctx, c.id).map((p) => {
    const acts = Object.values(ctx.db.activities).filter(
      (a) => a.userId === p.userId && a.visibility === 'shared' && a.sport === c.sport && Date.parse(a.date) >= start && Date.parse(a.date) < end && Date.parse(a.date) <= now && Date.parse(a.createdAt) <= deadline,
    );
    const km = Math.round(acts.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10;
    const days = new Set(acts.map((a) => utcToZoned(a.date, c.timezone).date)).size;
    let value = km;
    if (c.type === 'most_runs') value = acts.length;
    else if (c.type === 'most_active_days') value = days;
    const pct = c.type === 'personal_goal' && p.goalKm ? Math.round((km / p.goalKm) * 1000) / 10 : null;
    return { userId: p.userId, value, pct, activities: acts.length, km };
  });
  const key = (r: (typeof raw)[number]) => (c.type === 'personal_goal' ? (r.pct ?? 0) : r.value);
  raw.sort((a, b) => key(b) - key(a) || a.userId.localeCompare(b.userId));
  let rank = 0;
  let prev: number | null = null;
  const rows = raw.map((r, i) => {
    if (key(r) !== prev) rank = i + 1;
    prev = key(r);
    return { userId: r.userId, value: r.value, pct: r.pct, rank, activities: r.activities };
  });
  return { rows, totalKm: Math.round(raw.reduce((s, r) => s + r.km, 0) * 10) / 10 };
}

/** Congela i risultati delle sfide scadute (dopo il periodo di tolleranza). Chiamata prima di ogni operazione. */
export function finalizeDueChallenges(ctx: Ctx) {
  for (const c of Object.values(ctx.db.challenges)) {
    if (c.final || c.status !== 'active') continue;
    if (ctx.now.getTime() < Date.parse(c.endsAt) + GRACE_MS) continue;
    const { rows, totalKm } = compute(ctx, c);
    c.final = { rows, totalKm, finalizedAt: iso(ctx.now) };
    c.updatedAt = iso(ctx.now);
    ctx.dirty = true;
    for (const r of rows) {
      const text =
        c.type === 'collective_distance'
          ? `"${c.name}" è conclusa: il gruppo ha raggiunto ${totalKm} km su ${c.goalKm}.`
          : c.type === 'personal_goal'
            ? `"${c.name}" è conclusa: obiettivo raggiunto al ${r.pct ?? 0}%.`
            : `"${c.name}" è conclusa: sei ${r.rank}º su ${rows.length}.`;
      notify(ctx, r.userId, 'challenge_ended', text, { challengeId: c.id });
    }
  }
}

function canAccess(ctx: Ctx, c: Challenge, code?: string | null): boolean {
  const uid = ctx.actorId;
  if (uid && (c.creatorId === uid || ctx.db.challengeParticipants[pKey(c.id, uid)])) return true;
  if (code && normalizeInviteCode(code) === c.inviteCode) return true;
  if (c.clubId && uid && ctx.db.memberships[`${c.clubId}__${uid}`]) return true;
  return false;
}

function view(ctx: Ctx, c: Challenge): ChallengeView {
  const uid = ctx.actorId;
  const parts = participantsOf(ctx, c.id);
  const isPart = !!uid && !!ctx.db.challengeParticipants[pKey(c.id, uid)];
  const isCreator = !!uid && c.creatorId === uid;
  const phase = phaseOf(ctx, c);
  const live = c.final ?? compute(ctx, c);
  const rows = uid
    ? live.rows.map((r) => ({ ...r, user: toPublic(ctx.db, r.userId), isMe: r.userId === uid }))
    : [];
  const mine = uid ? ctx.db.challengeParticipants[pKey(c.id, uid)] : undefined;
  const canJoin = !!uid && !isPart && (phase === 'upcoming' || phase === 'running') && parts.length < MAX_PARTICIPANTS;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    sport: c.sport,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    timezone: c.timezone,
    goalKm: c.goalKm,
    clubId: c.clubId,
    creator: toPublic(ctx.db, c.creatorId),
    phase,
    participantCount: parts.length,
    rows,
    totalKm: live.totalKm,
    inviteCode: isPart || isCreator ? c.inviteCode : '',
    viewer: { isCreator, isParticipant: isPart, canJoin, myGoalKm: mine?.goalKm ?? null, myRank: rows.find((r) => r.isMe)?.rank ?? null },
    dataNote: DATA_NOTE,
    finalized: !!c.final,
  };
}

function getOrThrow(ctx: Ctx, id: unknown): Challenge {
  const c = typeof id === 'string' ? ctx.db.challenges[id] : undefined;
  if (!c) throw new AppError('not_found', 'Sfida non trovata.');
  return c;
}

export function createChallenge(ctx: Ctx, input: ChallengeInput, myGoalKm?: number | null): ChallengeView {
  const uid = actor(ctx);
  const v = validateChallengeInput(input, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const d = v.value;
  if (d.clubId && !ctx.db.memberships[`${d.clubId}__${uid}`]) throw new AppError('forbidden', 'Puoi lanciare sfide solo ai club di cui fai parte.');
  const goal = validateMyGoal(d.type, myGoalKm);
  const active = Object.values(ctx.db.challenges).filter((c) => c.creatorId === uid && c.status === 'active' && !c.final).length;
  if (active >= MAX_ACTIVE_CREATED) throw new AppError('conflict', 'Hai già molte sfide attive: concludine o annullane qualcuna prima di crearne altre.');
  const c: Challenge = { id: newId('chl'), creatorId: uid, ...d, inviteCode: newInviteCode(), status: 'active', final: null, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  ctx.db.challenges[c.id] = c;
  ctx.db.challengeParticipants[pKey(c.id, uid)] = { id: newId('cpt'), challengeId: c.id, userId: uid, goalKm: goal, joinedAt: iso(ctx.now) };
  return view(ctx, c);
}

function validateMyGoal(type: ChallengeType, g: unknown): number | null {
  if (type !== 'personal_goal') return null;
  if (typeof g !== 'number' || !Number.isFinite(g) || g < 1 || g > 10_000) throw new AppError('validation', 'Indica il tuo obiettivo in km (da 1 a 10000).', { goalKm: 'Indica il tuo obiettivo in km (da 1 a 10000).' });
  return Math.round(g * 10) / 10;
}

export function getChallenge(ctx: Ctx, id: Id, code?: string | null): ChallengeView {
  const c = getOrThrow(ctx, id);
  if (!canAccess(ctx, c, code)) throw new AppError('not_found', 'Sfida non trovata o non accessibile.');
  return view(ctx, c);
}

export function listChallenges(ctx: Ctx): ChallengeView[] {
  const uid = actor(ctx);
  const out = Object.values(ctx.db.challenges)
    .filter((c) => c.creatorId === uid || ctx.db.challengeParticipants[pKey(c.id, uid)] || (c.clubId && ctx.db.memberships[`${c.clubId}__${uid}`]))
    .map((c) => view(ctx, c));
  const order = { running: 0, closing: 1, upcoming: 2, ended: 3, cancelled: 4 } as const;
  return out.sort((a, b) => order[a.phase] - order[b.phase] || a.endsAt.localeCompare(b.endsAt));
}

export function joinChallenge(ctx: Ctx, id: Id, code?: string | null, goalKm?: number | null): ChallengeView {
  const uid = actor(ctx);
  const c = getOrThrow(ctx, id);
  if (!canAccess(ctx, c, code)) throw new AppError('not_found', 'Sfida non trovata o non accessibile.');
  if (ctx.db.challengeParticipants[pKey(c.id, uid)]) return view(ctx, c); // idempotente
  const phase = phaseOf(ctx, c);
  if (phase === 'cancelled') throw new AppError('cancelled', 'Questa sfida è stata annullata.');
  if (phase === 'closing' || phase === 'ended') throw new AppError('past', 'Questa sfida è già conclusa.');
  if (participantsOf(ctx, c.id).length >= MAX_PARTICIPANTS) throw new AppError('full', 'La sfida ha raggiunto il numero massimo di partecipanti.');
  const goal = validateMyGoal(c.type, goalKm);
  ctx.db.challengeParticipants[pKey(c.id, uid)] = { id: newId('cpt'), challengeId: c.id, userId: uid, goalKm: goal, joinedAt: iso(ctx.now) };
  if (c.creatorId !== uid) notify(ctx, c.creatorId, 'challenge_joined', `${ctx.db.users[uid].displayName} partecipa a "${c.name}".`, { challengeId: c.id });
  return view(ctx, c);
}

export function leaveChallenge(ctx: Ctx, id: Id): { left: true } {
  const uid = actor(ctx);
  const c = getOrThrow(ctx, id);
  if (phaseOf(ctx, c) === 'cancelled') { delete ctx.db.challengeParticipants[pKey(c.id, uid)]; return { left: true }; }
  if (c.creatorId === uid) throw new AppError('forbidden', 'Sei il creatore: per uscire devi annullare la sfida.');
  if (!ctx.db.challengeParticipants[pKey(c.id, uid)]) return { left: true };
  if (phaseOf(ctx, c) === 'closing' || phaseOf(ctx, c) === 'ended') throw new AppError('past', 'La sfida è conclusa: il risultato resta nello storico.');
  delete ctx.db.challengeParticipants[pKey(c.id, uid)];
  return { left: true };
}

export function cancelChallenge(ctx: Ctx, id: Id): ChallengeView {
  const uid = actor(ctx);
  const c = getOrThrow(ctx, id);
  if (c.creatorId !== uid) throw new AppError('forbidden', 'Solo chi ha creato la sfida può annullarla.');
  if (c.status === 'cancelled') return view(ctx, c);
  if (c.final) throw new AppError('past', 'La sfida è già conclusa.');
  c.status = 'cancelled';
  c.updatedAt = iso(ctx.now);
  for (const p of participantsOf(ctx, c.id)) if (p.userId !== uid) notify(ctx, p.userId, 'event_cancelled', `La sfida "${c.name}" è stata annullata.`, { challengeId: c.id });
  return view(ctx, c);
}

export function updateChallenge(ctx: Ctx, id: Id, patch: { name?: string; description?: string }): ChallengeView {
  const uid = actor(ctx);
  const c = getOrThrow(ctx, id);
  if (c.creatorId !== uid) throw new AppError('forbidden', 'Solo chi ha creato la sfida può modificarla.');
  if (c.status === 'cancelled' || c.final) throw new AppError('past', 'La sfida non è più modificabile.');
  const name = clean(patch?.name ?? c.name, 60);
  const description = clean(patch?.description ?? c.description, 300);
  const errors: FieldErrors = {};
  if (name.length < 3) errors.name = 'Il nome deve avere almeno 3 caratteri.';
  if (Object.keys(errors).length) throw new AppError('validation', 'Controlla i campi evidenziati.', errors);
  // Le date, il tipo e gli obiettivi non cambiano dopo la creazione: evita di alterare i risultati.
  Object.assign(c, { name, description, updatedAt: iso(ctx.now) });
  return view(ctx, c);
}

registerPurger((ctx, userId) => {
  for (const p of Object.values(ctx.db.challengeParticipants)) if (p.userId === userId) delete ctx.db.challengeParticipants[pKey(p.challengeId, p.userId)];
  for (const c of Object.values(ctx.db.challenges)) {
    if (c.creatorId !== userId || c.status !== 'active' || c.final) continue;
    c.status = 'cancelled';
    for (const p of participantsOf(ctx, c.id)) notify(ctx, p.userId, 'event_cancelled', `La sfida "${c.name}" è stata annullata perché il creatore ha eliminato l'account.`, { challengeId: c.id });
  }
});

export const challengeMethods = { createChallenge, getChallenge, listChallenges, joinChallenge, leaveChallenge, cancelChallenge, updateChallenge } as const;
