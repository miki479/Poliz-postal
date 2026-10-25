import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
const node=(type:unknown,props:any)=>({type,props});
it('mantiene il replay esistente e mostra segmenti separati solo per tracce interrotte',()=>{
 const fitToCoordinates=vi.fn();const ref={current:{fitToCoordinates}};
 const segments=(track:any[])=>{const out:any[][]=[];for(const p of track){if(!out.length||p.breakBefore)out.push([]);out.at(-1)!.push(p);}return out;};
 const imports:Record<string,unknown>={
  'react/jsx-runtime':{jsx:node,jsxs:node},react:{useRef:()=>ref},'react-native':{Platform:{OS:'ios'},Text:'Text',View:'View'},
  'react-native-maps':{default:'MapView',Polyline:'Polyline'},'./RouteReplay':{RouteReplay:'ExistingReplay'},
  '@/constants/theme':{color:{},S:{},type:{caption:{}}},'@shared/track.ts':{trackSegments:segments}
 };
 const exports:Record<string,any>={};const code=ts.transpileModule(readFileSync('mobile/src/components/ActivityRouteReplay.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)((n:string)=>imports[n]??{},exports);
 const track=[{lat:45,lng:9,t:0},{lat:45.001,lng:9,t:10},{lat:46,lng:9,t:11},{lat:46.001,lng:9,t:20}];
 expect(exports.ActivityRouteReplay({track}).type).toBe('ExistingReplay');
 const broken=track.map((p,i)=>({...p,...(i===2?{breakBefore:true}:{})}));
 const fallback=exports.ActivityRouteReplay({track:broken});const view=fallback.type(fallback.props);const map=view.props.children[0];
 expect(map.props.children).toHaveLength(2);
 expect(map.props.children.map((p:any)=>p.props.coordinates)).toEqual([[{latitude:45,longitude:9},{latitude:45.001,longitude:9}],[{latitude:46,longitude:9},{latitude:46.001,longitude:9}]]);
 map.props.onMapReady();expect(fitToCoordinates).toHaveBeenCalledTimes(1);
});
