import type { SportId, WorkoutLog } from './types.ts';
export interface OutingProposal { id: string; title: string; sport: SportId; km: number | null; pace: number | null; minutes: number | null; spots: number; pact: string; personal: boolean }
/** Bozze dichiarate: nessuna misura o capacità attribuita al runner senza dati propri. */
export function outingProposals(logs: WorkoutLog[]): OutingProposal[] {
  const proposals: OutingProposal[] = [
    { id: 'easy', title: 'Corsa in compagnia', sport: 'running', km: 5, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
    { id: 'social', title: 'Camminata sociale', sport: 'walking', km: 3, pace: null, minutes: null, spots: 8, pact: 'inclusivePace', personal: false },
    { id: 'mixed', title: 'Corsa e camminata', sport: 'run_walk', km: 4, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
    { id: 'trail', title: 'Insieme sui sentieri', sport: 'trail', km: null, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
  ];
  const own = logs.filter((l) => l.origin !== 'strava' && l.sport === 'running' && l.distanceKm != null && l.distanceKm > 0 && l.paceSecPerKm != null && l.paceSecPerKm > 0).sort((a,b) => b.startedAt.localeCompare(a.startedAt)).slice(0,5);
  if (own.length >= 3) {
    const sortedKm = own.map((l) => l.distanceKm!).sort((a,b) => a-b);
    const sortedPace = own.map((l) => l.paceSecPerKm!).sort((a,b) => a-b);
    const km = Math.round(sortedKm[Math.floor(sortedKm.length/2)] * 2) / 2;
    const pace = Math.round(sortedPace[Math.floor(sortedPace.length/2)]);
    proposals.unshift({ id: 'personal', title: 'Dalle tue corse recenti', sport: 'running', km, pace, minutes: Math.round(km * pace / 60), spots: 8, pact: 'noDrop', personal: true });
  }
  return proposals;
}
