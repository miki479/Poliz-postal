import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

import { EVENT_SPORTS } from '../mobile/src/constants/eventStyle.ts';

const source = readFileSync('mobile/src/components/event/TypePicker.tsx', 'utf8');

it('il selettore del tipo è un carosello orizzontale con tutti e cinque gli sport', () => {
  expect([...EVENT_SPORTS]).toEqual(['running', 'walking', 'trail', 'run_walk', 'other']);
  // scorrimento orizzontale con aggancio: lo sport scelto sta al centro, gli altri più piccoli e sbiaditi
  expect(source).toContain('snapToInterval={ITEM_W}');
  expect(source).toContain('horizontal');
  expect(source).toMatch(/opacity: 1 - d \* 0\.62/);
  expect(source).toMatch(/scale: 1\.12 - d \* 0\.42/);
  // ogni sport è un elemento radio con nome accessibile, senza riquadri pieni dietro la figura
  expect(source).toContain('accessibilityRole="radio"');
  expect(source).not.toMatch(/CarouselItem[\s\S]*LinearGradient[\s\S]*StyleSheet\.absoluteFill[\s\S]*function TypeCards/);
});

it('la scelta cambia solo a fine scorrimento o con un tocco', () => {
  expect(source).toContain('onMomentumEnd');
  expect(source).toContain('onPress={() => choose(i)}');
});
