import { describe, expect, it } from 'vitest';
import { generatePlan } from '../shared/planGenerator.ts';
import type { PlanGoal, PlanLevel } from '../shared/types.ts';

/** Gli stessi piani pronti proposti dall'app: devono generare un piano valido e completo. */
const PRESETS: Array<[string, PlanGoal, PlanLevel, number[], number, number]> = [
  ['Inizia a correre', 'start_running', 'beginner', [2, 4, 6], 30, 8],
  ['5 km', 'race_5k', 'beginner', [2, 4, 6], 40, 8],
  ['10 km', 'race_10k', 'intermediate', [2, 4, 6], 60, 12],
  ['Mezza maratona', 'half_marathon', 'intermediate', [2, 4, 6, 7], 90, 12],
  ['Stare in forma', 'general_fitness', 'intermediate', [2, 4, 6], 45, 8],
];

describe('piani già pronti', () => {
  for (const [name, goal, level, weekdays, maxMinutes, weeks] of PRESETS)
    it(`${name}: piano completo entro la durata massima`, () => {
      const { sessions } = generatePlan({ name, goal, level, weekdays, maxMinutes, equipment: ['bodyweight'], preference: 'mixed', includeStrength: false, includeMobility: false, startDate: '2026-10-26', weeks });
      expect(sessions.length).toBeGreaterThanOrEqual(weeks * 2);
      expect(sessions.every((s) => s.durationMin <= maxMinutes && s.durationMin > 0)).toBe(true);
      expect(sessions[sessions.length - 1].date <= '2027-01-31').toBe(true);
    });
});
