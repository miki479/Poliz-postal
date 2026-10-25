import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeFromNow } from '../shared/relativeTime.ts';
const now = new Date('2026-10-25T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
afterEach(() => vi.unstubAllGlobals());
describe('date relative senza Intl', () => {
  it('funziona anche se l’intero namespace Intl non è disponibile', () => {
    vi.stubGlobal('Intl', undefined);
    expect(relativeFromNow(ago(2), now)).toBe('2 min fa');
    expect(relativeFromNow(ago(60), now)).toBe('1 h fa');
    expect(relativeFromNow(ago(1440), now)).toBe('ieri');
    expect(relativeFromNow(ago(4320), now)).toBe('3 giorni fa');
  });
  it('gestisce presente, futuro e date mancanti senza eccezioni o NaN', () => {
    expect(relativeFromNow(ago(0), now)).toBe('adesso');
    expect(relativeFromNow(ago(-2), now)).toBe('tra 2 min');
    expect(relativeFromNow(ago(-1440), now)).toBe('domani');
    expect(relativeFromNow(ago(-4320), now)).toBe('tra 3 giorni');
    expect(relativeFromNow('', now)).toBe('');
    expect(relativeFromNow('data non valida', now)).toBe('');
  });
});
