/**
 * Test end-to-end nel browser (Chromium). Avvia il server reale con dati temporanei,
 * verifica il flusso "organizzo → condivido → l'amico si iscrive", la modalità demo,
 * gli errori di console e produce screenshot responsive in test-results/.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8899;
const DEMO_PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO = `http://127.0.0.1:${DEMO_PORT}`;
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'podismo-e2e-'));
const OUTBOX = join(dir, 'outbox.jsonl');
writeFileSync(OUTBOX, '');
const procs = [];
const results = [];
const problems = [];

const ok = (name) => { results.push(name); console.log(`  ✓ ${name}`); };
function assert(cond, msg) { if (!cond) throw new Error(`Asserzione fallita: ${msg}`); }

async function waitFor(url) {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch { /* attende */ } await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`Timeout avvio ${url}`);
}

procs.push(spawn('node', ['dist-server/index.mjs'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_FILE: join(dir, 'db.json'), STATIC_DIR: 'dist', REGISTER_LIMIT_PER_HOUR: '1000', APP_URL: BASE, MAIL_PROVIDER: 'outbox', MAIL_OUTBOX_FILE: OUTBOX }, stdio: 'inherit' }));
// Server statico SENZA API: l'app deve ricadere sulla modalità demo.
procs.push(spawn('node', ['-e', `
const http=require('http'),fs=require('fs'),path=require('path');
http.createServer((q,s)=>{let f=path.join('dist',decodeURIComponent(q.url.split('?')[0]));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f='dist/index.html';
const t={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'}[path.extname(f)]||'text/html';
s.writeHead(200,{'Content-Type':t});fs.createReadStream(f).pipe(s)}).listen(${DEMO_PORT},'127.0.0.1')`], { stdio: 'inherit' }));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });

function watch(page, label) {
  // La sessione 'R' esegue volutamente richieste respinte (password errata, link già usato): i relativi 4xx sono attesi.
  page.on('console', (m) => { if (m.type() === 'error' && !(label === 'R' && m.text().includes('Failed to load resource'))) problems.push(`[${label}] console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${label}] request failed: ${r.url()}`));
}
const newCtx = (viewport = { width: 390, height: 844 }, extra = {}) => browser.newContext({ viewport, locale: 'it-IT', timezoneId: 'Europe/Rome', ...extra });


const mails = () => readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Registrazione via UI: email+password, poi profilo iniziale. */
async function signup(page, { email, name, username }) {
  await page.getByRole('button', { name: 'Registrati' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByRole('heading', { name: /Come ti chiami/ }).waitFor();
  await page.getByLabel('Nome visualizzato').fill(name);
  await page.getByLabel('Username').fill(username);
  await page.getByText('Disponibile').waitFor();
  await page.getByRole('button', { name: 'Salva e continua' }).click();
}

async function noHScroll(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(over <= 0, `scroll orizzontale in ${name} (${over}px)`);
}

try {
  await waitFor(`${BASE}/api/health`);
  await waitFor(`${DEMO}/`);

  /* ---------- Flusso reale: organizzatore + amico ---------- */
  console.log('Flusso reale (server)');
  const ctxA = await newCtx();
  const A = await ctxA.newPage();
  watch(A, 'A');
  await A.goto(BASE);
  await A.getByRole('link', { name: 'Accedi' }).first().click();
  await signup(A, { email: 'anna@example.com', name: 'Anna Rossi', username: 'anna.r' });
  await A.getByText('Organizza la tua prima corsa').waitFor();
  await A.screenshot({ path: `${OUT}/home-nuovo-utente-390.png`, fullPage: true });
  ok('registrazione e stato vuoto della Home');

  await A.getByRole('link', { name: /Organizza una corsa/ }).first().click();
  await A.getByRole('button', { name: /Controlla e pubblica/ }).click();
  await A.getByText('Scrivi un titolo').waitFor();
  await A.getByText('Indica dove ci si trova').waitFor();
  ok('validazione form: errori mostrati');
  await A.screenshot({ path: `${OUT}/form-errori-390.png`, fullPage: true });
  await A.getByLabel('Titolo').fill('Corsa dopo lavoro');
  await A.getByLabel('Luogo di ritrovo').fill('Ingresso palestra, via Roma');
  await A.getByLabel(/Città o zona/).fill('Forlì');
  await A.getByLabel(/Distanza/).fill('8');
  await A.getByLabel(/Ritmo/).fill('5:30');
  await A.getByLabel(/Numero massimo/).fill('3');
  await A.getByRole('button', { name: /Controlla e pubblica/ }).click();
  await A.getByRole('dialog').getByText('Pubblicare l\'uscita?').waitFor();
  await A.getByRole('dialog').getByRole('button', { name: 'Pubblica' }).click();
  await A.getByRole('heading', { name: 'Corsa dopo lavoro' }).waitFor();
  const eventUrl = A.url();
  assert(/\/uscita\/evt_/.test(eventUrl), 'URL dettaglio uscita');
  await A.getByText('1 / 3 posti').waitFor();
  ok('creazione uscita con conferma e pagina di dettaglio');

  const ctxB = await newCtx();
  const B = await ctxB.newPage();
  watch(B, 'B');
  await B.goto(eventUrl);
  await B.getByRole('heading', { name: 'Corsa dopo lavoro' }).waitFor();
  await B.screenshot({ path: `${OUT}/dettaglio-anonimo-390.png`, fullPage: true });
  await B.getByRole('link', { name: 'Accedi per partecipare' }).click();
  await B.getByText('Hai ricevuto un invito').waitFor();
  await signup(B, { email: 'bruno@example.com', name: 'Bruno Verdi', username: 'bruno.v' });
  await B.getByRole('heading', { name: 'Corsa dopo lavoro' }).waitFor();
  await B.getByRole('button', { name: 'Partecipo' }).click();
  await B.getByRole('status').filter({ hasText: 'Partecipi' }).waitFor();
  await B.getByText('2 / 3 posti').waitFor();
  ok('amico apre il link, si registra e si iscrive');

  await B.reload();
  await B.getByRole('status').filter({ hasText: 'Partecipi' }).waitFor();
  assert(await B.getByRole('button', { name: 'Partecipo', exact: true }).count() === 0, 'nessun secondo pulsante Partecipo');
  ok('iscrizione persistente dopo ricarica, nessun doppione');

  await A.reload();
  await A.getByText('2 / 3 posti').waitFor();
  await A.getByText('Bruno Verdi').waitFor();
  ok('organizzatore vede il nuovo partecipante');

  await A.goto(`${BASE}/notifiche`);
  await A.getByText('Bruno Verdi partecipa a "Corsa dopo lavoro".').waitFor();
  ok('notifica all\'organizzatore');

  // modifica con avviso ai partecipanti
  await A.goto(eventUrl);
  await A.getByRole('link', { name: /Modifica/ }).click();
  await A.getByLabel('Luogo di ritrovo').fill('Parcheggio nord');
  await A.getByRole('button', { name: /Controlla e salva/ }).click();
  await A.getByText('i partecipanti riceveranno una notifica').waitFor();
  await A.getByRole('dialog').getByRole('button', { name: 'Salva' }).click();
  await A.getByText('Parcheggio nord').waitFor();
  await B.goto(`${BASE}/notifiche`);
  await B.getByText(/data, ora o luogo sono cambiati/).waitFor();
  ok('modifica uscita e notifica ai partecipanti');

  // ultimo posto: terzo utente prende l'ultimo, il quarto vede "al completo"
  const ctxC = await newCtx();
  const C = await ctxC.newPage(); watch(C, 'C');
  await C.goto(eventUrl);
  await C.getByRole('link', { name: 'Accedi per partecipare' }).click();
  await signup(C, { email: 'carla@example.com', name: 'Carla', username: 'carla.c' });
  await C.getByRole('button', { name: 'Partecipo' }).click();
  await C.getByRole('status').filter({ hasText: 'Partecipi' }).waitFor();
  const ctxD = await newCtx(); const D = await ctxD.newPage(); watch(D, 'D');
  await D.goto(eventUrl);
  await D.getByText('Al completo.').waitFor();
  ok('uscita al completo mostrata ai nuovi utenti');

  // B si ritira
  await B.goto(eventUrl);
  await B.getByRole('button', { name: 'Non partecipo' }).click();
  await B.getByRole('dialog').getByRole('button', { name: 'Sì, mi ritiro' }).click();
  await B.getByRole('button', { name: 'Partecipo' }).waitFor();
  ok('ritiro dall\'uscita');

  // Club
  await A.goto(`${BASE}/club/nuovo`);
  await A.getByLabel('Nome del club').fill('Palestra Forte');
  await A.getByRole('button', { name: 'Crea il club' }).click();
  await A.getByRole('heading', { name: 'Palestra Forte' }).waitFor();
  const code = (await A.getByLabel(/Codice d'invito/).textContent()).trim();
  assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `codice club ${code}`);
  await B.goto(`${BASE}/invito/${code}`);
  await B.getByRole('button', { name: 'Entra nel club' }).click();
  await B.getByRole('heading', { name: 'Palestra Forte' }).waitFor();
  await B.getByText('Anna Rossi').first().waitFor();
  ok('creazione club, invito con codice e ingresso');


  // Recupero password, sessione persistente, logout
  console.log('Account');
  const ctxR = await newCtx();
  const R = await ctxR.newPage(); watch(R, 'R');
  await R.goto(`${BASE}/benvenuto`);
  await signup(R, { email: 'recupero@example.com', name: 'Rita', username: 'rita.m' });
  await R.getByText(/Ciao, Rita/).waitFor();
  await R.reload();
  await R.getByText(/Ciao, Rita/).waitFor();
  ok('sessione persistente dopo ricarica (nessun nuovo login)');
  await R.goto(`${BASE}/profilo`);
  await R.getByText('@rita.m').waitFor();
  await R.getByRole('button', { name: 'Esci' }).click();
  await R.getByRole('dialog').getByRole('button', { name: 'Esci' }).click();
  await R.getByRole('button', { name: 'Accedi', exact: true }).first().waitFor();
  await R.goto(`${BASE}/profilo`);
  await R.waitForURL(/\/benvenuto/);
  ok('logout e accesso negato alle pagine private');
  await R.getByRole('button', { name: 'Accedi' }).first().waitFor();
  await R.getByLabel('Email').fill('recupero@example.com');
  await R.getByLabel('Password', { exact: true }).fill('sbagliata!!');
  await R.getByRole('button', { name: 'Accedi', exact: true }).last().click();
  await R.getByText('Email o password non corretti.').waitFor();
  assert((await R.getByLabel('Email').inputValue()) === 'recupero@example.com', 'i dati restano dopo un errore');
  ok('errore di login mostrato e dati conservati');
  await R.getByRole('link', { name: 'Password dimenticata?' }).click();
  await R.getByLabel('Email').fill('recupero@example.com');
  await R.getByRole('button', { name: 'Invia il link' }).click();
  await R.getByText('Controlla la posta').waitFor();
  const resetMail = mails().filter((m) => /Reimposta/.test(m.subject)).pop();
  await R.goto(resetMail.text.match(/https?:\/\/\S+/)[0]);
  await R.getByLabel('Nuova password').fill('nuovapass123');
  await R.getByLabel('Ripeti la password').fill('nuovapass123');
  await R.getByRole('button', { name: 'Salva la password' }).click();
  await R.getByText('Password aggiornata').waitFor();
  await R.getByRole('button', { name: "Vai all'accesso" }).click();
  await R.getByLabel('Email').fill('recupero@example.com');
  await R.getByLabel('Password', { exact: true }).fill('nuovapass123');
  await R.getByRole('button', { name: 'Accedi', exact: true }).last().click();
  await R.getByText(/Ciao, Rita/).waitFor();
  ok('recupero password via email e nuovo accesso');
  // link riutilizzato
  await R.goto(resetMail.text.match(/https?:\/\/\S+/)[0]);
  await R.getByLabel('Nuova password').fill('altrapass123');
  await R.getByLabel('Ripeti la password').fill('altrapass123');
  await R.getByRole('button', { name: 'Salva la password' }).click();
  await R.getByText(/non è valido o è scaduto/).waitFor();
  ok('link di recupero monouso');

  // Schermate in 3 viewport + overflow + console
  console.log('Responsive');
  const sizes = [[360, 740, 'mobile-piccolo'], [390, 844, 'iphone'], [1280, 800, 'desktop']];
  const pages = [['/', 'home'], ['/esplora', 'esplora'], ['/club', 'club'], ['/social', 'social'], ['/profilo', 'profilo'], ['/uscita/nuova', 'nuova-uscita']];
  for (const [w, h, label] of sizes) {
    const ctx = await newCtx({ width: w, height: h });
    const P = await ctx.newPage(); watch(P, `resp-${label}`);
    await P.goto(`${BASE}/benvenuto`);
    await P.screenshot({ path: `${OUT}/benvenuto-${label}.png`, fullPage: true });
    await noHScroll(P, `benvenuto ${label}`);
    await P.getByLabel('Email').fill('anna@example.com');
    await P.getByLabel('Password', { exact: true }).fill('password123');
    await P.getByRole('button', { name: 'Accedi', exact: true }).last().click();
    await P.waitForURL(`${BASE}/`);
    for (const [path, name] of pages) {
      await P.goto(BASE + path);
      await P.waitForLoadState('networkidle');
      await P.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
      await noHScroll(P, `${name} ${label}`);
    }
    await P.goto(eventUrl);
    await P.getByRole('heading', { name: 'Corsa dopo lavoro' }).waitFor();
    await P.screenshot({ path: `${OUT}/dettaglio-${label}.png`, fullPage: true });
    await noHScroll(P, `dettaglio ${label}`);
    await ctx.close();
  }
  ok('nessuno scroll orizzontale su 360 / 390 / 1280 px, screenshot salvati');

  // Esplora: filtri
  await A.goto(`${BASE}/esplora`);
  await A.getByText('1 uscita').waitFor();
  await A.getByRole('button', { name: 'Oltre 10 km' }).click();
  await A.getByText('Nessuna uscita trovata').waitFor();
  await A.getByRole('button', { name: 'Azzera i filtri' }).click();
  await A.getByText('1 uscita').waitFor();
  ok('Esplora: filtri e stato vuoto');

  // Navigazione tastiera: il primo Tab porta al link "Vai al contenuto"
  await A.goto(BASE);
  await A.getByText(/^Ciao,/).waitFor();
  await A.keyboard.press('Tab');
  assert((await A.evaluate(() => document.activeElement?.textContent)) === 'Vai al contenuto', 'skip link');
  ok('accessibilità da tastiera: skip link');

  /* ---------- Modalità demo ---------- */
  console.log('Modalità demo (senza server)');
  const ctxM = await newCtx();
  const M = await ctxM.newPage(); watch(M, 'demo');
  await M.goto(`${DEMO}/benvenuto`);
  await M.getByText('Backend non configurato').waitFor();
  await M.getByText(/non è possibile creare un account/).waitFor();
  assert((await M.getByLabel('Email').count()) === 0, 'in demo non si mostra il form di registrazione');
  await M.screenshot({ path: `${OUT}/demo-benvenuto-390.png`, fullPage: true });
  await M.getByRole('button', { name: 'Apri la demo' }).click();
  await M.getByText('Modalità demo.', { exact: false }).first().waitFor();
  await M.goto(`${DEMO}/esplora`);
  await M.getByText('Corsa dopo lavoro (demo)').first().waitFor();
  await M.screenshot({ path: `${OUT}/demo-esplora-390.png`, fullPage: true });
  await M.getByText('Corsa dopo lavoro (demo)').first().click();
  await M.getByRole('button', { name: 'Partecipo' }).click();
  await M.getByRole('status').filter({ hasText: 'Partecipi' }).waitFor();
  await M.reload();
  await M.getByRole('status').filter({ hasText: 'Partecipi' }).waitFor();
  ok('demo: ingresso, iscrizione a uscita di esempio e persistenza locale');
  // Le nuove schermate funzionano anche in demo e dichiarano ciò che non è disponibile.
  await M.goto(`${DEMO}/piano`);
  await M.getByText('Costruisci il tuo piano').waitFor();
  await M.goto(`${DEMO}/profilo/statistiche`);
  await M.getByText('Ancora nessuna attività').waitFor();
  await M.goto(`${DEMO}/coach`);
  await M.getByText('Coach AI non disponibile').waitFor();
  await M.goto(`${DEMO}/profilo/integrazioni`);
  await M.getByText('Integrazione non ancora attiva').waitFor();
  await M.getByText(/un sito non può leggere Apple Salute/).waitFor();
  await M.goto(`${DEMO}/sfide/nuova`);
  await M.getByLabel('Nome', { exact: true }).fill('Sfida demo');
  await M.getByRole('button', { name: /Crea la sfida/ }).click();
  await M.getByRole('heading', { name: 'Sfida demo' }).waitFor();
  ok('demo: piano, statistiche, sfide funzionanti; Coach AI e Strava dichiarati non disponibili');

  assert(problems.length === 0, `errori di console/rete:\n${problems.join('\n')}`);
  ok('nessun errore di console o di rete');
  console.log(`\n${results.length} verifiche superate.`);
} catch (e) {
  console.error('\nFALLITO:', e.message);
  if (problems.length) console.error('Problemi raccolti:\n' + problems.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  for (const p of procs) p.kill();
  rmSync(dir, { recursive: true, force: true });
}
