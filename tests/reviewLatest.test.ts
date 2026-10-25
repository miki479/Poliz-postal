import { expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { emptyDb, DEFAULT_PRIVACY, type Ctx } from '../shared/engine.ts';
import { hasMapConsent } from '../shared/mapConsent.ts';
import { mapInsights, setMapVisibility } from '../shared/mapInsights.ts';
import { nearbyHeatmap } from '../shared/heatmap.ts';
import { trackIssue } from '../shared/performances.ts';
import { trackDistanceKm, splits } from '../shared/track.ts';
import { analyzeWorkout } from '../shared/brief.ts';
import type { TrackPoint, WorkoutLog } from '../shared/types.ts';

const now = new Date('2026-10-25T12:00:00Z');
function setup() {
 const db = emptyDb();
 for (const id of ['a','b','c']) {
  db.users[id] = { id, username:id, displayName:id, avatar:null, profileCompleted:true, bio:'', hue:1, sports:['running'], area:'', privacy:{...DEFAULT_PRIVACY}, createdAt:now.toISOString() };
  db.workoutLogs[id] = { id, userId:id, plannedSessionId:null, kind:'run_free', title:'Corsa', startedAt:now.toISOString(), durationSec:600, distanceKm:1, paceSecPerKm:600, rpe:null, difficulties:'', notes:'', sets:[], mode:'timer', activityId:null, shared:false, heatmapConsent:true, origin:'app', environment:'outdoor', track:[{lat:45,lng:9,t:0},{lat:45.005,lng:9,t:300},{lat:45.01,lng:9,t:600}], createdAt:now.toISOString(),updatedAt:now.toISOString() };
 }
 return {db, ctx:{db,actorId:'c',now} satisfies Ctx};
}

it('revoca e riattivazione valgono per entrambi i nomi del consenso e per entrambe le mappe', () => {
 const {db,ctx}=setup();
 expect(mapInsights(ctx).heat).toHaveLength(1); expect(nearbyHeatmap(ctx,{lat:45.005,lng:9})).toHaveLength(1);
 setMapVisibility(ctx,'c',false);
 expect(db.workoutLogs.c).toMatchObject({mapShared:false,heatmapConsent:false});
 expect(mapInsights(ctx).heat).toEqual([]); expect(nearbyHeatmap(ctx,{lat:45.005,lng:9})).toEqual([]);
 call(ctx,'updateWorkoutLog',['c',{heatmapConsent:true}]);
 expect(hasMapConsent(db.workoutLogs.c)).toBe(true);
 call(ctx,'updateWorkoutLog',['c',{title:'Titolo corretto'}]);
 expect(hasMapConsent(db.workoutLogs.c)).toBe(true);
 call(ctx,'updateWorkoutLog',['c',{heatmapConsent:false}]);
 expect(db.workoutLogs.c.mapShared).toBe(false);
 expect(mapInsights(ctx).heat).toEqual([]); expect(nearbyHeatmap(ctx,{lat:45.005,lng:9})).toEqual([]);
});

it('il consenso di un import o una revoca esplicita non diventano un contributo legacy', () => {
 const {db}=setup(); const log=db.workoutLogs.c;
 log.mapShared=false; log.heatmapConsent=true;
 expect(hasMapConsent(log)).toBe(false);
 for(const origin of ['file','strava'] as const) {
  log.origin=origin; log.mapShared=true;
  expect(hasMapConsent(log)).toBe(false);
 }
});

it('la mappa principale esclude anche le celle di partenza e arrivo', () => {
 const {ctx}=setup(); const cells=mapInsights(ctx).heat;
 expect(cells).toHaveLength(1); expect(cells.every(c=>c.lat>45.003&&c.lat<45.007)).toBe(true);
});

it('una pausa non inventa distanza, frazioni chilometriche o record attraverso il vuoto', () => {
 const track:TrackPoint[]=[{lat:45,lng:9,t:0},{lat:45.001,lng:9,t:10},{lat:46,lng:9,t:11,breakBefore:true},{lat:46.001,lng:9,t:20}];
 expect(trackDistanceKm(track)).toBeLessThan(0.23);
 expect(splits(track)).toEqual([]);
 const {db}=setup(); const log:WorkoutLog={...db.workoutLogs.c,track};
 expect(trackIssue(log)).toBe('traccia con interruzioni');
 expect(analyzeWorkout(db,{...log,origin:'file'}).evidence).toBe('imported');
});
