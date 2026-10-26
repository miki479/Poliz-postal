import { expect, it } from 'vitest';
import { outingProposals } from '../shared/outingProposals.ts';
import type { WorkoutLog } from '../shared/types.ts';
const proposals = (logs: WorkoutLog[]) => outingProposals(logs, new Date('2026-10-26T12:00:00Z'));
const log = (distanceKm: number, paceSecPerKm: number, origin = 'recorded') => ({ id: `${distanceKm}`, sport: 'running', origin, distanceKm, paceSecPerKm, startedAt: '2026-10-26T10:00:00Z' }) as WorkoutLog;
it('senza storico propone soltanto bozze esplicite senza passo e durata inventati', () => {
 const p = proposals([]); expect(p.every((x) => !x.personal && x.pace === null && x.minutes === null)).toBe(true);
});
it('la proposta personale richiede almeno tre registrazioni proprie e usa la mediana', () => {
 expect(proposals([log(5,300),log(6,360)])[0].personal).toBe(false);
 const p = proposals([log(5,300),log(6,360),log(18,500)])[0];
 expect(p).toMatchObject({ personal: true, km: 6, pace: 360, minutes: 36 });
});
it('non usa attività Strava o misure assenti per consigliare un’uscita', () => {
 expect(proposals([log(5,300,'strava'),log(6,360,'strava'),log(18,500,'strava')]).some((x) => x.personal)).toBe(false);
});

it('non usa attività vecchie come abitudine recente', () => {
 const old = [log(5,300),log(6,360),log(7,400)].map((l) => ({ ...l, startedAt: '2025-01-01T10:00:00Z' }));
 expect(proposals(old).some((p) => p.personal)).toBe(false);
});
