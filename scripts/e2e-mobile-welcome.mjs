import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless:true });
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let user=null;
await page.route('**/api/**',async route=>{
 const url=route.request().url(); let body={};try{body=route.request().postDataJSON()??{}}catch{}
 let result={};
 if(url.endsWith('/api/auth/register')){
  user={id:'preview-user',username:'preview',displayName:'Runner',avatar:null,profileCompleted:false,bio:'',hue:1,sports:['running'],area:'',privacy:{showStats:false,showClubs:true,showUpcoming:true,shareActivity:true},createdAt:new Date().toISOString(),setup:{version:1,step:0,completedAt:null,weightKg:null,heightCm:null,groupMatching:false,heatmapConsent:false}};
  result={user};
 } else if(url.endsWith('/api/call')){
  if(body.method==='saveSetup'){const patch=body.args[0]; user.setup={...user.setup,...patch}; if(patch.complete)user.setup.completedAt=new Date().toISOString();result={result:user};}
  else result={result:body.method==='me'?user:[]};
 } else result={configured:false,connected:false};
 await route.fulfill({status:route.request().method()==='OPTIONS'?204:200,headers:{'access-control-allow-origin':'http://127.0.0.1:8898','access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS'},contentType:'application/json',body:route.request().method()==='OPTIONS'?'':JSON.stringify(result)});
});
await page.goto(process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:8898/',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'Registrati',exact:true}).click();
await page.getByLabel('Email',{exact:true}).fill('preview@example.test');
await page.getByLabel('Password',{exact:true}).fill('preview-password');
await page.getByRole('button',{name:'Crea il tuo account',exact:true}).click();
try { await page.getByRole('button',{name:'Personalizziamo Runngo',exact:true}).waitFor({timeout:15000}); } catch(e) { console.log(JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,2500),errors,userCreated:!!user})); throw e; }
await page.screenshot({path:'test-results/mobile-onboarding.png',fullPage:true});
await page.getByRole('button',{name:'Personalizziamo Runngo',exact:true}).click();
await page.getByRole('button',{name:'Salva e continua',exact:true}).waitFor();
for(let i=0;i<4;i++) { await page.getByRole('button',{name:'Non ora',exact:true}).click(); }
await page.getByRole('button',{name:'Crea il mio piano',exact:true}).click();
await page.getByText('Da dove partiamo?',{exact:true}).waitFor({timeout:15000});
console.log(JSON.stringify({introToRegistrationToSetupToPlan:true,url:page.url(),errors}));
await browser.close();
