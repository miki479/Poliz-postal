/**
 * Distintivi: calcolati SEMPRE dal server sui dati salvati, mai assegnati dal client.
 * Ogni criterio è verificabile sui dati disponibili; le attività sono già deduplicate tra fonti (vedi findDuplicate),
 * quindi una stessa corsa importata da Strava e registrata a mano conta una volta sola.
 * Si premiano anche partecipazione, organizzazione e appartenenza, non solo volume.
 */
import { sportDef } from './sports.ts';
import type { BadgeCategory, BadgeView, DbState, Id } from './types.ts';

interface Def {
  id: string;
  name: string;
  criterion: string;
  category: BadgeCategory;
  source: string;
  target?: number;
  unit?: string;
}

const SRC_ACTIVITIES = 'Attività registrate, confermate dopo un’uscita o importate (Strava, file), senza duplicati.';
const SRC_EVENTS = 'Uscite di gruppo su Runngo.';

const KM_STEPS: Array<[number, string]> = [
  [10, 'Primi 10 km'],
  [50, '50 km'],
  [100, '100 km'],
  [250, '250 km'],
  [500, '500 km'],
];

export const BADGE_DEFS: Def[] = [
  { id: 'first_group_run', name: 'Prima corsa in compagnia', criterion: 'Conferma di aver corso un’uscita di gruppo.', category: 'community', source: SRC_EVENTS },
  { id: 'group_runs_10', name: 'Sempre in gruppo', criterion: 'Conferma 10 uscite di gruppo.', category: 'community', source: SRC_EVENTS, target: 10, unit: 'uscite' },
  { id: 'first_organized', name: 'Prima uscita organizzata', criterion: 'Organizza un’uscita che si è svolta (non annullata).', category: 'organize', source: SRC_EVENTS },
  { id: 'organizer_5', name: 'Punto di ritrovo', criterion: 'Organizza 5 uscite che si sono svolte.', category: 'organize', source: SRC_EVENTS, target: 5, unit: 'uscite' },
  ...KM_STEPS.map(([km, name]) => ({ id: `km_${km}`, name, criterion: `Raggiungi ${km} km in totale.`, category: 'distance' as const, source: SRC_ACTIVITIES, target: km, unit: 'km' })),
  { id: 'streak_4', name: 'Quattro settimane di fila', criterion: 'Almeno un’attività in 4 settimane consecutive.', category: 'consistency', source: SRC_ACTIVITIES, target: 4, unit: 'settimane' },
  { id: 'streak_12', name: 'Tre mesi costanti', criterion: 'Almeno un’attività in 12 settimane consecutive.', category: 'consistency', source: SRC_ACTIVITIES, target: 12, unit: 'settimane' },
  { id: 'club_member', name: 'Parte del gruppo', criterion: 'Entra in un club.', category: 'club', source: 'Iscrizioni ai club.' },
  { id: 'club_regular', name: 'Presenza fissa', criterion: 'Conferma 5 uscite di un club.', category: 'club', source: SRC_EVENTS, target: 5, unit: 'uscite' },
  { id: 'collective_goal', name: 'Obiettivo di squadra', criterion: 'Contribuisci a una sfida collettiva che raggiunge il traguardo.', category: 'goal', source: 'Risultati finali delle sfide collettive.' },
];

/** Lunedì (UTC) della settimana di una data ISO. */
function weekKey(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const nextWeek = (k: string) => {
  const d = new Date(k + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
};

export function computeBadges(db: DbState, userId: Id, now = new Date()): BadgeView[] {
  const nowIso = now.toISOString();
  const acts = Object.values(db.activities)
    .filter((a) => a.userId === userId && a.date <= nowIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const groupRuns = acts.filter((a) => a.source === 'event' && a.eventId && db.events[a.eventId]);
  const organized = Object.values(db.events)
    .filter((e) => e.organizerId === userId && e.status === 'active' && e.startsAt <= nowIso)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const clubRuns = groupRuns.filter((a) => db.events[a.eventId!].clubId);
  const memberships = Object.values(db.memberships)
    .filter((m) => m.userId === userId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  // Distanza cumulata con la data in cui si supera ogni soglia. "Altro" non conta: i suoi km non sono di corsa o cammino.
  const kmReached = new Map<number, string>();
  let km = 0;
  for (const a of acts) {
    if (a.distanceKm === null || !sportDef(a.sport).performance) continue;
    km += a.distanceKm;
    for (const [step] of KM_STEPS) if (km >= step && !kmReached.has(step)) kmReached.set(step, a.date);
  }

  // Settimane consecutive con almeno un'attività: miglior serie e data in cui si raggiunge ogni soglia.
  const firstInWeek = new Map<string, string>();
  for (const a of acts) {
    const w = weekKey(a.date);
    if (!firstInWeek.has(w)) firstInWeek.set(w, a.date);
  }
  const weeks = [...firstInWeek.keys()].sort();
  let run = 0;
  let best = 0;
  let prev: string | null = null;
  const streakReached = new Map<number, string>();
  for (const w of weeks) {
    run = prev && nextWeek(prev) === w ? run + 1 : 1;
    prev = w;
    best = Math.max(best, run);
    for (const n of [4, 12]) if (run >= n && !streakReached.has(n)) streakReached.set(n, firstInWeek.get(w)!);
  }

  const goal = Object.values(db.challenges)
    .filter((c) => c.type === 'collective_distance' && c.status === 'active' && c.final && c.goalKm !== null && c.final.totalKm >= c.goalKm && c.final.rows.some((r) => r.userId === userId && r.value > 0))
    .sort((a, b) => a.final!.finalizedAt.localeCompare(b.final!.finalizedAt))[0];

  const out: BadgeView[] = [];
  for (const d of BADGE_DEFS) {
    let earnedAt: string | null = null;
    let current: number | null = null;
    switch (d.id) {
      case 'first_group_run':
        earnedAt = groupRuns[0]?.date ?? null;
        break;
      case 'group_runs_10':
        current = groupRuns.length;
        earnedAt = groupRuns[9]?.date ?? null;
        break;
      case 'first_organized':
        earnedAt = organized[0]?.startsAt ?? null;
        break;
      case 'organizer_5':
        current = organized.length;
        earnedAt = organized[4]?.startsAt ?? null;
        break;
      case 'streak_4':
      case 'streak_12':
        current = best;
        earnedAt = streakReached.get(d.target!) ?? null;
        break;
      case 'club_member':
        earnedAt = memberships[0]?.joinedAt ?? null;
        break;
      case 'club_regular':
        current = clubRuns.length;
        earnedAt = clubRuns[4]?.date ?? null;
        break;
      case 'collective_goal':
        earnedAt = goal?.final?.finalizedAt ?? null;
        break;
      default:
        if (d.id.startsWith('km_')) {
          current = Math.round(km * 10) / 10;
          earnedAt = kmReached.get(d.target!) ?? null;
        }
    }
    const target = d.target ?? null;
    out.push({
      id: d.id,
      name: d.name,
      criterion: d.criterion,
      category: d.category,
      earned: earnedAt !== null,
      earnedAt,
      progress: earnedAt ? 1 : target && current !== null ? Math.min(1, current / target) : null,
      current: target ? Math.min(current ?? 0, target) : null,
      target,
      unit: d.unit ?? null,
      source: d.source,
    });
  }
  return out;
}
