import type { Ionicons } from '@expo/vector-icons';

import { allAwards, currentRecords, SPORT_NAME, type Award, type AwardCategory, type AwardSport, type RecordEntry } from '@shared/records.ts';
import type { WorkoutLog } from '@shared/types.ts';

/**
 * Sistema UNICO dei riconoscimenti (identità visiva centralizzata): forma esagonale, simbolo e colore di ogni tipo.
 * Ogni schermata (badge, banner, collezione, dettaglio, profilo, racconti) legge da qui: nessun colore o simbolo altrove.
 *
 * Il colore segue la CATEGORIA decisa dal motore (shared/records.ts), così lo stesso tipo ha sempre lo stesso aspetto.
 * Tre tipi della legenda (Ritmo in crescita, Inarrestabile, Obiettivo raggiunto) fanno parte dell'identità visiva
 * ma oggi il motore non ha una regola che li assegni: non compaiono mai come "conquiste" né come caselle da conquistare.
 */
export interface AwardTone {
  /** Colore pieno del badge. */
  solid: string;
  /** Fondo scuro della sfumatura. */
  deep: string;
  /** Bordo luminoso e testi colorati su fondo scuro (contrasto ≥ 4.5:1 su bg e surface). */
  light: string;
}

export type BadgeSymbol = 'mountain' | 'footsteps' | 'pin' | 'stopwatch' | 'calendar' | 'flame' | 'dumbbell' | 'target' | 'compass' | 'star';

/** Le categorie del motore più i tipi solo visivi della legenda. */
export type BadgeKind = AwardCategory | 'pace_up' | 'unstoppable' | 'goal_reached';

export interface BadgeKindDef {
  label: string;
  symbol: BadgeSymbol;
  tone: AwardTone;
  /** true = il motore lo assegna davvero (categoria di shared/records.ts). */
  earnable: boolean;
}

export const BADGE_KINDS: Record<BadgeKind, BadgeKindDef> = {
  new_peak: { label: 'Nuova vetta', symbol: 'mountain', earnable: true, tone: { solid: '#F2A922', deep: '#7A4A05', light: '#FFD36B' } },
  first_step: { label: 'Primo passo', symbol: 'footsteps', earnable: true, tone: { solid: '#2DB467', deep: '#0E5A31', light: '#7FE3A8' } },
  beyond_limit: { label: 'Oltre il limite', symbol: 'pin', earnable: true, tone: { solid: '#3A64DA', deep: '#16297A', light: '#9DB6FF' } },
  pace_up: { label: 'Ritmo in crescita', symbol: 'stopwatch', earnable: false, tone: { solid: '#8A47DB', deep: '#3E1883', light: '#C9A6FF' } },
  steady: { label: 'Costanza', symbol: 'calendar', earnable: true, tone: { solid: '#2A8FEA', deep: '#0C4A92', light: '#8FCBFF' } },
  unstoppable: { label: 'Inarrestabile', symbol: 'flame', earnable: false, tone: { solid: '#E5404F', deep: '#7D1220', light: '#FF9DA5' } },
  strength_up: { label: 'Forza in crescita', symbol: 'dumbbell', earnable: true, tone: { solid: '#16B0A0', deep: '#075A52', light: '#7DE6DA' } },
  precision: { label: 'Precisione', symbol: 'target', earnable: true, tone: { solid: '#F2761D', deep: '#8A3605', light: '#FFBE87' } },
  explorer: { label: 'Esploratore', symbol: 'compass', earnable: true, tone: { solid: '#A05BF0', deep: '#4B1F94', light: '#D6B8FF' } },
  goal_reached: { label: 'Obiettivo raggiunto', symbol: 'star', earnable: false, tone: { solid: '#EA4A8B', deep: '#851947', light: '#FFA3C8' } },
};

/** Ordine della legenda (stesso del mockup). */
export const LEGEND_ORDER: BadgeKind[] = ['new_peak', 'first_step', 'beyond_limit', 'pace_up', 'steady', 'unstoppable', 'strength_up', 'precision', 'explorer', 'goal_reached'];
/** Solo le categorie che il motore assegna, nello stesso ordine. */
export const CATEGORY_ORDER = LEGEND_ORDER.filter((k): k is AwardCategory => BADGE_KINDS[k].earnable);

/** Grigio dei riconoscimenti non ancora conquistati. */
export const LOCKED_TONE: AwardTone = { solid: '#3A434C', deep: '#1E242A', light: '#5C6772' };
/** Simbolo dei riconoscimenti non ancora conquistati (contrasto ≥ 3:1 sul grigio, è un elemento grafico). */
export const LOCKED_INK = '#8C98A4';

/**
 * Aspetto (simbolo + colore) di un riconoscimento. È la categoria del motore, con una sola eccezione voluta dalla
 * legenda: i record di DISTANZA massima (categoria "Oltre il limite", misurati in km) hanno la montagna dorata della
 * "Nuova vetta", come "Nuova distanza massima" nel mockup. "Oltre il limite" (segnaposto) resta per le durate massime.
 * Unica regola usata da badge, banner, collezione, dettaglio e profilo.
 */
export function kindOf(a: { category: AwardCategory; unit?: string }): AwardCategory {
  return a.category === 'beyond_limit' && a.unit === 'km' ? 'new_peak' : a.category;
}
export const toneOfAward = (a: { category: AwardCategory; unit?: string }): AwardTone => BADGE_KINDS[kindOf(a)].tone;

/** Tono del motore (`Award.tone`) → aspetto: serve solo dove arriva il tono senza la categoria (record attuali). */
const TONE_CATEGORY: Record<string, AwardCategory> = {
  km1: 'new_peak',
  km5: 'new_peak',
  km10: 'new_peak',
  km21: 'new_peak',
  // distanza massima di corsa e trail: stesso aspetto della "Nuova vetta" (vedi kindOf)
  distance: 'new_peak',
  time: 'beyond_limit',
  walk: 'beyond_limit',
  strength: 'strength_up',
  precision: 'precision',
  steady: 'steady',
  explorer: 'explorer',
  first: 'first_step',
};

export const categoryOfTone = (tone: string): AwardCategory => TONE_CATEGORY[tone] ?? 'new_peak';

/** Compatibilità: colore dal tono del motore, uguale a quello della sua categoria. */
export const AWARD_TONES: Record<string, AwardTone> = Object.fromEntries(Object.entries(TONE_CATEGORY).map(([t, c]) => [t, BADGE_KINDS[c].tone]));
export const toneOf = (tone: string): AwardTone => AWARD_TONES[tone] ?? BADGE_KINDS.steady.tone;
export const toneOfCategory = (c: AwardCategory): AwardTone => BADGE_KINDS[c]?.tone ?? BADGE_KINDS.steady.tone;

type IonName = keyof typeof Ionicons.glyphMap;
/** Compatibilità con le schermate esistenti (etichetta della categoria e icona di riserva). */
export const CATEGORY: Record<AwardCategory, { label: string; icon: IonName; symbol: BadgeSymbol }> = {
  new_peak: { label: BADGE_KINDS.new_peak.label, icon: 'trending-up', symbol: 'mountain' },
  first_step: { label: BADGE_KINDS.first_step.label, icon: 'footsteps', symbol: 'footsteps' },
  beyond_limit: { label: BADGE_KINDS.beyond_limit.label, icon: 'location', symbol: 'pin' },
  steady: { label: BADGE_KINDS.steady.label, icon: 'calendar', symbol: 'calendar' },
  strength_up: { label: BADGE_KINDS.strength_up.label, icon: 'barbell', symbol: 'dumbbell' },
  precision: { label: BADGE_KINDS.precision.label, icon: 'locate', symbol: 'target' },
  explorer: { label: BADGE_KINDS.explorer.label, icon: 'compass', symbol: 'compass' },
};

/* ---------- testi derivati dai valori reali del motore ---------- */

/** Etichetta dei km sul badge: solo per i riconoscimenti misurati in km (record di distanza o sui km). */
export const kmMark = (a: { mark: string; unit: string }): string | null => (a.unit === 'km' && a.mark ? a.mark : null);

/**
 * Titolo breve e parlante, derivato dal codice del motore: "Nuova distanza massima", "Miglior tempo sui 5 km",
 * "Costanza settimanale"… Per i codici sconosciuti resta il nome del motore.
 */
export function awardTitle(a: Pick<Award, 'name'> & { code?: string }): string {
  const c = a.code ?? '';
  if (c.endsWith('_longest_dist')) return 'Nuova distanza massima';
  if (c.endsWith('_longest_time')) return 'Nuova durata massima';
  const seg = /^seg_(\d+)$/.exec(c);
  if (seg) return `Miglior tempo sui ${seg[1]} km`;
  const tot = /^tot_(\d+)$/.exec(c);
  if (tot) return tot[1] === '21' ? 'Miglior mezza maratona' : `Miglior corsa da ${tot[1]} km`;
  if (c === 'week_3') return 'Costanza settimanale';
  if (c === 'str_volume') return 'Nuovo volume massimo';
  if (c.startsWith('load_')) return a.name.replace(/^Forza in crescita · /, 'Nuovo carico · ');
  if (c.startsWith('count_')) return a.name === BADGE_KINDS.explorer.label ? `${a.name} · ${c.split('_').pop()}` : a.name;
  return a.name;
}

/** Frase del riconoscimento: per la distanza massima cita il valore reale, altrimenti il titolo del motore. */
export function awardSentence(a: Pick<Award, 'code' | 'headline' | 'value'>): string {
  if (a.code.endsWith('_longest_dist')) return `Hai percorso ${a.value}, il tuo nuovo record personale!`;
  return a.headline;
}

/** Valore leggibile in elenco ("8,42 km", "Prima attività", "3 attività"). */
export function awardValue(a: Pick<Award, 'category' | 'value'>): string {
  return a.category === 'first_step' ? 'Prima attività' : a.value;
}

/** "8,42 km · Corsa". */
export const awardSubtitle = (a: Pick<Award, 'category' | 'value' | 'sport'>): string => `${awardValue(a)} · ${SPORT_NAME[a.sport]}`;

/** Testo da condividere: solo i valori reali del riconoscimento. */
export const awardShareText = (a: Award): string => `${awardTitle(a)}: ${a.value}${a.previous ? ` (prima ${a.previous})` : ''}${a.improvement ? ` · ${a.improvement}` : ''} · RUNNGO`;

/** "Record personale · Oltre il limite" oppure "Traguardo · Costanza". */
export const awardKindText = (a: Pick<Award, 'record' | 'category'>): string => `${a.record ? 'Record personale' : 'Traguardo'} · ${CATEGORY[a.category].label}`;

/** Interpreta un valore del motore: "8,42 km", "45 min", "12,5 kg", "1234 kg", "24:13", "1:02:09". */
export function parseMeasure(s: string | null): { v: number; time: boolean } | null {
  if (!s) return null;
  let m = /^(\d+):(\d{2}):(\d{2})$/.exec(s.trim());
  if (m) return { v: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]), time: true };
  m = /^(\d+):(\d{2})$/.exec(s.trim());
  if (m) return { v: Number(m[1]) * 60 + Number(m[2]), time: true };
  m = /^(\d+(?:,\d+)?)\s*(km|min|kg|t)$/.exec(s.trim());
  if (m) return { v: Number(m[1].replace(',', '.')), time: false };
  return null;
}

/**
 * Miglioramento percentuale rispetto al record precedente, calcolato SOLO dai due valori reali del motore.
 * Tempi: più basso è meglio; distanze, durate e carichi: più alto è meglio. null se non confrontabile.
 */
export function improvementPct(a: Pick<Award, 'value' | 'previous'>): number | null {
  const now = parseMeasure(a.value);
  const prev = parseMeasure(a.previous);
  if (!now || !prev || now.time !== prev.time || prev.v <= 0) return null;
  const p = now.time ? (prev.v - now.v) / prev.v : (now.v - prev.v) / prev.v;
  return p > 0 ? p * 100 : null;
}

export const fmtPct = (p: number): string => `+${(Math.round(p * 10) / 10).toFixed(1).replace('.', ',')}%`;

/** Valore e unità separati, per mostrare l'unità più piccola ("8,42" + "km"). */
export function valueParts(v: string): [string, string] {
  const m = /^(.*?)\s(km|min|kg)$/.exec(v);
  return m ? [m[1], m[2]] : [v, ''];
}

/* ---------- record personali ---------- */

const RECORD_TITLE: Record<string, string> = {
  seg_1: '1 km · Tempo',
  seg_5: '5 km · Tempo',
  seg_10: '10 km · Tempo',
  tot_5: 'Corsa da 5 km · Tempo totale',
  tot_10: 'Corsa da 10 km · Tempo totale',
  tot_21: 'Mezza maratona · Tempo totale',
  run_longest_dist: 'Distanza massima',
  run_longest_time: 'Durata massima',
  walk_longest_dist: 'Camminata · Distanza massima',
  walk_longest_time: 'Camminata · Durata massima',
  trail_longest_dist: 'Trail · Distanza massima',
  trail_longest_time: 'Trail · Durata massima',
};
export const recordTitle = (r: Pick<RecordEntry, 'code' | 'label'>): string => RECORD_TITLE[r.code] ?? r.label;
export const recordCategory = (r: Pick<RecordEntry, 'tone'>): AwardCategory => categoryOfTone(r.tone);
/** Aspetto di un record attuale (stessa regola dei riconoscimenti: le distanze hanno la montagna). */
export const recordKind = (r: Pick<RecordEntry, 'tone' | 'unit'>): AwardCategory => kindOf({ category: categoryOfTone(r.tone), unit: r.unit });

/** Priorità dei record "principali" (i più significativi per chi corre per primi). */
const RECORD_PRIORITY = ['seg_1', 'seg_5', 'run_longest_dist', 'seg_10', 'tot_5', 'tot_10', 'tot_21', 'run_longest_time', 'trail_longest_dist', 'walk_longest_dist', 'trail_longest_time', 'walk_longest_time'];
export function mainRecords(records: RecordEntry[]): RecordEntry[] {
  const rank = (r: RecordEntry) => {
    const i = RECORD_PRIORITY.indexOf(r.code);
    return i < 0 ? RECORD_PRIORITY.length : i;
  };
  return [...records].sort((a, b) => rank(a) - rank(b));
}

/** Il riconoscimento che ha stabilito un record attuale (se il record non è il primo risultato in assoluto). */
export function awardOfRecord(r: RecordEntry, awards: Award[]): Award | null {
  const code = r.code.startsWith('load_') ? `load_${r.code.slice(5).replace(/[^a-z0-9]+/g, '_')}` : r.code;
  return awards.find((a) => a.logId === r.logId && a.code === code && a.record) ?? null;
}

/* ---------- catalogo della collezione: SOLO ciò che il motore può assegnare ---------- */

export interface CatalogEntry {
  key: string;
  sport: AwardSport;
  category: AwardCategory;
  name: string;
  /** Come si conquista (mostrato quando è ancora da conquistare). */
  hint: string;
  /** Il codice del motore inizia così (carichi per esercizio). */
  prefix?: string;
  /** Etichetta dei km sul badge, quando il riconoscimento è su una distanza fissa. */
  km?: string;
  /** Unità del valore ('km' per le distanze: decide l'aspetto con kindOf). */
  unit?: string;
}

export const COLLECTION_SPORTS: AwardSport[] = ['running', 'walking', 'trail', 'strength'];
const COUNT_STEPS = [10, 25, 50, 100];
const PLURAL: Record<AwardSport, string> = { running: 'corse', walking: 'camminate', trail: 'uscite trail', strength: 'sessioni di forza' };
const NEEDS_HISTORY = 'Serve almeno un’attività precedente con cui confrontarla.';

/** Specchio delle regole di shared/records.ts (stessi codici): se il motore cambia, i riconoscimenti nuovi compaiono comunque. */
export function catalogFor(s: AwardSport): CatalogEntry[] {
  const e = (key: string, category: AwardCategory, name: string, hint: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ key, sport: s, category, name, hint, ...extra });
  const out: CatalogEntry[] = [e(`first_${s}`, 'first_step', 'Primo passo', `Registra la tua prima attività di ${SPORT_NAME[s].toLowerCase()}.`)];
  if(s!=='strength')out.push(e('distance_21km','beyond_limit','Traguardo 21 km','Raggiungi almeno 21 km in un unico allenamento.',{km:'21',unit:'km'}));
  if (s === 'running') {
    for (const k of [1, 5, 10]) out.push(e(`seg_${k}`, 'new_peak', `Miglior tempo sui ${k} km`, `Migliora il tuo tratto continuo più veloce di ${k} km, registrato con il GPS dell’app senza interruzioni. ${NEEDS_HISTORY}`, { km: String(k), unit: 'km' }));
    out.push(e('tot_5', 'new_peak', 'Miglior corsa da 5 km', `Migliora il tempo totale di una corsa da 5 km. ${NEEDS_HISTORY}`, { km: '5', unit: 'km' }));
    out.push(e('tot_10', 'new_peak', 'Miglior corsa da 10 km', `Migliora il tempo totale di una corsa da 10 km. ${NEEDS_HISTORY}`, { km: '10', unit: 'km' }));
    out.push(e('tot_21', 'new_peak', 'Miglior mezza maratona', `Migliora il tempo totale di una mezza maratona. ${NEEDS_HISTORY}`, { km: '21', unit: 'km' }));
    out.push(e('run_longest_dist', 'beyond_limit', 'Nuova distanza massima', `Corri più lontano della tua corsa più lunga. ${NEEDS_HISTORY}`, { unit: 'km' }));
    out.push(e('run_longest_time', 'beyond_limit', 'Nuova durata massima', `Corri più a lungo del tuo allenamento di corsa più lungo. ${NEEDS_HISTORY}`, { unit: 'min' }));
    out.push(e('intervals_done', 'precision', 'Precisione', 'Completa un allenamento di ripetute del tuo piano.'));
  }
  if (s === 'walking') {
    out.push(e('walk_longest_dist', 'beyond_limit', 'Nuova distanza massima', `Cammina più lontano della tua camminata più lunga. ${NEEDS_HISTORY}`, { unit: 'km' }));
    out.push(e('walk_longest_time', 'beyond_limit', 'Nuova durata massima', `Cammina più a lungo della tua camminata più lunga. ${NEEDS_HISTORY}`, { unit: 'min' }));
  }
  if (s === 'trail') {
    out.push(e('trail_longest_dist', 'beyond_limit', 'Nuova distanza massima', `Supera la distanza della tua uscita trail più lunga. ${NEEDS_HISTORY}`, { unit: 'km' }));
    out.push(e('trail_longest_time', 'beyond_limit', 'Nuova durata massima', `Supera la durata della tua uscita trail più lunga. ${NEEDS_HISTORY}`, { unit: 'min' }));
  }
  if (s === 'strength') {
    out.push(e('load', 'strength_up', 'Nuovo carico', `Usa in un esercizio un carico più alto del tuo massimo, con serie svolte. ${NEEDS_HISTORY}`, { prefix: 'load_', unit: 'kg' }));
    out.push(e('str_volume', 'strength_up', 'Nuovo volume massimo', `Supera il volume (ripetizioni × carico) del tuo allenamento di forza più pesante. ${NEEDS_HISTORY}`, { unit: 't' }));
  }
  out.push(e('week_3', 'steady', 'Costanza settimanale', 'Svolgi tre attività nella stessa settimana (da lunedì a domenica).'));
  for (const n of COUNT_STEPS) out.push(e(`count_${s}_${n}`, 'explorer', `Esploratore · ${n}`, `Arriva a ${n} ${PLURAL[s]} registrate.`));
  return out;
}

export const matchesEntry = (e: CatalogEntry, a: Pick<Award, 'code' | 'sport'>): boolean => a.sport === e.sport && (e.prefix ? a.code.startsWith(e.prefix) : a.code === e.key);

export interface CollectionCell {
  entry: CatalogEntry;
  /** Il più recente, se conquistato. */
  latest: Award | null;
  /** Quante volte è stato conquistato. */
  times: number;
}

/** Caselle della collezione di uno sport: il catalogo reale più gli eventuali riconoscimenti non (ancora) catalogati. */
export function collectionOf(s: AwardSport, awards: Award[]): CollectionCell[] {
  const mine = awards.filter((a) => a.sport === s).sort((a, b) => b.date.localeCompare(a.date));
  const cat = catalogFor(s);
  const cells: CollectionCell[] = cat.map((entry) => {
    const got = mine.filter((a) => matchesEntry(entry, a));
    return { entry, latest: got[0] ?? null, times: got.length };
  });
  const extra = new Map<string, Award[]>();
  for (const a of mine) if (!cat.some((e) => matchesEntry(e, a))) extra.set(a.code, [...(extra.get(a.code) ?? []), a]);
  for (const [code, list] of extra) cells.push({ entry: { key: code, sport: s, category: list[0].category, name: awardTitle(list[0]), hint: list[0].description, unit: list[0].unit }, latest: list[0], times: list.length });
  return cells;
}

/** Caselle di un aspetto (categoria visiva, vedi kindOf) per tutti gli sport, conquistate prima. */
export function collectionOfKind(k: AwardCategory, awards: Award[]): CollectionCell[] {
  return COLLECTION_SPORTS.flatMap((s) => collectionOf(s, awards)).filter((c) => kindOf(c.entry) === k);
}

/** Conquistate / totale delle caselle. */
export const collectionCount = (cells: CollectionCell[]): [number, number] => [cells.filter((c) => c.latest).length, cells.length];

/* ---------- dati derivati (con memoria: il calcolo sullo storico è pesante) ---------- */

let memo: { key: string; awards: Award[]; records: RecordEntry[] } | null = null;

/** Riconoscimenti (dal più recente) e record attuali dello storico. Ricalcolati solo se lo storico cambia. */
export function awardsOf(logs: WorkoutLog[]): { awards: Award[]; records: RecordEntry[] } {
  const key = `${logs.length}|${logs.map((l) => `${l.id}@${l.updatedAt}`).join(',')}`;
  if (memo?.key === key) return memo;
  memo = { key, awards: allAwards(logs), records: currentRecords(logs) };
  return memo;
}

/** Stesso mese di calendario (locale) di oggi. */
export function inThisMonth(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
