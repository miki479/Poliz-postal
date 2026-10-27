/**
 * Fama Runngo: reputazione sociale su tre binari separati (popolarità, contributo, sport).
 * Nessun binario promuove gli altri, nessun punteggio aggregato, nessun dato sanitario o motivo di pausa.
 * I valori non diminuiscono con l'inattività.
 *
 * Riconoscimenti post-corsa:
 *  - solo tra persone con PRESENZA CONFERMATA alla stessa uscita svolta (attività collegata all'uscita: conferma
 *    dopo la corsa o registrazione nell'app con l'uscita come contesto). La sola iscrizione non basta;
 *  - "Ottima organizzazione" solo verso chi ha organizzato (che può riceverla anche senza aver confermato la corsa);
 *  - finestra di 72 ore dall'inizio dell'uscita, una sola volta per uscita (anche "Non ho abbastanza elementi");
 *  - un riconoscimento per categoria, destinatario e uscita; massimo 5 per uscita; massimo 6 dalla stessa persona
 *    verso la stessa persona in 30 giorni (oltre, l'invio viene ignorato senza penalità per nessuno);
 *  - mai verso sé stessi, mai su uscite annullate o non ancora svolte.
 * Pubblico: solo le qualità "consolidate" (stessa categoria da almeno 3 persone diverse in almeno 2 uscite),
 * nascondibili dal profilo. I conteggi restano privati. Chi ha riconosciuto chi non viene mostrato.
 */
import { computeBadges } from './badges.ts';
import { AppError, registerPurger, toPublic, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { Id, Recognition, RecognitionCategory, RunEvent, UserPublic } from './types.ts';
import { clean } from './validation.ts';

export const RECOGNITIONS: Record<RecognitionCategory, { label: string; description: string; organizerOnly?: boolean }> = {
  teamwork: { label: 'Fa squadra', description: 'Ha incoraggiato le altre persone e reso la corsa un momento di gruppo.' },
  keeps_group: { label: 'Tiene unito il gruppo', description: 'Ha aspettato, ricompattato e fatto in modo che nessuno restasse indietro.' },
  organization: { label: 'Ottima organizzazione', description: 'Ritrovo, percorso e orari chiari: tutto è filato liscio.', organizerOnly: true },
  shares_experience: { label: 'Condivide esperienza', description: 'Ha dato consigli utili su percorso, ritmo o attrezzatura.' },
  pace_setter: { label: 'Motore della corsa', description: 'Ha tenuto il ritmo concordato aiutando il gruppo a rispettarlo.' },
};
export const CATEGORIES = Object.keys(RECOGNITIONS) as RecognitionCategory[];

const WINDOW_MS = 72 * 3_600_000;
const MAX_PER_ROUND = 5;
const PAIR_LIMIT = 6;
const PAIR_DAYS = 30;
const CONSOLIDATE_PEOPLE = 3;
const CONSOLIDATE_EVENTS = 2;

const rKey = (eventId: Id, from: Id, to: Id, c: RecognitionCategory) => `${eventId}__${from}__${to}__${c}`;
const roundKey = (eventId: Id, userId: Id) => `${eventId}__${userId}`;

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

/** Persone con presenza confermata all'uscita. */
function presentIds(ctx: Ctx, e: RunEvent): Set<Id> {
  const out = new Set<Id>();
  for (const a of Object.values(ctx.db.activities)) if (a.eventId === e.id && a.source === 'event' && ctx.db.users[a.userId]) out.add(a.userId);
  return out;
}

export interface RecognitionPrompt {
  eventId: Id;
  eventTitle: string;
  eligible: boolean;
  /** Perché non si può (mostrato in modo neutro). */
  reason: string | null;
  done: boolean;
  deadline: string;
  peers: Array<{ user: UserPublic; categories: RecognitionCategory[]; organizer: boolean }>;
}

export function recognitionPrompt(ctx: Ctx, eventId: Id): RecognitionPrompt {
  const uid = actor(ctx);
  const e = ctx.db.events[eventId];
  if (!e) throw new AppError('not_found', 'Uscita non trovata.');
  const start = Date.parse(e.startsAt);
  const deadline = new Date(start + WINDOW_MS).toISOString();
  const base = { eventId, eventTitle: e.title, deadline, done: !!ctx.db.recognitionRounds[roundKey(e.id, uid)], peers: [] as RecognitionPrompt['peers'] };
  const no = (reason: string): RecognitionPrompt => ({ ...base, eligible: false, reason });
  if (e.status !== 'active') return no('L’uscita è stata annullata.');
  if (start > ctx.now.getTime()) return no('L’uscita non si è ancora svolta.');
  if (ctx.now.getTime() > start + WINDOW_MS) return no('Il tempo per i riconoscimenti di questa uscita è terminato.');
  const present = presentIds(ctx, e);
  if (!present.has(uid)) return no('Puoi lasciare riconoscimenti dopo aver confermato di aver corso questa uscita.');
  const peers: RecognitionPrompt['peers'] = [];
  for (const id of present) {
    if (id === uid) continue;
    peers.push({ user: toPublic(ctx.db, id), organizer: id === e.organizerId, categories: CATEGORIES.filter((c) => !RECOGNITIONS[c].organizerOnly || id === e.organizerId) });
  }
  if (e.organizerId !== uid && !present.has(e.organizerId) && ctx.db.users[e.organizerId]) peers.push({ user: toPublic(ctx.db, e.organizerId), organizer: true, categories: ['organization'] });
  if (!peers.length) return no('Nessun’altra persona ha confermato la presenza a questa uscita.');
  return { ...base, eligible: true, reason: null, peers };
}

/** Uscite recenti per cui puoi ancora lasciare riconoscimenti (per un invito discreto, uno alla volta). */
export function pendingRecognitionPrompts(ctx: Ctx): Array<{ eventId: Id; eventTitle: string; deadline: string; peers: number }> {
  const uid = actor(ctx);
  const out: Array<{ eventId: Id; eventTitle: string; deadline: string; peers: number }> = [];
  for (const a of Object.values(ctx.db.activities)) {
    if (a.userId !== uid || a.source !== 'event' || !a.eventId) continue;
    const p = recognitionPrompt(ctx, a.eventId);
    if (p.eligible && !p.done) out.push({ eventId: p.eventId, eventTitle: p.eventTitle, deadline: p.deadline, peers: p.peers.length });
  }
  return out.sort((x, y) => x.deadline.localeCompare(y.deadline));
}

export interface GiveResult {
  saved: number;
  ignored: Array<{ toId: Id; category: RecognitionCategory; reason: string }>;
  skipped: boolean;
}

/** Invio dei riconoscimenti di un'uscita: idempotente (un secondo invio non aggiunge nulla). */
export function giveRecognitions(ctx: Ctx, eventId: Id, entries: Array<{ toId: Id; category: RecognitionCategory }> | null): GiveResult {
  const uid = actor(ctx);
  const rk = roundKey(eventId, uid);
  const prev = ctx.db.recognitionRounds[rk];
  if (prev) return { saved: Object.values(ctx.db.recognitions).filter((r) => r.eventId === eventId && r.fromId === uid).length, ignored: [], skipped: prev.skipped };
  const p = recognitionPrompt(ctx, eventId);
  if (!p.eligible) throw new AppError('forbidden', p.reason ?? 'Non puoi lasciare riconoscimenti per questa uscita.');
  const list = Array.isArray(entries) ? entries : [];
  if (list.length > MAX_PER_ROUND) throw new AppError('validation', `Puoi lasciare al massimo ${MAX_PER_ROUND} riconoscimenti per uscita.`);
  const since = ctx.now.getTime() - PAIR_DAYS * 86_400_000;
  const ignored: GiveResult['ignored'] = [];
  const toSave: Recognition[] = [];
  const seen = new Set<string>();
  for (const en of list) {
    const peer = p.peers.find((x) => x.user.id === en?.toId);
    if (!peer || en.toId === uid || !CATEGORIES.includes(en.category) || !peer.categories.includes(en.category)) throw new AppError('validation', 'Riconoscimento non valido per questa uscita.');
    const k = rKey(eventId, uid, en.toId, en.category);
    if (seen.has(k)) continue;
    seen.add(k);
    const pair = Object.values(ctx.db.recognitions).filter((r) => r.fromId === uid && r.toId === en.toId && Date.parse(r.createdAt) >= since).length + toSave.filter((r) => r.toId === en.toId).length;
    if (pair >= PAIR_LIMIT) {
      ignored.push({ toId: en.toId, category: en.category, reason: 'Hai già riconosciuto spesso questa persona nell’ultimo mese.' });
      continue;
    }
    toSave.push({ id: k, eventId, fromId: uid, toId: en.toId, category: en.category, createdAt: ctx.now.toISOString() });
  }
  for (const r of toSave) ctx.db.recognitions[r.id] = r;
  ctx.db.recognitionRounds[rk] = { id: rk, eventId, userId: uid, skipped: toSave.length === 0, createdAt: ctx.now.toISOString() };
  return { saved: toSave.length, ignored, skipped: toSave.length === 0 };
}

export interface FameView {
  isSelf: boolean;
  /** Qualità riconosciute in modo consolidato (pubbliche se la persona non le nasconde). */
  qualities: Array<{ category: RecognitionCategory; label: string; description: string }>;
  hidden: boolean;
  /** Solo per sé: i tre binari separati, con numeri privati. */
  tracks: null | {
    popularity: { received: number; people: number; byCategory: Array<{ category: RecognitionCategory; label: string; count: number; people: number }> };
    contribution: { organizedHeld: number; groupRuns: number; clubs: number };
    sport: { activities: number; km: number; bestStreakWeeks: number };
  };
}

export function getFame(ctx: Ctx, userId?: Id | null): FameView {
  const uid = actor(ctx);
  const target = ctx.db.users[userId ?? uid];
  if (!target) throw new AppError('not_found', 'Profilo non trovato.');
  const self = target.id === uid;
  const mine = Object.values(ctx.db.recognitions).filter((r) => r.toId === target.id && ctx.db.users[r.fromId]);
  const byCat = CATEGORIES.map((c) => {
    const rs = mine.filter((r) => r.category === c);
    return { category: c, label: RECOGNITIONS[c].label, count: rs.length, people: new Set(rs.map((r) => r.fromId)).size, events: new Set(rs.map((r) => r.eventId)).size };
  });
  const qualities = byCat.filter((b) => b.people >= CONSOLIDATE_PEOPLE && b.events >= CONSOLIDATE_EVENTS).map((b) => ({ category: b.category, label: b.label, description: RECOGNITIONS[b.category].description }));
  const hidden = target.privacy.showRecognitions === false;
  if (!self) return { isSelf: false, qualities: hidden ? [] : qualities, hidden, tracks: null };
  const nowIso = ctx.now.toISOString();
  const acts = Object.values(ctx.db.activities).filter((a) => a.userId === target.id && a.date <= nowIso);
  const badges = computeBadges(ctx.db, target.id, ctx.now);
  return {
    isSelf: true,
    qualities,
    hidden,
    tracks: {
      popularity: { received: mine.length, people: new Set(mine.map((r) => r.fromId)).size, byCategory: byCat.filter((b) => b.count > 0).map(({ category, label, count, people }) => ({ category, label, count, people })) },
      contribution: {
        organizedHeld: Object.values(ctx.db.events).filter((e) => e.organizerId === target.id && e.status === 'active' && e.startsAt <= nowIso).length,
        groupRuns: acts.filter((a) => a.source === 'event').length,
        clubs: Object.values(ctx.db.memberships).filter((m) => m.userId === target.id).length,
      },
      sport: { activities: acts.length, km: Math.round(acts.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10, bestStreakWeeks: badges.find((b) => b.id === 'streak_12')?.current ?? 0 },
    },
  };
}

/** Segnalazione privata: va a chi gestisce il servizio, non tocca la Fama di nessuno. */
export function reportUser(ctx: Ctx, input: { aboutId?: Id | null; eventId?: Id | null; reason: string; text: string }): { id: Id } {
  const uid = actor(ctx);
  const reasons = ['conduct', 'harassment', 'organization', 'dispute', 'other'] as const;
  if (!input || !reasons.includes(input.reason as (typeof reasons)[number])) throw new AppError('validation', 'Scegli un motivo.');
  const text = clean(input.text, 1000);
  if (text.length < 5) throw new AppError('validation', 'Descrivi brevemente cosa è successo.', { text: 'Almeno qualche parola.' });
  const today = Object.values(ctx.db.reports).filter((r) => r.fromId === uid && Date.parse(r.createdAt) > ctx.now.getTime() - 86_400_000).length;
  if (today >= 10) throw new AppError('rate_limited', 'Hai inviato molte segnalazioni oggi: riprova domani.');
  const id = newId('rep');
  ctx.db.reports[id] = { id, fromId: uid, aboutId: input.aboutId && ctx.db.users[input.aboutId] ? input.aboutId : null, eventId: input.eventId && ctx.db.events[input.eventId] ? input.eventId : null, reason: input.reason as (typeof reasons)[number], text, status: 'open', createdAt: ctx.now.toISOString() };
  return { id };
}

// Account eliminato: spariscono i riconoscimenti dati e ricevuti e i turni.
registerPurger((ctx, userId) => {
  for (const [k, r] of Object.entries(ctx.db.recognitions)) if (r.fromId === userId || r.toId === userId) delete ctx.db.recognitions[k];
  for (const [k, r] of Object.entries(ctx.db.recognitionRounds)) if (r.userId === userId) delete ctx.db.recognitionRounds[k];
  for (const [k, c] of Object.entries(ctx.db.checkins)) if (c.userId === userId) delete ctx.db.checkins[k];
  delete ctx.db.planStates[userId];
  for (const [k, c] of Object.entries(ctx.db.planChanges)) if (c.userId === userId) delete ctx.db.planChanges[k];
  for (const [k, g] of Object.entries(ctx.db.goals)) if (g.userId === userId) delete ctx.db.goals[k];
});

export const fameMethods = { recognitionPrompt, pendingRecognitionPrompts, giveRecognitions, getFame, reportUser } as const;
export const FAME_READ_ONLY = ['recognitionPrompt', 'pendingRecognitionPrompts', 'getFame'];
