import { expect, it } from 'vitest';
import { formatPace } from '../shared/time.ts';
import { styleOfLog } from '../mobile/src/lib/storyPalette.ts';
import type { WorkoutLog } from '../shared/types.ts';
it('il passo arrotonda i secondi senza arrivare a 60', () => {
 expect(formatPace(359.7)).toBe('6:00/km');
 expect(formatPace(489)).toBe('8:09/km');
});
it('il tipo esplicito combinato non viene sostituito dal tipo della seduta', () => {
 expect(styleOfLog({ sport: 'running', kind: 'run_easy', title: 'Camminata/corsa' } as WorkoutLog).glyph).toBe('run_walk');
 expect(styleOfLog({ sport: 'running', trail: true, kind: 'run_easy', title: 'Titolo' } as WorkoutLog).glyph).toBe('trail');
});
