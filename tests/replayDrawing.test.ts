import { expect, it } from 'vitest';
import { replayDrawing } from '../shared/replayDrawing.ts';
import { replayTimeline } from '../shared/replay.ts';
const points = [{lat:44,lng:12,t:0},{lat:44.001,lng:12,t:10},{lat:44.002,lng:12,t:20}];
it('inizia senza linea e disegna soltanto fino alla posizione animata', () => {
 const timeline=replayTimeline(points);
 expect(replayDrawing(timeline,0)).toEqual([]);
 const half=replayDrawing(timeline,5).flat();
 expect(half).toHaveLength(2);expect(half.at(-1)!.lat).toBeCloseTo(44.0005);
 expect(half.some(p=>p.lat===44.002)).toBe(false);
 expect(replayDrawing(timeline,20).flat()).toEqual(points);
});
it('non crea rette nelle lacune GPS, anche durante il disegno',()=>{
 const timeline=replayTimeline([...points,{lat:45,lng:13,t:40,breakBefore:true},{lat:45.001,lng:13,t:50}]);
 expect(replayDrawing(timeline,30)).toHaveLength(1);
 const segments=replayDrawing(timeline,45);expect(segments).toHaveLength(2);
 expect(segments[0].at(-1)!.lat).toBe(44.002);expect(segments[1][0].lat).toBe(45);
});
it('con Riduci movimento mostra il percorso statico senza nasconderlo',()=>{
 expect(replayDrawing(replayTimeline(points),0,true).flat()).toEqual(points);
});
