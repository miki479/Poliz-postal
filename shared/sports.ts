import type { Level, SportId } from './types.ts';

export interface SportDef {
  id: SportId;
  label: string;
  /** Lo sport è selezionabile nell'MVP. */
  enabled: boolean;
  hasDistance: boolean;
  hasPace: boolean;
  /**
   * Il passo medio è confrontabile tra attività dello stesso tipo (record di passo e tempi sui km da strada).
   * No per il trail (il dislivello lo falsa), per corsa + camminata (alterna due andature) e per "Altro".
   */
  paceComparable: boolean;
  /** Entra nei record di prestazione (distanza più lunga, traguardi di km). "Altro" no: non si sa che attività sia. */
  performance: boolean;
}

/** Aggiungere uno sport = aggiungere una riga qui (e abilitarla). */
export const SPORTS: SportDef[] = [
  { id: 'running', label: 'Corsa', enabled: true, hasDistance: true, hasPace: true, paceComparable: true, performance: true },
  { id: 'walking', label: 'Camminata', enabled: true, hasDistance: true, hasPace: true, paceComparable: true, performance: true },
  { id: 'trail', label: 'Trail', enabled: true, hasDistance: true, hasPace: true, paceComparable: false, performance: true },
  { id: 'run_walk', label: 'Corsa + camminata', enabled: true, hasDistance: true, hasPace: true, paceComparable: false, performance: true },
  { id: 'other', label: 'Altro', enabled: true, hasDistance: true, hasPace: false, paceComparable: false, performance: false },
  { id: 'cycling', label: 'Ciclismo', enabled: false, hasDistance: true, hasPace: false, paceComparable: false, performance: false },
  { id: 'padel', label: 'Padel', enabled: false, hasDistance: false, hasPace: false, paceComparable: false, performance: false },
  { id: 'football5', label: 'Calcetto', enabled: false, hasDistance: false, hasPace: false, paceComparable: false, performance: false },
];

export const ENABLED_SPORTS = SPORTS.filter((s) => s.enabled);

export function sportDef(id: SportId): SportDef {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0];
}

export const isSportId = (v: unknown): v is SportId => typeof v === 'string' && SPORTS.some((s) => s.id === v);

/**
 * Famiglia di un tipo, per riconoscere la stessa uscita arrivata da fonti diverse e per le sedute del piano:
 * trail e corsa + camminata sono corse (la stessa uscita può essere "Corsa" nell'app e "TrailRun" su Strava).
 */
export function sportFamily(id: SportId): SportId {
  return id === 'trail' || id === 'run_walk' ? 'running' : id;
}
export const isRunFamily = (id: SportId): boolean => sportFamily(id) === 'running';

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'beginner', label: 'Principiante', hint: 'Per chi inizia' },
  { id: 'easy', label: 'Tranquillo', hint: 'Si chiacchiera correndo' },
  { id: 'medium', label: 'Intermedio', hint: 'Ritmo costante' },
  { id: 'hard', label: 'Sostenuto', hint: 'Per chi è allenato' },
];

export function levelLabel(id: Level): string {
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}
