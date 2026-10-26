import { expect,it } from 'vitest';
import { displayTrack } from '../shared/routeDisplay.ts';
import type { TrackPoint } from '../shared/types.ts';
it('non scambia latitudine e longitudine e non modifica i campioni originali',()=>{
 const raw=[{lat:44.2,lng:12.1,t:0},{lat:44.2001,lng:12.1001,t:5}];const before=JSON.stringify(raw);
 expect(displayTrack(raw).points).toEqual(raw);expect(JSON.stringify(raw)).toBe(before);
});
it('interrompe il disegno dopo campioni impossibili e non ricuce il segnale assente',()=>{
 const raw:TrackPoint[]=[{lat:44.2,lng:12.1,t:0},{lat:44.2001,lng:12.1001,t:5},{lat:49,lng:16,t:6},{lat:44.2002,lng:12.1002,t:10},{lat:44.2003,lng:12.1003,t:15}];
 const r=displayTrack(raw);expect(r.filtered).toBe(true);expect(r.segments).toHaveLength(2);expect(r.points).toHaveLength(4);expect(r.points[2].breakBefore).toBe(true);
});
it('esclude punti invalidi o fuori ordine senza ordinare artificialmente il tragitto',()=>{
 const raw=[{lat:44,lng:12,t:0},{lat:44.0001,lng:12,t:10},{lat:44,lng:12,t:5},{lat:NaN,lng:12,t:12},{lat:44.0002,lng:12,t:15},{lat:44.0003,lng:12,t:20}];
 const r=displayTrack(raw);expect(r.points.map(p=>p.t)).toEqual([0,10,15,20]);expect(r.segments).toHaveLength(2);
});
it('mantiene segmenti espliciti e non inventa velocità per tracce importate senza tempi',()=>{
 const r=displayTrack([{lat:44,lng:12,t:0},{lat:44.1,lng:12,t:0},{lat:45,lng:13,t:0,breakBefore:true},{lat:45.1,lng:13,t:0}]);
 expect(r.points).toHaveLength(4);expect(r.segments).toHaveLength(2);expect(r.filtered).toBe(false);
});
it('non scambia un campionamento lento regolare per un’interruzione GPS',()=>{
 const r=displayTrack([{lat:44,lng:12,t:0},{lat:44.001,lng:12,t:60},{lat:44.002,lng:12,t:120},{lat:44.003,lng:12,t:180}]);
 expect(r.segments).toHaveLength(1);expect(r.points.some(p=>p.breakBefore)).toBe(false);
});
