import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
const node=(type:unknown,props:any)=>({type,props});
function all(tree:any):any[]{return !tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(all):[tree,...all(tree.props?.children)];}
function frame(extra:Record<string,unknown>={}){
 const props={map:node('Heatmap',{}),summary:'Corsa',subtitle:'Da solo · Opzioni',onOptions:vi.fn(),onClose:vi.fn(),onStart:vi.fn(),starting:false,disabled:false,insets:{top:44,bottom:34},...extra};
 const imports:Record<string,unknown>={
  'react/jsx-runtime':{jsx:node,jsxs:node},'react-native':{View:'View',Pressable:'Pressable',Text:'Text'},'@expo/vector-icons':{Ionicons:'Icon'},
  '@/components/ui':{IconButton:'IconButton',Row:'Row',t:{}},'@/constants/theme':{color:{},GUTTER:20,R:{},S:{xs:4,sm:8,md:12,lg:16},type:{caption:{}}}};
 const exports:Record<string,any>={};
 new Function('require','exports',ts.transpileModule(readFileSync('mobile/src/components/RecordingSetupFrame.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)((n:string)=>imports[n]??{},exports);
 return {tree:exports.RecordingSetupFrame(props),props};
}
it('preparazione senza ScrollView: mappa flessibile sopra card e Avvia, footer con safe area',()=>{
 const {tree}=frame();const nodes=all(tree);
 expect(nodes.some(n=>n.type==='ScrollView')).toBe(false);
 const [header,map,footer]=tree.props.children;
 expect(header).toBeTruthy();expect(map.props.style).toMatchObject({flex:1,minHeight:0});
 expect(map.props.children.type).toBe('Heatmap');
 expect(footer.props.style).toMatchObject({flexShrink:0,paddingBottom:42});
 expect(footer.props.style.position).toBeUndefined();
 const options=nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel.startsWith('Apri opzioni'));
 const start=nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Avvia la registrazione');
 expect(nodes.indexOf(options)).toBeLessThan(nodes.indexOf(start));
});
it('la card apre le opzioni e Avvia mantiene un’azione separata',()=>{
 const {tree,props}=frame();const nodes=all(tree);
 nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityHint)?.props.onPress();
 expect(props.onOptions).toHaveBeenCalledOnce();expect(props.onStart).not.toHaveBeenCalled();
 nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Avvia la registrazione').props.onPress();
 expect(props.onStart).toHaveBeenCalledOnce();
});
it('mantiene etichette accessibili per recupero e preparazione in corso',()=>{
 const resumed=all(frame({resume:true}).tree).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Recupera l’attività salvata');
 expect(resumed).toBeTruthy();
 const busy=all(frame({starting:true,disabled:true}).tree).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Preparo la registrazione');
 expect(busy.props.disabled).toBe(true);expect(busy.props.accessibilityState.busy).toBe(true);
});
it('la selezione attrezzatura controllata sopravvive al montaggio del pannello',()=>{
 const effects:Array<()=>void>=[];const onGearChange=vi.fn();const exports:Record<string,any>={};
 const imports:Record<string,unknown>={
 'react/jsx-runtime':{jsx:node,jsxs:node},react:{useState:(v:unknown)=>[v,vi.fn()],useEffect:(f:()=>void)=>effects.push(f)},
 'react-native':{View:'View',Text:'Text'},'@/components/ui':{useLoad:()=>({data:[{id:'gear1',name:'Scarpe'}]}),Pills:'Pills',Button:'Button',Skeleton:'Skeleton',t:{}},
 '@/constants/theme':{S:{},color:{},type:{}},'@/lib/api':{call:vi.fn().mockResolvedValue({})}};
 new Function('require','exports',ts.transpileModule(readFileSync('mobile/src/components/RecordingDiscovery.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)((n:string)=>imports[n]??{},exports);
 const tree=exports.WorkoutSuggestions({selectedGear:'gear1',onGearChange,onChoose:vi.fn()});
 effects.forEach(f=>f());
 expect(all(tree).find(n=>n.type==='Pills').props.value).toBe('gear1');
 expect(onGearChange).toHaveBeenCalledWith('gear1');expect(onGearChange).not.toHaveBeenCalledWith(null);
});
