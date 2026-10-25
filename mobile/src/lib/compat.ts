import { isRunKind } from '@shared/exercises.ts';
import type { EventView, PlannedSession } from '@shared/types.ts';

/**
 * Compatibilità dichiarata tra un'uscita di gruppo e la seduta del piano nello stesso giorno.
 * Criteri espliciti: durata stimata (distanza × passo dichiarati) tra 70% e 130% della seduta,
 * livello dell'uscita coerente con l'intensità prevista. Non è una valutazione medica né di sicurezza.
 */
export function compatibility(e: EventView, s: PlannedSession): { fits: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRunKind(s.kind)) return { fits: false, reasons: ['La seduta prevista non è una corsa.'] };
  let fits = true;
  const est = e.distanceKm && e.paceSecPerKm ? Math.round((e.distanceKm * e.paceSecPerKm) / 60) : null;
  if (est !== null) {
    const r = est / s.durationMin;
    reasons.push(`Durata stimata dall’uscita: circa ${est}′ (seduta: ${s.durationMin}′)`);
    if (r < 0.7 || r > 1.3) fits = false;
  } else reasons.push('Distanza o passo dell’uscita non indicati: durata non stimabile.');
  const intense = s.kind === 'run_intervals' || s.intensity === 'high';
  if (intense && (e.level === 'easy' || e.level === 'beginner')) {
    fits = false;
    reasons.push('La seduta prevista è intensa, l’uscita ha un ritmo tranquillo.');
  } else if (!intense && (e.level === 'hard' || e.level === 'advanced')) {
    fits = false;
    reasons.push('L’uscita ha un ritmo sostenuto, la seduta prevista è facile.');
  } else reasons.push('Il livello dell’uscita è coerente con la seduta.');
  return { fits: fits && est !== null, reasons };
}
