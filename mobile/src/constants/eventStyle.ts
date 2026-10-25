import type { Ionicons } from '@expo/vector-icons';

// Import relativi (non '@/' né '@shared/'): il modulo si carica anche nei test vitest della root.
import { PACT_MODES, PACT_TEXT, pactBlocker, pactModes, type PactMode } from '../../../shared/pact.ts';
import type { EventView, SportId, Visibility } from '../../../shared/types.ts';
import { styleOfSport, type ActivityStyle } from './activityColors';

export { PACT_MODES, pactBlocker, pactModes, type PactMode };

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Sistema stabile per le uscite: il COLORE dice che attività è (corsa, camminata, trail, corsa + camminata, altro: gli stessi
 * colori ufficiali delle attività), il CONTESTO (club, pubblica, su invito) si riconosce da icona, etichetta e forma, mai dal solo colore.
 * Ogni icona usata nelle card ha qui la sua etichetta e una breve spiegazione: la stessa per tutta l'app.
 */
export const eventSportStyle = (sport: SportId): ActivityStyle => styleOfSport(sport);

/** Tipi di uscita selezionabili, nell'ordine mostrato nella creazione. */
export const EVENT_SPORTS: readonly SportId[] = ['running', 'walking', 'trail', 'run_walk', 'other'];

/** Icona con significato: etichetta breve (per chi legge) e spiegazione (per chi ascolta o vuole capire). */
export interface EventIconDef {
  icon: IconName;
  label: string;
  hint: string;
}

/* ---------- visibilità ---------- */

/** Icone della visibilità: pubblica (mondo), club (persone), su invito (link). */
export const VISIBILITY_ICONS: Record<Visibility, EventIconDef & { tint: string }> = {
  public: { icon: 'earth', label: 'Pubblica', hint: 'Aperta a tutti: compare in Esplora.', tint: '#7CB6FF' },
  club: { icon: 'people', label: 'Solo club', hint: 'Riservata ai membri del club.', tint: '#9F8BFF' },
  private: { icon: 'link', label: 'Su invito', hint: 'Solo chi ha il link può vederla.', tint: '#B7A6FF' },
};

export interface EventContext {
  key: 'club' | 'public' | 'link';
  /** Etichetta breve: nome del club, "Pubblica" o "Su invito". */
  label: string;
  icon: IconName;
  /** Colore dell'icona (non sostituisce il colore dell'attività); per un club è il suo colore d'identità (clubTint). */
  tint: string;
  /** Nome del club da mostrare accanto all'icona, se l'uscita è legata a un club. */
  clubName: string | null;
  /** Colore del nome del club scritto in piccolo: stessa tinta, contrasto da testo (clubInk). */
  clubInk: string | null;
  /** Significato completo, per lo screen reader. */
  meaning: string;
}

/** Il contesto segue la visibilità reale dell'uscita; il club, se c'è, si aggiunge come nome (anche per una pubblica). */
export function eventContext(e: Pick<EventView, 'visibility' | 'club'>): EventContext {
  // Un nome vuoto conta come "nessun club": niente testo vuoto accanto all'icona, niente "club " nell'etichetta.
  const clubName = e.club?.name?.trim() || null;
  const ink = clubName ? clubInk(clubName) : null;
  if (e.visibility === 'private') {
    const v = VISIBILITY_ICONS.private;
    return { key: 'link', label: v.label, icon: v.icon, tint: v.tint, clubName, clubInk: ink, meaning: clubName ? `Su invito, club ${clubName}: solo chi ha il link può vederla` : 'Su invito: solo chi ha il link può vederla' };
  }
  if (e.visibility === 'club') {
    const v = VISIBILITY_ICONS.club;
    return { key: 'club', label: clubName ?? v.label, icon: v.icon, tint: clubName ? clubTint(clubName) : v.tint, clubName, clubInk: ink, meaning: clubName ? `Riservata ai membri del club ${clubName}` : 'Riservata ai membri del club' };
  }
  const v = VISIBILITY_ICONS.public;
  return { key: 'public', label: v.label, icon: v.icon, tint: v.tint, clubName, clubInk: ink, meaning: clubName ? `Pubblica, organizzata dal club ${clubName}` : 'Pubblica: aperta a tutti' };
}

/** Accento d'identità di un club: colore stabile ricavato dal nome (lo stesso del suo segno). */
export function clubHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
export const clubTint = (name: string) => `hsl(${clubHue(name)} 55% 62%)`;
/**
 * Stessa tinta del club, un po' più chiara: per il nome scritto in piccolo.
 * A luminosità 62% le tinte blu e viola restano sotto 4,5:1 sugli sfondi scuri (minimo 3,2:1, va bene solo per le icone);
 * al 70% ogni tinta resta ≥ 4,5:1 su bg, surface e surfaceElevated.
 */
export const clubInk = (name: string) => `hsl(${clubHue(name)} 55% 70%)`;

/* ---------- patto di corsa ---------- */

/** Simbolo del patto nel suo insieme (usato dal modulo di creazione). */
export const PACT_ICON: IconName = 'shield-checkmark';
/** Colore del patto: uno solo per tutte le modalità, che si distinguono per forma. */
export const PACT_TINT = '#4FD1A5';

/*
 * Modalità, testi, ordine e incompatibilità (self pace ↔ "nessuno resta indietro" / "ritmo inclusivo") vengono da
 * shared/pact.ts, la stessa fonte della validazione del server: qui si aggiunge solo la figura di ciascuna.
 */
const PACT_GLYPH: Record<PactMode, IconName> = {
  noDrop: 'hand-left-outline',
  inclusivePace: 'speedometer-outline',
  regroupPoints: 'flag-outline',
  takeTurns: 'repeat-outline',
  pairs: 'reorder-two-outline',
  selfPace: 'stopwatch-outline',
};

/**
 * Una figura diversa per ogni impegno: la mano alzata (il gruppo aspetta), il tachimetro (il ritmo), la bandierina (le soste),
 * le frecce che girano (si fa a turno), le due corsie affiancate (in coppia), il cronometro (ognuno il suo tempo).
 * Tutte diverse tra loro e dalle icone di visibilità (mondo, persone, link), del club e delle caratteristiche.
 * Niente simbolo internazionale dell'accessibilità per il ritmo: farebbe pensare a un'uscita accessibile in carrozzina,
 * cosa che l'organizzatore non ha dichiarato.
 */
export const PACT_ICONS: Record<PactMode, EventIconDef> = Object.fromEntries(PACT_MODES.map((m) => [m, { icon: PACT_GLYPH[m], ...PACT_TEXT[m] }])) as Record<PactMode, EventIconDef>;

/* ---------- altre caratteristiche ---------- */

export type EventFeature = 'route' | 'limitedSpots' | 'noSpotsLeft';

/**
 * Caratteristiche reali dell'uscita, mostrate solo se presenti nei dati. Per i posti una persona con il "+"
 * (quanti possono ancora unirsi), non un biglietto: farebbe pensare a un'uscita a pagamento. A posti esauriti
 * lo stesso cerchio barrato dello stato "Al completo", così "+" non contraddice il testo.
 */
export const FEATURE_ICONS: Record<EventFeature, EventIconDef> = {
  route: { icon: 'map-outline', label: 'Percorso associato', hint: 'Il tracciato è nel dettaglio dell’uscita.' },
  limitedSpots: { icon: 'person-add-outline', label: 'Posti limitati', hint: 'Il numero di partecipanti è limitato.' },
  noSpotsLeft: { icon: 'remove-circle-outline', label: 'Posti esauriti', hint: 'Non restano posti liberi.' },
};
