import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll,beforeAll,expect,it } from 'vitest';
import { startServer,type Srv } from './helpers.ts';
const dir=mkdtempSync(join(tmpdir(),'runngo-medals-'));
let server:Srv,empty:Srv;
beforeAll(async()=>{
 const port=22000+Math.floor(Math.random()*1000)*2;
 server=await startServer({port,dataFile:join(dir,'store.json'),env:{MEDAL_SHOP_CATALOG:JSON.stringify([{id:'21-km',title:'Medaglia 21 km',awardCode:'distance_21km',sport:'running',url:'https://shop.example.invalid/21'}])}});
 empty=await startServer({port:port+1,dataFile:join(dir,'empty.json'),env:{MEDAL_SHOP_CATALOG:''}});
});
afterAll(async()=>{await server?.stop();await empty?.stop();rmSync(dir,{recursive:true,force:true});});
it('il catalogo è pubblico, senza sessione o dati degli atleti, e disattivato senza configurazione',async()=>{
 const response=await fetch(server.base+'/api/medals/catalog');expect(response.status).toBe(200);
 expect(response.headers.get('set-cookie')).toBeNull();
 const body=await response.json();expect(body.offers).toHaveLength(1);
 expect(Object.keys(body.offers[0]).sort()).toEqual(['awardCode','id','sport','title','url']);
 expect(await (await fetch(empty.base+'/api/medals/catalog')).json()).toEqual({offers:[]});
});
