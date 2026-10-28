import { readFileSync } from 'node:fs';
import { expect,it,vi } from 'vitest';
import ts from 'typescript';
import { medalCatalog, physicalMedalOffer } from '../shared/medalShop.ts';
import { allAwards, type Award } from '../shared/records.ts';
import type { WorkoutLog } from '../shared/types.ts';
import * as theme from '../mobile/src/constants/theme.ts';

const offer={id:'21-km',title:'Medaglia 21 km',awardCode:'distance_21km',sport:'running',url:'https://shop.example.invalid/21?source=runngo'};
const log=(id:string,day:string,km:number|null,extra:Partial<WorkoutLog>={}):WorkoutLog=>({id,userId:'u',kind:'run_free',sport:'running',mode:'manual',title:'Attività locale di test',startedAt:`2026-10-${day}T08:00:00Z`,createdAt:`2026-10-${day}T08:00:00Z`,durationSec:7200,distanceKm:km,environment:'outdoor',sets:[],...extra}) as WorkoutLog;
it('senza URL e catalogo reali non pubblica nessun acquisto',()=>{
 for(const value of [undefined,'','{}','invalid',[],JSON.stringify([{...offer,url:''}])])expect(medalCatalog(value)).toEqual([]);
});
it('rifiuta schemi pericolosi, credenziali negli URL, sport errati e doppioni',()=>{
 const invalid=['javascript:alert(1)','http://shop.example.invalid/','data:text/html,test','https://user:password@shop.example.invalid/','https://127.0.0.1/','https://localhost/'];
 expect(medalCatalog(invalid.map(url=>({...offer,url})))).toEqual([]);
 expect(medalCatalog([{...offer,sport:'other'}])).toEqual([]);
 expect(medalCatalog([offer,offer])).toHaveLength(1);
});
it('i 21 km sono un traguardo reale, non richiedono un record e non si sommano fra attività',()=>{
 const short=[log('a','01',10),log('b','02',11)];
 expect(allAwards(short).some(a=>a.code==='distance_21km')).toBe(false);
 const threshold=log('c','03',21);
 const awards=allAwards([...short,threshold,log('d','04',24)]).filter(a=>a.code==='distance_21km');
 expect(awards).toHaveLength(1);expect(awards[0]).toMatchObject({logId:'c',record:false,mark:'21',sport:'running'});
 expect(allAwards([threshold]).some(a=>a.code==='distance_21km')).toBe(true);
 expect(allAwards([log('e','05',20.99)]).some(a=>a.code==='distance_21km')).toBe(false);
});
it('non assegna il traguardo per valori mancanti, non finiti, attività modificate o forza',()=>{
 for(const value of [log('a','01',null),log('b','02',Infinity),log('c','03',25,{edited:true}),log('d','04',25,{kind:'strength'})])expect(allAwards([value]).some(a=>a.code==='distance_21km')).toBe(false);
});
it('il prodotto compare soltanto per la medaglia conquistata e lo sport corrispondente',()=>{
 const awards=allAwards([log('a','01',21)]),catalog=medalCatalog([offer]);
 expect(physicalMedalOffer(awards,catalog)?.offer.id).toBe('21-km');
 expect(physicalMedalOffer([],catalog)).toBeNull();
 expect(physicalMedalOffer(awards,[])).toBeNull();
 expect(physicalMedalOffer(awards,medalCatalog([{...offer,sport:'walking'}]))).toBeNull();
});
it('il banner resta nascosto senza offerta e apre soltanto il link configurato senza dati personali',async()=>{
 let offers=medalCatalog([offer]);const openURL=vi.fn(async()=>{});
 const node=(type:unknown,props:any)=>({type,props});
 const imports:Record<string,unknown>={'react/jsx-runtime':{jsx:node,jsxs:node},react:{useState:(value:unknown)=>[value,vi.fn()]},'react-native':{Linking:{openURL},Pressable:'Pressable',Text:'Text',View:'View'},'@expo/vector-icons':{Ionicons:'Icon'},'@/lib/api':{API_URL:'https://api.example.invalid'},'@/constants/theme':theme,'@shared/medalShop.ts':{medalCatalog,physicalMedalOffer},'./ui':{useLoad:()=>({data:offers})}};
 const exports:Record<string,any>={};
 const code=ts.transpileModule(readFileSync('mobile/src/components/PhysicalMedalBanner.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)((name:string)=>imports[name]??{},exports);
 const awards=allAwards([log('a','01',21)]);
 const banner=exports.PhysicalMedalBanner({awards});
 await banner.props.children[0].props.onPress();
 expect(openURL).toHaveBeenCalledWith(offer.url);
 offers=[];expect(exports.PhysicalMedalBanner({awards})).toBeNull();
 expect(exports.PhysicalMedalBanner({awards:[] as Award[]})).toBeNull();
});
