/**
 * Patto di corsa: modalità, testi e regole di compatibilità. UNICA fonte per server (validazione) e app (scelta e
 * visualizzazione: le icone stanno in mobile/src/constants/eventStyle.ts), così ciò che l'app permette è ciò che il server accetta.
 *
 * Le modalità nuove (a turno, in coppia, self pace) sono facoltative nei dati: assenti = "no".
 */
import type { RunPact } from './types.ts';

export type PactMode = 'noDrop' | 'inclusivePace' | 'regroupPoints' | 'takeTurns' | 'pairs' | 'selfPace';

/** Ordine stabile in cui le modalità si mostrano ovunque. */
export const PACT_MODES: readonly PactMode[] = ['noDrop', 'inclusivePace', 'regroupPoints', 'takeTurns', 'pairs', 'selfPace'];

/** Etichetta breve e spiegazione: le stesse in card, dettaglio e creazione. */
export const PACT_TEXT: Record<PactMode, { label: string; hint: string }> = {
  noDrop: { label: 'Nessuno resta indietro', hint: 'Il gruppo aspetta chi è più lento.' },
  inclusivePace: { label: 'Ritmo inclusivo', hint: 'Il passo si adatta a chi fa più fatica.' },
  regroupPoints: { label: 'Punti di ricompattamento', hint: 'Soste dove il gruppo si ritrova.' },
  takeTurns: { label: 'A turno', hint: 'Ci si alterna a guidare il gruppo.' },
  pairs: { label: 'In coppia', hint: 'Si corre a coppie di ritmo simile.' },
  selfPace: { label: 'Self pace', hint: 'Ognuno al proprio ritmo, ci si ritrova all’arrivo.' },
};

/**
 * Modalità che non si combinano: con il self pace ognuno va per conto suo, quindi né "il gruppo aspetta"
 * né "il passo si adatta" hanno senso. La relazione è simmetrica.
 */
export const PACT_CONFLICTS: Partial<Record<PactMode, readonly PactMode[]>> = {
  selfPace: ['noDrop', 'inclusivePace'],
  noDrop: ['selfPace'],
  inclusivePace: ['selfPace'],
};

/** La modalità attiva che impedisce di scegliere `m`, se c'è. */
export function pactBlocker(m: PactMode, active: readonly PactMode[]): PactMode | null {
  return (PACT_CONFLICTS[m] ?? []).find((x) => active.includes(x)) ?? null;
}

/** Modalità davvero dichiarate, nell'ordine di PACT_MODES (i punti di ricompattamento solo con un testo). */
export function pactModes(p: Partial<RunPact> | null | undefined): PactMode[] {
  if (!p) return [];
  const on: Record<PactMode, boolean> = {
    noDrop: p.noDrop === true,
    inclusivePace: p.inclusivePace === true,
    regroupPoints: typeof p.regroupPoints === 'string' && p.regroupPoints.trim().length > 0,
    takeTurns: p.takeTurns === true,
    pairs: p.pairs === true,
    selfPace: p.selfPace === true,
  };
  return PACT_MODES.filter((m) => on[m]);
}

/** true se il patto unisce modalità incompatibili. */
export function pactHasConflict(p: Partial<RunPact> | null | undefined): boolean {
  const modes = pactModes(p);
  return modes.some((m) => pactBlocker(m, modes) !== null);
}

const q = (m: PactMode) => `«${PACT_TEXT[m].label}»`;
/** Messaggio del server per la combinazione non valida. */
export const PACT_CONFLICT = `${q('selfPace')} non si combina con ${q('noDrop')} né con ${q('inclusivePace')}: con il self pace ognuno va al proprio ritmo e ci si ritrova all’arrivo.`;
