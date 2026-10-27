import { expect,it } from 'vitest';
import { replayChunks,replayChunkPoints,replayEndpoints,nextReplayValue } from '../shared/replayChunks.ts';
import { replayTimeline,replayPosition } from '../shared/replay.ts';
const route=Array.from({length:1000},(_,i)=>({lat:44+i*.00001,lng:12,t:i}));
it('divide il tracciato senza perdere punti e aggiorna una punta di massimo 65 campioni',()=>{
 const timeline=replayTimeline(route), chunks=replayChunks(route);
 expect(chunks.flatMap((c,i)=>i?c.points.slice(1):c.points)).toEqual(route);
 for(const at of [0,10.5,64.5,501.2,999]){
  const visible=chunks.map(c=>replayChunkPoints(c,timeline,at));
  if(!at){expect(visible.flat()).toEqual([]);continue;}
  expect(visible.flat().at(-1)).toEqual(replayPosition(timeline,at)!.point);
  expect(visible.filter(p=>p.length&&p.at(-1)!.t===at).at(-1)!.length).toBeLessThanOrEqual(65);
 }
});
it('le interruzioni non entrano mai nello stesso blocco',()=>{
 const points=route.map((p,i)=>({...p,...(i===400?{breakBefore:true}:{})}));
 for(const c of replayChunks(points))expect(c.points.slice(1).some(p=>p.breakBefore)).toBe(false);
});
it('su un giro chiuso partenza e arrivo non si coprono e si attivano in ordine',()=>{
 const closed=[...route,route[0]];
 expect(replayEndpoints(closed,false,false)).toMatchObject({start:true,finish:false,close:true});
 expect(replayEndpoints(closed,true,false)).toMatchObject({start:false,finish:true});
 expect(replayEndpoints(closed,false,true)).toMatchObject({start:false,finish:true});
 expect(replayEndpoints(route,true,false)).toMatchObject({start:true,finish:true,close:false});
});
it('segue i frame senza saltare avanti dopo uno stallo del thread',()=>{
 expect(nextReplayValue(10,16,1,100)).toBeCloseTo(10.016);
 expect(nextReplayValue(10,1000,1,100)).toBeCloseTo(10.05);
 expect(nextReplayValue(99,100,100,100)).toBe(100);
});
