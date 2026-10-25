/**
 * Livello di un'uscita di gruppo e regole pure dei selettori di distanza e ritmo.
 *
 * Il server conserva solo tre livelli (easy / medium / hard): l'app ne mostra cinque, più leggibili, e li converte
 * con toServerLevel / fromServerLevel. La stima parte SOLO da tipo, distanza e ritmo scelti dall'organizzatore
 * (nessun dato inventato) ed è prudente: nel dubbio il livello sale, così nessuno si trova in un'uscita più dura del previsto.
 *
 * Tipi nuovi:
 *  - trail: il dislivello falsa il passo, quindi il ritmo da solo non lo giudica. Conta la distanza (con soglie più basse
 *    della strada) e il ritmo può solo ALZARE il livello, mai abbassarlo; senza distanza resta almeno "Intermedio".
 *  - corsa + camminata: fasce proprie, tra quelle della camminata e quelle della corsa.
 *  - altro: non si sa che attività sia, quindi nessuna stima da distanza o ritmo: "Intermedio" e lo sceglie chi organizza.
 */
import type { Level, SportId } from './types.ts';

export type EventSport = 'running' | 'walking' | 'trail' | 'run_walk' | 'other';

/** Tipo delle scale e della stima per uno sport salvato: gli sport non ancora attivi valgono "altro". */
export function eventSportOf(sport: SportId): EventSport {
  return sport === 'running' || sport === 'walking' || sport === 'trail' || sport === 'run_walk' ? sport : 'other';
}

export type UiLevel = 0 | 1 | 2 | 3 | 4;
/** Da cosa nasce la stima: dal ritmo (eventualmente corretto dalla distanza), dalla sola distanza o da nulla. */
export type LevelBasis = 'pace' | 'distance' | 'default';

export const UI_LEVELS: ReadonlyArray<{ id: UiLevel; label: string; hint: string }> = [
  { id: 0, label: 'Principiante', hint: 'Per chi inizia, con pause se servono' },
  { id: 1, label: 'Tranquillo', hint: 'Si chiacchiera senza fatica' },
  { id: 2, label: 'Intermedio', hint: 'Ritmo costante, un po’ di impegno' },
  { id: 3, label: 'Sostenuto', hint: 'Per chi si allena con regolarità' },
  { id: 4, label: 'Avanzato', hint: 'Per chi è molto allenato' },
];

export function clampLevel(n: number): UiLevel {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, Math.round(n))) as UiLevel;
}

export const levelLabel = (l: UiLevel): string => UI_LEVELS[clampLevel(l)].label;
export const levelHint = (l: UiLevel): string => UI_LEVELS[clampLevel(l)].hint;

/** Tipi con un ritmo significativo (per "Altro" non si stima nulla). */
type PacedSport = 'running' | 'walking' | 'trail' | 'run_walk';

/**
 * Fasce di passo (sec/km), dal più veloce: passo ≤ b[0] → Avanzato, ≤ b[1] → Sostenuto, ≤ b[2] → Intermedio,
 * ≤ b[3] → Tranquillo, oltre → Principiante. Al confine esatto vale il livello più impegnativo (prudenza).
 */
const PACE_BANDS: Record<PacedSport, readonly [number, number, number, number]> = {
  running: [285, 330, 390, 450], // 4:45 · 5:30 · 6:30 · 7:30
  walking: [480, 540, 630, 750], // 8:00 (7,5 km/h) · 9:00 · 10:30 · 12:30 (4,8 km/h)
  // Sul trail il passo è più lento a parità di fatica: queste fasce servono solo ad alzare il livello.
  trail: [360, 420, 510, 600], // 6:00 · 7:00 · 8:30 · 10:00
  run_walk: [390, 450, 540, 660], // 6:30 · 7:30 · 9:00 · 11:00 (passo medio, camminate comprese)
};

/** Con il ritmo noto: quanto alza il livello una distanza lunga, e il livello minimo per quella distanza. */
const LONG: Record<'running' | 'walking' | 'run_walk', { bump: Array<[number, number]>; floor: Array<[number, UiLevel]> }> = {
  running: {
    bump: [[25, 2], [15, 1]],
    floor: [[30, 3], [18, 2], [12, 1]],
  },
  walking: {
    bump: [[20, 2], [12, 1]],
    floor: [[25, 3], [15, 2], [8, 1]],
  },
  run_walk: {
    bump: [[18, 2], [12, 1]],
    floor: [[21, 3], [14, 2], [8, 1]],
  },
};

/** Senza ritmo: livello dalla sola distanza (km ≤ soglia → livello). Per corsa e trail mai "Principiante" senza un ritmo. */
const BY_DISTANCE: Record<PacedSport, Array<[number, UiLevel]>> = {
  running: [[5, 1], [12, 2], [24, 3]],
  walking: [[3, 0], [8, 1], [14, 2], [20, 3]],
  // Sentieri e dislivello rendono ogni chilometro più impegnativo che su strada.
  trail: [[6, 1], [12, 2], [20, 3]],
  run_walk: [[3, 0], [6, 1], [10, 2], [16, 3]],
};
const DISTANCE_TOP: UiLevel = 4;

/**
 * Senza distanza né ritmo: corsa "Intermedio" (chi inizia sa che serve un po' di impegno), camminata e corsa + camminata
 * "Tranquillo"; trail "Intermedio" (terreno e dislivello sconosciuti); altro "Intermedio" (attività sconosciuta).
 */
const DEFAULT_LEVEL: Record<EventSport, UiLevel> = { running: 2, walking: 1, trail: 2, run_walk: 1, other: 2 };

const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function paceLevel(sport: PacedSport, pace: number): UiLevel {
  const b = PACE_BANDS[sport];
  if (pace <= b[0]) return 4;
  if (pace <= b[1]) return 3;
  if (pace <= b[2]) return 2;
  if (pace <= b[3]) return 1;
  return 0;
}

function distanceLevel(sport: PacedSport, km: number): UiLevel {
  const row = BY_DISTANCE[sport].find(([max]) => km <= max);
  return row ? row[1] : DISTANCE_TOP;
}

const firstAtLeast = <T>(rows: Array<[number, T]>, km: number): T | null => {
  for (const [min, v] of rows) if (km >= min) return v;
  return null;
};

export function estimateLevel(input: { sport: EventSport | SportId; km: number | null; paceSec: number | null }): { level: UiLevel; basis: LevelBasis } {
  const sport = eventSportOf(input.sport);
  const km = valid(input.km) ? input.km : null;
  const pace = valid(input.paceSec) ? input.paceSec : null;
  // Attività sconosciuta: distanza e ritmo non dicono quanto è impegnativa.
  if (sport === 'other') return { level: DEFAULT_LEVEL.other, basis: 'default' };
  if (sport === 'trail') {
    // Mai dal solo passo: la base è la distanza (o il default prudente) e il ritmo può solo alzarla.
    const base = km !== null ? distanceLevel('trail', km) : DEFAULT_LEVEL.trail;
    const byPace = pace !== null ? paceLevel('trail', pace) : null;
    if (byPace !== null && byPace > base) return { level: byPace, basis: 'pace' };
    return { level: base, basis: km !== null ? 'distance' : 'default' };
  }
  if (pace !== null) {
    let level: number = paceLevel(sport, pace);
    if (km !== null) {
      level += firstAtLeast(LONG[sport].bump, km) ?? 0;
      level = Math.max(level, firstAtLeast(LONG[sport].floor, km) ?? 0);
    }
    return { level: clampLevel(level), basis: 'pace' };
  }
  if (km !== null) return { level: distanceLevel(sport, km), basis: 'distance' };
  return { level: DEFAULT_LEVEL[sport], basis: 'default' };
}

/** Cinque livelli dell'app → tre del server: 0-1 easy, 2 medium, 3-4 hard. */
export function toServerLevel(l: UiLevel): Level {
  const n = clampLevel(l);
  return n <= 1 ? 'easy' : n === 2 ? 'medium' : 'hard';
}

/**
 * Tre livelli del server → livello dell'app. Se `near` (per esempio la stima attuale) cade nella stessa fascia
 * del server, si usa quello: si recupera la sfumatura (Principiante/Tranquillo, Sostenuto/Avanzato) senza cambiare il dato salvato.
 */
export function fromServerLevel(level: Level, near?: UiLevel | null): UiLevel {
  if (near !== undefined && near !== null && toServerLevel(near) === level) return clampLevel(near);
  return level === 'easy' ? 1 : level === 'hard' ? 3 : 2;
}

/* ---------- distanza ---------- */

/** Distanze comuni: tacche equispaziate sulla scala (la scala è lineare a tratti tra una tacca e l'altra). */
export const DISTANCE_TICKS: Record<EventSport, readonly number[]> = {
  running: [1, 3, 5, 8, 10, 15, 21, 30, 42],
  walking: [1, 2, 4, 6, 8, 10, 15, 20],
  trail: [3, 5, 10, 15, 21, 30, 42, 60],
  run_walk: [1, 2, 3, 5, 8, 10, 15, 21],
  other: [1, 3, 5, 10, 20, 30, 50, 100],
};
/** Limiti accettati dal server; il passo dei controlli è mezzo chilometro. */
export const DISTANCE_LIMITS = { min: 0.5, max: 300, step: 0.5 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Posizione (0-1) di una distanza sulla scala a tacche equispaziate. Fuori scala resta agli estremi. */
export function kmToFrac(ticks: readonly number[], km: number): number {
  const n = ticks.length;
  if (n < 2 || !Number.isFinite(km)) return 0;
  if (km <= ticks[0]) return 0;
  if (km >= ticks[n - 1]) return 1;
  let i = 0;
  while (i < n - 2 && km >= ticks[i + 1]) i++;
  return (i + (km - ticks[i]) / (ticks[i + 1] - ticks[i])) / (n - 1);
}

/** Distanza (non arrotondata) in una posizione 0-1 della scala. */
export function fracToKm(ticks: readonly number[], frac: number): number {
  const n = ticks.length;
  if (n < 2) return ticks[0] ?? DISTANCE_LIMITS.min;
  const seg = clamp(Number.isFinite(frac) ? frac : 0, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(seg));
  return ticks[i] + (seg - i) * (ticks[i + 1] - ticks[i]);
}

/** Aggancio a mezzo chilometro, dentro i limiti. */
export function snapKm(km: number): number {
  return clamp(Math.round(km / DISTANCE_LIMITS.step) * DISTANCE_LIMITS.step, DISTANCE_LIMITS.min, DISTANCE_LIMITS.max);
}

/**
 * Pulsanti − e +: mezzo chilometro alla volta, riallineando al mezzo chilometro (7,33 → 7,5 con +, → 7 con −).
 * Da "nessuna distanza", + parte dalla prima tacca e − non fa nulla.
 */
export function stepKm(km: number | null, dir: 1 | -1, ticks: readonly number[]): number | null {
  if (km === null || !Number.isFinite(km)) return dir > 0 ? (ticks[0] ?? DISTANCE_LIMITS.min) : null;
  const s = DISTANCE_LIMITS.step;
  const next = dir > 0 ? Math.floor(km / s + 1e-9) * s + s : Math.ceil(km / s - 1e-9) * s - s;
  return clamp(Math.round(next * 100) / 100, DISTANCE_LIMITS.min, DISTANCE_LIMITS.max);
}

/** Distanza scritta a mano ("7,5", "21.1"): due decimali al massimo, dentro i limiti; altrimenti null. */
export function parseKm(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{0,3})?$/.test(t)) return null;
  const v = Math.round(Number(t) * 100) / 100;
  return v >= DISTANCE_LIMITS.min && v <= DISTANCE_LIMITS.max ? v : null;
}

/** Indice della tacca più vicina a `frac` entro la tolleranza (stessa unità 0-1), altrimenti -1. */
export function nearestIndex(fracs: readonly number[], frac: number, tol: number): number {
  let best = -1;
  let dist = Infinity;
  fracs.forEach((f, i) => {
    const d = Math.abs(f - frac);
    if (d <= tol && d < dist) {
      best = i;
      dist = d;
    }
  });
  return best;
}

/* ---------- ritmo ---------- */

/**
 * Scala del ritmo: a sinistra il passo lento, a destra il veloce (come distanza e livello: verso destra "di più").
 * `labels` sono le tacche con l'etichetta; il passo dei controlli è 5 secondi.
 */
export const PACE_SCALE: Record<EventSport, { slow: number; fast: number; labels: readonly number[] }> = {
  running: { slow: 540, fast: 210, labels: [540, 480, 420, 360, 300, 240] }, // 9:00 → 3:30
  walking: { slow: 900, fast: 420, labels: [900, 780, 660, 540, 420] }, // 15:00 → 7:00
  trail: { slow: 780, fast: 300, labels: [780, 660, 540, 420, 300] }, // 13:00 → 5:00: salite e discese rallentano
  run_walk: { slow: 840, fast: 360, labels: [840, 720, 600, 480, 360] }, // 14:00 → 6:00, passo medio
  // "Altro" non ha un ritmo significativo: la scala esiste solo per completezza (il modulo non la mostra).
  other: { slow: 900, fast: 240, labels: [900, 720, 540, 360] },
};

/** Il tipo ha un ritmo sensato da indicare (per "Altro" no). */
export const hasPaceScale = (sport: EventSport): boolean => sport !== 'other';
/** Limiti accettati dal server (2:00 - 15:00 al km). */
export const PACE_LIMITS = { min: 120, max: 900, step: 5 } as const;

/** Posizione 0 (lento) - 1 (veloce) di un passo sulla scala; fuori scala resta agli estremi. */
export function paceToFrac(sport: EventSport, sec: number): number {
  const { slow, fast } = PACE_SCALE[sport];
  if (!Number.isFinite(sec)) return 0;
  return clamp((slow - sec) / (slow - fast), 0, 1);
}

/** Passo in una posizione della scala, agganciato a 5 secondi. */
export function fracToPace(sport: EventSport, frac: number): number {
  const { slow, fast } = PACE_SCALE[sport];
  const raw = slow - clamp(Number.isFinite(frac) ? frac : 0, 0, 1) * (slow - fast);
  return clamp(Math.round(raw / PACE_LIMITS.step) * PACE_LIMITS.step, fast, slow);
}

/** true se il passo sta dentro la scala del tipo (estremi compresi). Cambiando tipo, un passo fuori scala non ha senso. */
export function paceInScale(sport: EventSport, sec: number | null): boolean {
  if (sec === null || !Number.isFinite(sec)) return false;
  const { slow, fast } = PACE_SCALE[sport];
  return sec >= fast && sec <= slow;
}

/** Centro della scala, agganciato: da qui partono i pulsanti quando il ritmo non è ancora scelto. */
export function paceMid(sport: EventSport): number {
  return fracToPace(sport, 0.5);
}

/**
 * Pulsanti del ritmo: dir +1 = più veloce (5 s in meno), -1 = più lento. Riallinea ai 5 s e resta nei limiti del server.
 * Da "nessun ritmo" parte dal centro della scala.
 */
export function stepPace(sec: number | null, dir: 1 | -1, sport: EventSport): number {
  const s = PACE_LIMITS.step;
  const from = sec === null || !Number.isFinite(sec) ? paceMid(sport) : sec;
  const next = dir > 0 ? Math.ceil(from / s - 1e-9) * s - s : Math.floor(from / s + 1e-9) * s + s;
  return clamp(next, PACE_LIMITS.min, PACE_LIMITS.max);
}
