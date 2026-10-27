import type { EquipmentId, MuscleGroup, PlannedExercise, SessionKind } from './types.ts';

export interface ExerciseDef {
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentId;
  /** Difficoltà relativa: 1 base, 3 più impegnativa. */
  tier: 1 | 2 | 3;
}

/** Libreria essenziale e generale di esercizi. Il carico lo sceglie sempre l'utente. */
export const EXERCISES: ExerciseDef[] = [
  { name: 'Squat a corpo libero', muscle: 'legs', equipment: 'bodyweight', tier: 1 },
  { name: 'Affondi alternati', muscle: 'legs', equipment: 'bodyweight', tier: 1 },
  { name: 'Step-up su gradino', muscle: 'legs', equipment: 'bodyweight', tier: 2 },
  { name: 'Squat con manubrio (goblet)', muscle: 'legs', equipment: 'dumbbells', tier: 2 },
  { name: 'Affondi con manubri', muscle: 'legs', equipment: 'dumbbells', tier: 2 },
  { name: 'Squat con bilanciere', muscle: 'legs', equipment: 'barbell', tier: 3 },
  { name: 'Leg press', muscle: 'legs', equipment: 'machines', tier: 2 },
  { name: 'Ponte glutei', muscle: 'glutes', equipment: 'bodyweight', tier: 1 },
  { name: 'Ponte glutei con elastico', muscle: 'glutes', equipment: 'bands', tier: 1 },
  { name: 'Hip thrust con manubrio', muscle: 'glutes', equipment: 'dumbbells', tier: 2 },
  { name: 'Stacco rumeno con manubri', muscle: 'glutes', equipment: 'dumbbells', tier: 2 },
  { name: 'Stacco rumeno con bilanciere', muscle: 'glutes', equipment: 'barbell', tier: 3 },
  { name: 'Kettlebell swing', muscle: 'glutes', equipment: 'kettlebell', tier: 3 },
  { name: 'Plank', muscle: 'core', equipment: 'bodyweight', tier: 1 },
  { name: 'Side plank', muscle: 'core', equipment: 'bodyweight', tier: 2 },
  { name: 'Dead bug', muscle: 'core', equipment: 'bodyweight', tier: 1 },
  { name: 'Bird dog', muscle: 'core', equipment: 'bodyweight', tier: 1 },
  { name: 'Superman', muscle: 'back', equipment: 'bodyweight', tier: 1 },
  { name: 'Rematore con manubrio', muscle: 'back', equipment: 'dumbbells', tier: 2 },
  { name: 'Rematore con elastico', muscle: 'back', equipment: 'bands', tier: 1 },
  { name: 'Lat machine', muscle: 'back', equipment: 'machines', tier: 2 },
  { name: 'Flessioni (anche sulle ginocchia)', muscle: 'upper', equipment: 'bodyweight', tier: 1 },
  { name: 'Distensioni con manubri', muscle: 'upper', equipment: 'dumbbells', tier: 2 },
  { name: 'Panca piana con bilanciere', muscle: 'upper', equipment: 'barbell', tier: 3 },
  { name: 'Pulley / chest press', muscle: 'upper', equipment: 'machines', tier: 2 },
  { name: 'Calf raise (polpacci)', muscle: 'legs', equipment: 'bodyweight', tier: 1 },
];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = { legs: 'Gambe', glutes: 'Glutei', core: 'Core', back: 'Schiena', upper: 'Parte superiore', full: 'Corpo intero' };
export const EQUIPMENT_LABEL: Record<EquipmentId, string> = { bodyweight: 'Corpo libero', dumbbells: 'Manubri', barbell: 'Bilanciere', machines: 'Macchine', bands: 'Elastici', kettlebell: 'Kettlebell' };

export const KIND_LABEL: Record<SessionKind, string> = {
  run_easy: 'Corsa facile',
  run_continuous: 'Corsa continua',
  run_intervals: 'Intervalli e ripetute',
  run_progressive: 'Progressivo',
  run_long: 'Lungo',
  run_free: 'Corsa libera / test',
  run_walk: 'Corsa e camminata',
  aerobic: 'Resistenza aerobica',
  strength: 'Forza',
  rest: 'Riposo',
  recovery_active: 'Recupero attivo',
  mobility: 'Mobilità e stretching',
};

export type KindGroup = 'run' | 'walk' | 'strength' | 'recovery' | 'aerobic';
export function kindGroup(k: SessionKind): KindGroup {
  if (k === 'run_walk') return 'walk';
  if (k === 'strength') return 'strength';
  if (k === 'aerobic') return 'aerobic';
  if (k === 'rest' || k === 'recovery_active' || k === 'mobility') return 'recovery';
  return 'run';
}
export const isRunKind = (k: SessionKind) => k.startsWith('run_');

/** Sceglie esercizi dalla libreria in base all'attrezzatura disponibile (sempre disponibile: corpo libero). */
export function pickExercises(equipment: EquipmentId[], level: 'beginner' | 'intermediate' | 'advanced', count: number, seed = 0): PlannedExercise[] {
  const eq = new Set<EquipmentId>(['bodyweight', ...equipment]);
  const maxTier = level === 'beginner' ? 1 : level === 'intermediate' ? 2 : 3;
  const groups: MuscleGroup[] = ['legs', 'glutes', 'core', 'back', 'upper', 'legs'];
  const used = new Set<string>();
  const out: PlannedExercise[] = [];
  for (let i = 0; i < count; i++) {
    const g = groups[i % groups.length];
    const pool = EXERCISES.filter((e) => e.muscle === g && eq.has(e.equipment) && e.tier <= maxTier && !used.has(e.name));
    const preferred = pool.filter((e) => e.equipment !== 'bodyweight');
    const list = preferred.length && level !== 'beginner' ? preferred : pool;
    if (!list.length) continue;
    const ex = list[(seed + i) % list.length];
    used.add(ex.name);
    const isHold = /plank|dead bug|bird/i.test(ex.name);
    out.push({ name: ex.name, muscle: ex.muscle, equipment: ex.equipment, sets: level === 'beginner' ? 2 : 3, reps: isHold ? 30 : level === 'advanced' ? 8 : 10, loadKg: null, restSec: level === 'beginner' ? 60 : 90 });
  }
  return out;
}
