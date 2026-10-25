import { describe, expect, it } from 'vitest';
import { ACTIVITY_STYLES, activityTypeOf, gradientFor, resolveState, styleOfKind, styleOfSport } from '../mobile/src/constants/activityColors.ts';
import type { SessionKind } from '../shared/types.ts';

const ALL_KINDS: SessionKind[] = ['run_easy', 'run_continuous', 'run_intervals', 'run_progressive', 'run_long', 'run_free', 'run_walk', 'aerobic', 'strength', 'rest', 'recovery_active', 'mobility'];

describe('colori delle attività', () => {
  it('ogni tipo di sessione ha un colore e i colori ufficiali sono tutti distinti', () => {
    for (const k of ALL_KINDS) expect(styleOfKind(k).solid).toMatch(/^#[0-9A-F]{6}$/i);
    const solids = Object.values(ACTIVITY_STYLES).filter((s) => !s.blend).map((s) => s.solid);
    expect(new Set(solids).size).toBe(solids.length);
  });

  it('corsa e camminata combinate sono la fusione dei due colori ufficiali, senza un terzo colore', () => {
    const rw = styleOfKind('run_walk');
    expect(rw.blend).toEqual([ACTIVITY_STYLES.run.solid, ACTIVITY_STYLES.walk.solid]);
    expect(gradientFor([rw])).toEqual([ACTIVITY_STYLES.run.solid, ACTIVITY_STYLES.walk.solid]);
  });

  it('più attività nello stesso giorno: la corsa resta turchese e la camminata ambra', () => {
    const day = [styleOfSport('running'), styleOfSport('walking')];
    expect(day[0].solid).toBe(ACTIVITY_STYLES.run.solid);
    expect(day[1].solid).toBe(ACTIVITY_STYLES.walk.solid);
    expect(gradientFor(day)).toEqual([ACTIVITY_STYLES.run.solid, ACTIVITY_STYLES.walk.solid]);
  });

  it('il fartlek è una corsa con variazioni di ritmo e ha un colore proprio', () => {
    expect(activityTypeOf('run_intervals', 'Fartlek 6 × 1 min')).toBe('fartlek');
    expect(activityTypeOf('run_intervals', 'Ripetute 6 × 2 min')).toBe('intervals');
  });

  it('pausa, infortunio e riposo sono stati del piano distinti; un check-in normale non li sovrascrive', () => {
    expect(ACTIVITY_STYLES.paused.solid).not.toBe(ACTIVITY_STYLES.rest.solid);
    expect(ACTIVITY_STYLES.injury.solid).not.toBe(ACTIVITY_STYLES.paused.solid);
    expect(resolveState(['activity', 'paused'])).toBe('paused');
    expect(resolveState(['activity', 'paused', 'injury'])).toBe('injury');
    expect(resolveState(['activity'])).toBe('activity');
    expect(resolveState([])).toBe('rest');
  });
});
