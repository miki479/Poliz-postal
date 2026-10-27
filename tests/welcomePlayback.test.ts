import { expect, it } from 'vitest';
import { canPlayWelcome } from '../mobile/src/lib/welcomePlayback.ts';
const normal = { active: true, reducedMotion: false, screenReader: false, paused: false };
it('consente le slide automatiche normalmente e le ferma in background o dopo pausa manuale', () => {
  expect(canPlayWelcome(normal)).toBe(true);
  expect(canPlayWelcome({ ...normal, active: false })).toBe(false);
  expect(canPlayWelcome({ ...normal, paused: true })).toBe(false);
});
it('non avanza automaticamente con lettore di schermo o Riduci movimento', () => {
  expect(canPlayWelcome({ ...normal, screenReader: true })).toBe(false);
  expect(canPlayWelcome({ ...normal, reducedMotion: true })).toBe(false);
});
