import { ACTIVITY_STYLES, gradientFor, styleOfKind, styleOfSport, type ActivityStyle } from '../constants/activityColors';
import type { WorkoutLog } from '../../../shared/types.ts';

/**
 * Colori e personalità di un racconto, derivati dalle attività REALI (mai a caso):
 *  - solo corsa → colore della corsa; solo camminata → della camminata;
 *  - corsa e camminata nello stesso giorno (o attività combinata) → fusione dei due colori ufficiali;
 *  - altro (forza, ripetute…) → colore ufficiale della categoria.
 * Variante d'animazione, motivo decorativo e seme sono deterministici (dipendono dall'id): non cambiano a ogni render.
 */
export type StoryVariant = 'trace' | 'sweep' | 'spark' | 'wave';
/** Decorazione DICHIARATAMENTE astratta per i racconti senza GPS: mai una linea che sembri un percorso. */
export type StoryMotif = 'rings' | 'orbs' | 'glyph';
/**
 * Su cosa insiste il racconto: corsa → ritmo/distanza/record; camminata → durata/percorso/costanza;
 * trail → distanza e durata (sui sentieri il dislivello falsa il passo, come nel motore dei record).
 */
export type StoryFocus = 'run' | 'walk' | 'trail' | 'mixed' | 'other';

/**
 * Stessa regola del dettaglio dell'allenamento: camminata dallo sport, trail dal campo `trail` (racconti Strava
 * "TrailRun", sempre con sport corsa), il resto dal tipo di sessione.
 */
export function styleOfLog(l: WorkoutLog): ActivityStyle {
  if (l.kind === 'run_walk' || /camminata\s*(?:[+\/&-]|e)\s*corsa|corsa\s*(?:[+\/&-]|e)\s*camminata|run[ _-]?walk/i.test(l.title)) return ACTIVITY_STYLES.run_walk;
  if (l.sport === 'walking') return ACTIVITY_STYLES.walk;
  if (l.trail) return ACTIVITY_STYLES.trail;
  const s = styleOfKind(l.kind, l.title);
  // un'attività svolta non ha mai il colore di uno stato del piano (riposo, pausa, infortunio)
  return s.planState ? styleOfSport(l.sport ?? 'running') : s;
}

/** "Corsa", "Corsa e camminata", "Corsa, camminata e forza". */
function joinLabels(labels: string[]): string {
  const [first, ...rest] = labels;
  const low = rest.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  if (!low.length) return first;
  return `${[first, ...low.slice(0, -1)].join(', ')} e ${low[low.length - 1]}`;
}

const VARIANTS: StoryVariant[] = ['trace', 'sweep', 'spark', 'wave'];
const MOTIFS: StoryMotif[] = ['rings', 'orbs', 'glyph'];
function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/* ---------- colori ---------- */

function rgb(hex: string): [number, number, number] {
  const x = hex.replace('#', '');
  const f = x.length === 3 ? x.split('').map((c) => c + c).join('') : x.slice(0, 6);
  const n = parseInt(f, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

/** Miscela lineare tra due colori esadecimali (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = rgb(a);
  const q = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** Colore con trasparenza (alpha 0–1), in formato #RRGGBBAA. */
export function alpha(hex: string, a: number): string {
  return `${mix(hex, hex, 0)}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
}

export interface StoryPalette {
  a: string;
  b: string;
  deep: string;
  styles: ActivityStyle[];
  variant: StoryVariant;
  /** Etichetta breve del tipo (es. "Corsa e camminata"). */
  label: string;
  /** true se il racconto fonde due colori ufficiali (attività combinata o più attività nel giorno). */
  blend: boolean;
  /** Colore a metà tra a e b (uguale ad a se il colore è uno solo). */
  mid: string;
  /** Secondo colore per i gradienti dinamici: b se c'è una fusione, altrimenti a schiarito. */
  second: string;
  /** Tracciato su fondo scuro: il colore dell'attività, schiarito per restare leggibile. */
  line: string;
  motif: StoryMotif;
  focus: StoryFocus;
  /** Seme stabile per le varianti visive del racconto. */
  seed: number;
}

/** Stessa classificazione del motore dei riconoscimenti (shared/records.ts → groupOf). */
function focusOf(l: WorkoutLog): StoryFocus {
  if (l.kind === 'strength') return 'other';
  if (l.sport === 'walking') return 'walk';
  if (l.trail) return 'trail';
  if (l.kind === 'run_walk') return 'mixed';
  if (l.sport === 'running' || l.kind.startsWith('run_')) return 'run';
  return 'other';
}

const DEEP = '#0B0F14';

/** Giorno di calendario locale (quello che l'utente considera "oggi"), non quello UTC. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function storyPalette(log: WorkoutLog, all: WorkoutLog[] = []): StoryPalette {
  const day = localDay(log.startedAt);
  const others = all.filter((l) => l.id !== log.id && localDay(l.startedAt) === day);
  // il primo è sempre l'attività del racconto (la sua figura); poi le altre del giorno
  const styles: ActivityStyle[] = [];
  for (const l of [log, ...others]) {
    const s = styleOfLog(l);
    if (!styles.some((x) => x.label === s.label)) styles.push(s);
  }
  // Un colore già contenuto in un'attività combinata non si ripete: corsa + "corsa e camminata" = corsa e camminata.
  const named = styles.filter((s) => s.blend || !styles.some((x) => x.blend?.includes(s.solid)));
  const [a, b] = gradientFor(named);
  const label = joinLabels(named.map((s) => s.label));
  const seed = hash(log.id);
  const blend = a.toLowerCase() !== b.toLowerCase();
  return {
    a,
    b,
    deep: DEEP,
    styles,
    variant: VARIANTS[seed % VARIANTS.length],
    label,
    blend,
    mid: blend ? mix(a, b, 0.5) : a,
    second: blend ? b : mix(a, '#FFFFFF', 0.3),
    line: mix(a, '#FFFFFF', 0.28),
    motif: MOTIFS[(seed >>> 3) % MOTIFS.length],
    focus: focusOf(log),
    seed,
  };
}
