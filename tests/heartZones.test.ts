import { expect, it } from 'vitest';
import { parseHeartZones } from '../shared/heartZones.ts';
it('accetta solo soglie reali coerenti, incluso ultimo intervallo aperto', () => {
  const heart_rate = { custom: true, zones: [{ min: 0, max: 140 }, { min: 140, max: -1 }] };
  expect(parseHeartZones({ heart_rate })).toEqual(heart_rate);
  for (const value of [null, {}, { heart_rate: { custom: false, zones: [] } }, { heart_rate: { custom: false, zones: [{ min: 150, max: 140 }] } }, { heart_rate: { custom: true, zones: [{ min: 0, max: -1 }, { min: 140, max: 180 }] } }]) expect(parseHeartZones(value)).toBeNull();
});
