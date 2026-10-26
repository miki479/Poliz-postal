import { describe, expect, it } from 'vitest';
import { beginnerRun, guidedRunById, guidedStep, BEGINNER_SOURCE } from '../shared/beginnerRunning.ts';
describe('sedute pubbliche NHS Couch to 5K', () => {
  it('contiene 27 sedute con riscaldamento e defaticamento reali', () => {
    const totals = [
      [1710, 1710, 1710],
      [1740, 1740, 1740],
      [1500, 1500, 1500],
      [1890, 1890, 1890],
      [1860, 1860, 1800],
      [2040, 1980, 2100],
      [2100, 2100, 2100],
      [2280, 2280, 2280],
      [2400, 2400, 2400],
    ];
    for (let w = 1; w <= 9; w++)
      for (let r = 1; r <= 3; r++) {
        const s = beginnerRun(w, r);
        expect(s.durationSec).toBe(totals[w - 1][r - 1]);
        expect(s.segments[0].durationSec).toBe(300);
        expect(s.segments.at(-1)?.durationSec).toBe(300);
        expect(s.segments.every((b) => b.durationSec > 0 && b.reps === 1)).toBe(true);
      }
    expect(BEGINNER_SOURCE.url).toContain('nhs.uk');
  });
  it('parte con un minuto di corsa e arriva a 30 minuti senza inventare distanze', () => {
    const first = beginnerRun(1, 1);
    expect(first.segments[1]).toMatchObject({ kind: 'run', durationSec: 60 });
    expect(first.segments[2]).toMatchObject({ kind: 'walk', durationSec: 90 });
    expect(beginnerRun(9, 3).segments[1]).toMatchObject({ kind: 'run', durationSec: 1800 });
    expect(first).not.toHaveProperty('distanceKm');
  });
  it('il timer cambia fase sul confine e non dichiara finito prima del termine', () => {
    const s = beginnerRun(1, 1);
    expect(guidedStep(s.segments, 299).segment?.kind).toBe('warmup');
    expect(guidedStep(s.segments, 300)).toMatchObject({ segment: { kind: 'run' }, remainingSec: 60 });
    expect(guidedStep(s.segments, 360).segment?.kind).toBe('walk');
    expect(guidedStep(s.segments, 1709).done).toBe(false);
    expect(guidedStep(s.segments, 1710).done).toBe(true);
  });
  it('legge solo identificativi validi ed espande corsa/camminata alternate', () => {
    for (const id of ['nhs-c25k-0-1', 'nhs-c25k-10-1', 'nhs-c25k-1-4', 'qualunque', null]) expect(guidedRunById(id)).toBeNull();
    const steps = [
      { kind: 'run' as const, label: 'Corsa', durationSec: 60, reps: 2 },
      { kind: 'walk' as const, label: 'Cammina', durationSec: 90, reps: 2 },
    ];
    expect(guidedStep(steps, 60).segment?.kind).toBe('walk');
    expect(guidedStep(steps, 150).segment?.kind).toBe('run');
  });
});
