import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { mergeDatePart } from '../mobile/src/lib/dateParts.ts';
import * as theme from '../mobile/src/constants/theme.ts';
type Node={type:unknown;props:Record<string,any>};
const node=(type:unknown,props:any):Node=>({type,props});
function moduleOf(path:string,imports:Record<string,unknown>){
 const exports:Record<string,any>={};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)((name:string)=>imports[name]??{},exports);return exports;
}
const all=(tree:any):Node[]=>tree?.props?[tree,...[tree.props.children].flat(Infinity).flatMap(all)]:[];
it('cambiare il giorno conserva l’orario e cambiare l’orario conserva il giorno',()=>{
 const value=new Date(2026,0,31,19,7,30);
 const date=mergeDatePart(value,'date',new Date(2026,1,28,8));
 expect([date.getFullYear(),date.getMonth(),date.getDate(),date.getHours(),date.getMinutes()]).toEqual([2026,1,28,19,7]);
 const time=mergeDatePart(value,'time',new Date(2030,4,2,8,25));
 expect([time.getFullYear(),time.getMonth(),time.getDate(),time.getHours(),time.getMinutes(),time.getSeconds()]).toEqual([2026,0,31,8,25,0]);
 expect(value.getHours()).toBe(19);
});
it('il calendario non salva una bozza chiusa; Fatto conferma soltanto l’orario scelto',()=>{
 const slots:any[]=[];let cursor=0;const change=vi.fn();
 const mod=moduleOf('mobile/src/components/DateField.tsx',{
  'react/jsx-runtime':{jsx:node,jsxs:node},react:{createElement:node,useState:(initial:unknown)=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value:unknown)=>{slots[i]=value;}];}},
  'react-native':{Platform:{OS:'ios'},Pressable:'Pressable',Text:'Text',View:'View'},
  '@react-native-community/datetimepicker':{default:'Picker'},'@expo/vector-icons':{Ionicons:'Icon'},
  './ui':{Button:'Button',Sheet:'Sheet',t:{}},'@/constants/theme':theme,'@/lib/dateParts':{mergeDatePart},
 });
 const original=new Date(2026,9,27,19,7);
 const render=()=>{cursor=0;return mod.DateField({label:'Data e ora',value:original,onChange:change});};
 let tree=render();all(tree).find(n=>n.props.accessibilityLabel?.startsWith('Ora:'))!.props.onPress();
 tree=render();all(tree).find(n=>n.type==='Picker')!.props.onChange({},new Date(2026,9,27,8,25));
 all(tree).find(n=>n.type==='Sheet')!.props.onClose();expect(change).not.toHaveBeenCalled();
 tree=render();all(tree).find(n=>n.props.accessibilityLabel?.startsWith('Ora:'))!.props.onPress();
 tree=render();all(tree).find(n=>n.type==='Picker')!.props.onChange({},new Date(2026,9,27,9,40));
 tree=render();const sheet=all(tree).find(n=>n.type==='Sheet')!;sheet.props.footer.props.onPress();
 expect(change).toHaveBeenCalledOnce();const value=change.mock.calls[0][0] as Date;
 expect([value.getDate(),value.getMonth(),value.getHours(),value.getMinutes()]).toEqual([27,9,9,40]);
});
it('il selettore di visibilità mantiene le tre scelte e le dispone in verticale con testo grande',()=>{
 const change=vi.fn();
 const mod=moduleOf('mobile/src/components/event/VisibilitySwitch.tsx',{'react/jsx-runtime':{jsx:node,jsxs:node},'react-native':{View:'View',Text:'Text',Pressable:'Pressable',useWindowDimensions:()=>({width:375,fontScale:2})},'@expo/vector-icons':{Ionicons:'Icon'},'@/constants/theme':theme});
 const tree=mod.VisibilitySwitch({value:'private',onChange:change});
 const group=all(tree).find(n=>n.props.accessibilityRole==='radiogroup')!;
 expect(group.props.style.flexDirection).toBe('column');
 const options=all(tree).filter(n=>n.props.accessibilityRole==='radio');
 expect(options.map(n=>n.props.accessibilityLabel)).toEqual(['Pubblica','Gruppo','Solo link']);
 expect(options[2].props.accessibilityState.selected).toBe(true);
 options[1].props.onPress();expect(change).toHaveBeenCalledWith('club');
});
it('la barra v0 conserva il vetro, usa gli eventi di navigazione SDK 58',()=>{
 const push=vi.fn(),navigateToTab=vi.fn(),emit=vi.fn(()=>({defaultPrevented:false}));
 const mod=moduleOf('mobile/src/components/RecordTabBar.tsx',{'react/jsx-runtime':{jsx:node,jsxs:node},react:{Fragment:'Fragment'},'expo-router':{router:{push}},'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:34})},'@expo/vector-icons':{Ionicons:'Icon'},'./LiquidBar':{LiquidBar:'LiquidBar'},'@/constants/theme':theme});
 const tree=mod.RecordTabBar({state:{index:0,routes:['index','esplora','club','profilo','social'].map(name=>({key:name,name}))},emitter:{emit},navigateToTab});
 expect(all(tree).some(n=>n.type==='LiquidBar')).toBe(true);
 const tabs=all(tree).filter(n=>n.props.accessibilityRole==='tab');
 expect(tabs.map(n=>n.props.accessibilityLabel)).toEqual(['Home','Esplora','Profilo']);
 tabs[2].props.onPress();expect(navigateToTab).toHaveBeenCalledWith('profilo');
 tabs[0].props.onPress();expect(navigateToTab).toHaveBeenCalledTimes(1);
 const record=all(tree).find(n=>typeof n.type==='function')!;
 const button=(record.type as Function)();button.props.onPress();expect(push).toHaveBeenCalledWith('/registra');
});
