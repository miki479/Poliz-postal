import { expect, it } from 'vitest';
import { chunkSpeedColors, paceColor, replayChunks } from '../shared/replayChunks.ts';
import type { TrackPoint } from '../shared/types.ts';

const pt = (i: number, t: number): TrackPoint => ({ lat: 44.2 + i * 0.0001, lng: 12.04, t });

it('il colore va dal blu (lento) al rosso (veloce)', () => {
  expect(paceColor(0)).toBe('#4fc3f7');
  expect(paceColor(1)).toBe('#ff5c6c');
  expect(paceColor(-3)).toBe('#4fc3f7');
});

it('un percorso con tempi veri cambia colore, senza tempi resta di un solo colore', () => {
  // prima metà lenta (3 s per punto), seconda veloce (1 s per punto)
  let t = 0;
  const timed: TrackPoint[] = Array.from({ length: 200 }, (_, i) => { t += i < 100 ? 3 : 1; return pt(i, t); });
  const colors = chunkSpeedColors(replayChunks(timed, 24));
  expect(colors).not.toBeNull();
  expect(new Set(colors).size).toBeGreaterThan(2);
  expect(colors![0]).not.toBe(colors![colors!.length - 1]);
  const untimed = timed.map((p) => ({ ...p, t: 0 }));
  expect(chunkSpeedColors(replayChunks(untimed, 24))).toBeNull();
});
