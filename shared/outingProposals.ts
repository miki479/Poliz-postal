import type { SportId, WorkoutLog, ClubView } from './types.ts';
export interface OutingProposal { id: string; title: string; sport: SportId; km: number | null; pace: number | null; minutes: number | null; spots: number; pact: string; personal: boolean; basis?:string[]; clubId?:string|null }
/** Bozze dichiarate: nessuna misura o capacità attribuita al runner senza dati propri. */
export function outingProposals(logs: WorkoutLog[], now = new Date(), profile: {sports?:SportId[];clubs?:ClubView[];clubId?:string|null} = {}): OutingProposal[] {
  const proposals: OutingProposal[] = [
    { id: 'easy', title: 'Corsa in compagnia', sport: 'running', km: 5, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
    { id: 'social', title: 'Camminata sociale', sport: 'walking', km: 3, pace: null, minutes: null, spots: 8, pact: 'inclusivePace', personal: false },
    { id: 'mixed', title: 'Corsa e camminata', sport: 'run_walk', km: 4, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
    { id: 'trail', title: 'Insieme sui sentieri', sport: 'trail', km: null, pace: null, minutes: null, spots: 8, pact: 'noDrop', personal: false },
  ];
  const valid=logs.filter((l)=>Date.parse(l.startedAt)<=now.getTime()&&Date.parse(l.startedAt)>=now.getTime()-60*86400000&&l.origin!=='strava'&&Number.isFinite(l.durationSec)&&l.durationSec>0&&l.distanceKm!=null&&Number.isFinite(l.distanceKm)&&l.distanceKm>0&&l.paceSecPerKm!=null&&Number.isFinite(l.paceSecPerKm)&&l.paceSecPerKm>0);
  const sportOf=(l:WorkoutLog):SportId=>l.kind==='run_walk'?'run_walk':l.trail?'trail':l.sport??'running';
  const club=profile.clubs?.find((c)=>c.id===profile.clubId);
  const preferred=club?.sport??profile.sports?.find((sport)=>valid.filter((l)=>sportOf(l)===sport).length>=3)??'running';
  const own=valid.filter((l)=>sportOf(l)===preferred).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,8);
  if(own.length>=3){
    const sortedKm=own.map((l)=>l.distanceKm!).sort((a,b)=>a-b),sortedPace=own.map((l)=>l.paceSecPerKm!).sort((a,b)=>a-b);
    const recent=valid.filter((l)=>Date.parse(l.startedAt)>=now.getTime()-7*86400000);
    const previous=valid.filter((l)=>Date.parse(l.startedAt)<now.getTime()-7*86400000&&Date.parse(l.startedAt)>=now.getTime()-35*86400000);
    const recentSec=recent.reduce((n,l)=>n+l.durationSec,0),priorWeeklySec=previous.reduce((n,l)=>n+l.durationSec,0)/4;
    // Scelta prudente di una distanza già presente nello storico, non una stima fisiologica del carico.
    const shorter=previous.length>=4&&priorWeeklySec>0&&recentSec>priorWeeklySec*1.3;
    const km=Math.round(sortedKm[Math.floor(sortedKm.length*(shorter?.25:.5))]*2)/2;
    const pace=Math.round(sortedPace[Math.floor(sortedPace.length/2)]);
    const basis=[`${own.length} attività registrate dello stesso tipo negli ultimi 60 giorni`,`${recent.length} attività registrate negli ultimi 7 giorni`,shorter?'Proposta più breve: i minuti dell’ultima settimana superano la media delle quattro precedenti':'Distanza e passo ricavati dalla mediana del tuo storico'];
    if(club)basis.push(`Tipo di attività del gruppo ${club.name}`);else if(profile.sports?.includes(preferred))basis.push('Tipo di attività indicato nel tuo profilo');
    proposals.unshift({id:'personal',title:shorter?'In compagnia, con calma':'Dalle tue attività recenti',sport:preferred,km,pace,minutes:Math.round(km*pace/60),spots:8,pact:'noDrop',personal:true,basis,clubId:club?.id??null});
  }
  return proposals;
}
