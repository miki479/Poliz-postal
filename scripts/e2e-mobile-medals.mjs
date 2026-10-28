import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {join,extname} from 'node:path';
const root=process.env.MOBILE_EXPORT_DIR||'C:/Users/mikel/AppData/Local/Temp/runngo-medals-web';
const server=createServer((req,res)=>{let path=join(root,decodeURIComponent(req.url.split('?')[0]));if(!existsSync(path)||!extname(path))path=join(root,'index.html');try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.ttf':'font/ttf','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(8905,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const user={id:'test-only',username:'test',displayName:'Verifica locale',profileCompleted:true,setup:null,sports:['running'],privacy:{}};
 const log={id:'test-medal',userId:user.id,kind:'run_free',sport:'running',mode:'manual',title:'Attività locale di verifica',startedAt:'2026-10-28T07:00:00Z',createdAt:'2026-10-28T07:00:00Z',durationSec:7200,distanceKm:21,sets:[],environment:'outdoor'};
 let offers=[];
 await page.route('**/api/**',async route=>{let body={};try{body=route.request().postDataJSON()??{}}catch{}let result=[];if(body.method==='me')result=user;if(body.method==='listWorkoutLogs')result=[log];const catalog=route.request().url().endsWith('/api/medals/catalog');await route.fulfill({status:200,headers:{'access-control-allow-origin':'http://127.0.0.1:8905','access-control-allow-credentials':'true'},contentType:'application/json',body:JSON.stringify(catalog?{offers}:{result})});});
 const url='http://127.0.0.1:8905/riconoscimenti/test-medal%3Adistance_21km';
 await page.goto(url,{waitUntil:'networkidle'});await page.getByText('Traguardo 21 km',{exact:true}).waitFor();
 if(await page.getByRole('link',{name:/medaglia fisica/}).count())throw Error('Banner attivo senza catalogo');
 offers=[{id:'test-21',title:'Medaglia 21 km',awardCode:'distance_21km',sport:'running',url:'https://shop.example.invalid/21'}];
 await page.reload({waitUntil:'networkidle'});await page.getByRole('link',{name:/medaglia fisica/}).waitFor();
 mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/physical-medal-test-catalog-375.png',fullPage:true});
 log.distanceKm=20;
 await page.reload({waitUntil:'networkidle'});await page.getByText('Riconoscimento non disponibile',{exact:true}).waitFor();
 if(await page.getByRole('link',{name:/medaglia fisica/}).count())throw Error('Banner attivo per un traguardo non conquistato');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Medaglie: banner nascosto senza catalogo, visibile solo per prodotto e traguardo reali, rimosso se il dato scende sotto soglia; nessun errore JavaScript.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
