import type { Level, SportId } from './types.ts';

export interface SportDef {
  id: SportId;
  label: string;
  /** Lo sport è selezionabile nell'MVP. */
  enabled: boolean;
  hasDistance: boolean;
  hasPace: boolean;
}

/** Aggiungere uno sport = aggiungere una riga qui (e abilitarla). */
export const SPORTS: SportDef[] = [
  { id: 'running', label: 'Corsa', enabled: true, hasDistance: true, hasPace: true },
  { id: 'walking', label: 'Camminata', enabled: true, hasDistance: true, hasPace: true },
  { id: 'cycling', label: 'Ciclismo', enabled: false, hasDistance: true, hasPace: false },
  { id: 'padel', label: 'Padel', enabled: false, hasDistance: false, hasPace: false },
  { id: 'football5', label: 'Calcetto', enabled: false, hasDistance: false, hasPace: false },
];

export const ENABLED_SPORTS = SPORTS.filter((s) => s.enabled);

export function sportDef(id: SportId): SportDef {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0];
}

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'easy', label: 'Tranquillo', hint: 'Si chiacchiera correndo' },
  { id: 'medium', label: 'Intermedio', hint: 'Ritmo costante' },
  { id: 'hard', label: 'Sostenuto', hint: 'Per chi è allenato' },
];

export function levelLabel(id: Level): string {
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}
