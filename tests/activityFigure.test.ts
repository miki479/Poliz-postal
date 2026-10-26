import { describe, expect, it } from 'vitest';
import { figureGeometry, figureMotion } from '../mobile/src/lib/activityFigure.ts';
import { paceFromFields } from '../mobile/src/lib/paceInput.ts';

const coordinates = (run: number, phase: number, intensity = 1) => {
  const g = figureGeometry(run, phase, intensity);
  return [g.head.x, g.head.y, ...[g.torso, g.shorts, g.frontArm, g.backArm, g.frontLeg, g.backLeg].flatMap((d) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))];
};
describe('figure vettoriali continue', () => {
  it('conserva proporzioni e coordinate finite dentro il reticolo per tutto il ciclo e la transizione', () => {
    for (let gait = 0; gait <= 1; gait += 0.1) for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
      const xy = coordinates(gait, phase);
      expect(xy.every((n) => Number.isFinite(n) && n >= 0 && n <= 24)).toBe(true);
    }
  });
  it('non salta al punto di chiusura del ciclo né cambiando corsa/camminata', () => {
    for (const gait of [0, 0.5, 1]) {
      const a = coordinates(gait, 0.0001); const b = coordinates(gait, Math.PI * 2 - 0.0001);
      expect(Math.max(...a.map((x, i) => Math.abs(x - b[i])))).toBeLessThan(0.01);
    }
    const a = coordinates(0.499, 1); const b = coordinates(0.501, 1);
    expect(Math.max(...a.map((x, i) => Math.abs(x - b[i])))).toBeLessThan(0.03);
    expect(figureGeometry(1, 0).frontLeg).not.toBe(figureGeometry(1, 0.2).frontLeg);
    expect(figureGeometry(1, 0.2).frontLeg).not.toBe(figureGeometry(1, 0.4).frontLeg);
  });
  it('ritmo più veloce e livello più alto rendono il movimento più frequente', () => {
    expect(figureMotion('run', 300).stepsPerSecond).toBeGreaterThan(figureMotion('run', 500).stepsPerSecond);
    expect(figureMotion('walk', 500).stepsPerSecond).toBeGreaterThan(figureMotion('walk', 800).stepsPerSecond);
    expect(figureMotion('run', null, 4).stepsPerSecond).toBeGreaterThan(figureMotion('run', null, 0).stepsPerSecond);
    expect(figureMotion('walk', null, 2).stepsPerSecond).toBeLessThan(figureMotion('run', null, 2).stepsPerSecond);
    expect(coordinates(NaN, Infinity).every(Number.isFinite)).toBe(true);
  });
});
describe('inserimento esplicito del ritmo', () => {
  it('conserva secondi esatti e richiede entrambi i campi entro i limiti', () => {
    expect(paceFromFields('5', '30')).toBe(330);
    expect(paceFromFields('5', '32')).toBe(332);
    expect(paceFromFields('2', '00')).toBe(120);
    expect(paceFromFields('15', '00')).toBe(900);
    for (const [m, s] of [['', '30'], ['5', ''], ['5', '60'], ['1', '59'], ['15', '01'], ['abc', '1'], ['5.5', '00']]) expect(paceFromFields(m, s)).toBeNull();
  });
});
