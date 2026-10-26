import { isRunKind } from '@shared/exercises.ts';
import type { EventView, PlannedSession } from '@shared/types.ts';

/**
 * Compatibilità dichiarata tra un'uscita di gruppo e l’allenamento del piano nello stesso giorno.
 * Criteri espliciti: durata stimata (distanza × passo dichiarati) tra 70% e 130% dell’allenamento,
 * livello dell'uscita coerente con l'intensità prevista. Non è una valutazione medica né di sicurezza.
 */
export function compatibility(e: EventView, s: PlannedSession): { fits: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRunKind(s.kind)) return { fits: false, reasons: ['L’allenamento previsto non è una corsa.'] };
  let fits = true;
  const est = e.distanceKm && e.paceSecPerKm ? Math.round((e.distanceKm * e.paceSecPerKm) / 60) : null;
  if (est !== null) {
    const r = est / s.durationMin;
    reasons.push(`Durata stimata dall’uscita: circa ${est}′ (allenamento: ${s.durationMin}′)`);
    if (r < 0.7 || r > 1.3) fits = false;
  } else reasons.push('Distanza o passo dell’uscita non indicati: durata non stimabile.');
  const intense = s.kind === 'run_intervals' || s.intensity === 'high';
  if (intense && (e.level === 'easy' || e.level === 'beginner')) {
    fits = false;
    reasons.push('L’allenamento previsto è intenso, l’uscita ha un ritmo tranquillo.');
  } else if (!intense && (e.level === 'hard' || e.level === 'advanced')) {
    fits = false;
    reasons.push('L’uscita ha un ritmo sostenuto, l’allenamento previsto è facile.');
  } else reasons.push('Il livello dell’uscita è coerente con l’allenamento.');
  return { fits: fits && est !== null, reasons };
}
