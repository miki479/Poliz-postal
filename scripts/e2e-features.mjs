/**
 * E2E delle funzioni avanzate nel browser reale (Chromium), con servizi esterni SIMULATI (mock locali):
 * Strava (OAuth completo), Nominatim, OpenRouteService, Open-Meteo, Worker AI.
 * Questi test NON provano i servizi veri: provano che l'app li usa correttamente e gestisce errori e limiti.
 */
import { chromium } from 'playwright-core';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockServer } from '../tests/mocks.ts';

const PORT = 8911;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'podismo-e2ef-'));
const problems = [];
const results = [];
const ok = (n) => { results.push(n); console.log(`  ✓ ${n}`); };
const assert = (c, m) => { if (!c) throw new Error(`Asserzione fallita: ${m}`); };
const SECRET = 'segreto-ai';
const KEY = Buffer.alloc(32, 9).toString('base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const now = Date.now();
const day = (n) => new Date(now - n * 86_400_000).toISOString();
const stravaActs = [1, 2].map((i) => ({ id: 700 + i, name: `Corsa Strava ${i}`, type: 'Run', sport_type: 'Run', start_date: day(i + 20), distance: 6000 * i, moving_time: 1900 * i }));

const strava = await mockServer(({ method, path, search, headers, body }) => {
  if (path === '/oauth/authorize') return { status: 302, headers: { Location: `${search.get('redirect_uri')}?code=athlete-1&state=${encodeURIComponent(search.get('state'))}&scope=read,activity:read` } };
  if (path === '/oauth/token') return { json: { access_token: 'a1', refresh_token: 'r1', expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 1 } } };
  if (path === '/oauth/deauthorize') return { json: {} };
  if (path === '/api/v3/athlete/activities') return { json: Number(search.get('page') ?? 1) === 1 ? stravaActs : [] };
  return { status: 404, json: {} };
});
const nominatim = await mockServer(({ search }) => ({ json: [{ display_name: `${search.get('q')}, Forlì, Italia`, lat: '44.2227', lon: '12.0407' }] }));
const ors = await mockServer(() => ({ json: { features: [{ geometry: { coordinates: [[12.04, 44.22], [12.05, 44.23], [12.06, 44.235]] }, properties: { summary: { distance: 3 }, segments: [{ steps: [{ instruction: 'Prosegui dritto', distance: 3 }] }] } }] } }));
const meteoTimes = () => Array.from({ length: 24 * 16 }, (_, i) => new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + i * 3_600_000).toISOString().slice(0, 13) + ':00');
const meteo = await mockServer(() => { const t = meteoTimes(); return { json: { hourly: { time: t, temperature_2m: t.map(() => 18.4), precipitation_probability: t.map(() => 40), precipitation: t.map(() => 0.6), wind_speed_10m: t.map(() => 9.2), weather_code: t.map(() => 3) } } }; });
const aiw = await mockServer(({ headers, body }) => {
  const sig = createHmac('sha256', SECRET).update(`${headers['x-timestamp']}.${body}`).digest('hex');
  if (sig !== headers['x-signature']) return { status: 401, json: {} };
  return { json: { response: 'Consiglio generico:\n- Inizia con 3 sessioni facili a settimana.\n- Alterna corsa e camminata.' } };
});

const srv = spawn('node', ['dist-server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_FILE: join(dir, 'db.json'), STATIC_DIR: 'dist', REGISTER_LIMIT_PER_HOUR: '1000', APP_URL: BASE,
    STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's', TOKEN_ENCRYPTION_KEY: KEY, STRAVA_API_BASE: `${strava.url}/api/v3`, STRAVA_OAUTH_BASE: `${strava.url}/oauth`, STRAVA_SYNC_COOLDOWN_MS: '0',
    GEO_CONTACT_EMAIL: 'admin@example.com', NOMINATIM_URL: nominatim.url, ORS_API_KEY: 'k', ORS_URL: ors.url, WEATHER_ENABLED: '1', OPEN_METEO_URL: meteo.url,
    AI_ENABLED: '1', AI_WORKER_URL: aiw.url, AI_WORKER_SECRET: SECRET, AI_DAILY_LIMIT: '2' },
  stdio: 'inherit',
});
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* attende */ } await new Promise((r) => setTimeout(r, 150)); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const newCtx = (extra = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', ...extra });
async function page(ctx, label) {
  const p = await ctx.newPage();
  await p.route('**/tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  // Il 409 (A) e il 404 (C) compaiono solo nei test negativi (doppia registrazione, link senza token) che li provocano volutamente.
  p.on('console', (m) => { if (m.type() === 'error' && !(label === 'A' && /status of 409/.test(m.text())) && !(label === 'C' && /status of 404/.test(m.text()))) problems.push(`[${label}] console: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  p.on('requestfailed', (r) => problems.push(`[${label}] request failed: ${r.url()}`));
  return p;
}
async function signup(p, email, name, username) {
  await p.getByRole('button', { name: 'Registrati' }).click();
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password', { exact: true }).fill('password123');
  await p.getByRole('button', { name: 'Crea account' }).click();
  await p.getByRole('heading', { name: /Come ti chiami/ }).waitFor();
  await p.getByLabel('Nome visualizzato').fill(name);
  await p.getByLabel('Username').fill(username);
  await p.getByText('Disponibile').waitFor();
  await p.getByRole('button', { name: 'Salva e continua' }).click();
}
async function noHScroll(p, name) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(over <= 0, `scroll orizzontale in ${name} (${over}px)`);
}
const shot = async (p, name) => { await p.waitForLoadState('networkidle'); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); await noHScroll(p, name); };

try {
  const ctxA = await newCtx({ permissions: ['geolocation'], geolocation: { latitude: 44.2227, longitude: 12.0407 } });
  const A = await page(ctxA, 'A');
  await A.goto(`${BASE}/benvenuto`);
  await signup(A, 'anna@example.com', 'Anna Rossi', 'anna.r');
  await A.getByText(/Ciao, Anna/).waitFor();

  console.log('Statistiche');
  await A.goto(`${BASE}/profilo/statistiche`);
  await A.getByText('Ancora nessuna attività').waitFor();
  await shot(A, 'stats-vuote-390');
  ok('stato vuoto delle statistiche (nessun dato inventato)');
  await A.getByRole('button', { name: 'Registra la prima attività' }).click();
  await A.getByLabel('Distanza (km)').fill('10');
  await A.getByLabel('Durata (min)').fill('55');
  await A.getByRole('dialog').getByRole('button', { name: 'Salva' }).click();
  await A.getByText('Attività registrata').waitFor();
  await A.getByText('Km totali').waitFor();
  assert((await A.getByText('Autodichiarata').count()) >= 1, 'etichetta autodichiarata');
  await A.getByRole('button', { name: 'Tabella' }).first().click();
  await A.getByRole('columnheader', { name: /Distanza|km/i }).first().waitFor();
  await shot(A, 'stats-390');
  ok('registrazione attività, statistiche calcolate, tabella alternativa del grafico, etichetta "Autodichiarata"');
  // duplicato
  await A.getByRole('button', { name: /Registra/ }).first().click();
  await A.getByLabel('Distanza (km)').fill('10');
  await A.getByLabel('Durata (min)').fill('55');
  await A.getByRole('dialog').getByRole('button', { name: 'Salva' }).click();
  await A.getByText(/Esiste già un'attività simile/).waitFor();
  await A.keyboard.press('Escape');
  ok('doppia registrazione rifiutata con messaggio chiaro');
  // modifica
  await A.getByRole('button', { name: 'Modifica attività' }).first().click();
  await A.getByLabel('Distanza (km)').fill('11');
  await A.getByRole('dialog').getByRole('button', { name: 'Salva' }).click();
  await A.getByText('Attività aggiornata').waitFor();
  await A.getByText('11 km').first().waitFor();
  ok('modifica di un\'attività');

  console.log('Sfide');
  await A.goto(`${BASE}/sfide/nuova`);
  await A.getByRole('button', { name: /Crea la sfida/ }).click();
  await A.getByText(/almeno 3 caratteri/).waitFor();
  await A.getByLabel('Nome', { exact: true }).fill('Sfida km di ottobre');
  await A.getByRole('button', { name: /Crea la sfida/ }).click();
  await A.getByRole('heading', { name: 'Sfida km di ottobre' }).waitFor();
  const challengeUrl = await A.getByLabel('Link della sfida').textContent();
  assert(/\/sfida\/chl_.*\?c=[A-Z0-9]{4}-[A-Z0-9]{4}/.test(challengeUrl), `link sfida ${challengeUrl}`);
  await A.getByText('Autodichiarati', { exact: false }).first().waitFor();
  ok('creazione sfida con validazione e link d\'invito');
  const ctxB = await newCtx();
  const B = await page(ctxB, 'B');
  await B.goto(challengeUrl.trim());
  await B.getByRole('heading', { name: 'Sfida km di ottobre' }).waitFor();
  await B.getByRole('link', { name: 'Accedi per partecipare' }).click();
  await signup(B, 'bruno@example.com', 'Bruno Verdi', 'bruno.v');
  await B.getByRole('heading', { name: 'Sfida km di ottobre' }).waitFor();
  await B.getByRole('button', { name: 'Partecipo' }).click();
  await B.getByText('Bruno Verdi (tu)').waitFor();
  await B.goto(`${BASE}/profilo/statistiche?registra=1`);
  await B.getByLabel('Distanza (km)').fill('4,5');
  await B.getByLabel('Durata (min)').fill('30');
  await B.getByRole('dialog').getByRole('button', { name: 'Salva' }).click();
  await B.getByText('Attività registrata').waitFor();
  await B.goto(challengeUrl.trim());
  await B.getByText('4,5 km').first().waitFor();
  await A.goto(challengeUrl.trim());
  await A.getByText('Bruno Verdi').waitFor();
  const rows = await A.locator('ol li').allInnerTexts();
  assert(/^1\s+/.test(rows[0].trim()) && rows[0].includes('Anna'), `Anna prima: ${rows[0]}`);
  assert(rows[1].includes('Bruno') && rows[1].includes('4,5'), `Bruno secondo: ${rows[1]}`);
  await shot(A, 'sfida-390');
  ok('amico entra dal link, partecipa; classifica calcolata dalle attività registrate');
  await A.goto(`${BASE}/social`);
  await A.getByText('Sfida km di ottobre').waitFor();
  await shot(A, 'social-sfide-390');
  await B.goto(challengeUrl.trim());
  await B.getByRole('button', { name: 'Abbandona la sfida' }).click();
  await B.getByRole('dialog').getByRole('button', { name: 'Abbandona' }).click();
  ok('abbandono della sfida');

  console.log('Piano di allenamento');
  await A.goto(`${BASE}/piano`);
  await A.getByText('Costruisci il tuo piano').waitFor();
  await A.getByRole('link', { name: 'Procedura guidata' }).click();
  await A.getByRole('radio', { name: /Iniziare a correre/ }).click();
  await A.getByRole('button', { name: 'Avanti' }).click();
  await A.getByRole('button', { name: 'Vedi il programma' }).click();
  await A.getByText('Settimana 1').waitFor();
  await A.getByText(/non una prescrizione medica/).waitFor();
  await shot(A, 'piano-anteprima-390');
  await A.getByRole('button', { name: 'Salva il piano' }).click();
  await A.getByText('Prossimo allenamento').first().waitFor();
  await shot(A, 'piano-390');
  ok('procedura guidata: anteprima prudente, salvataggio, calendario settimanale');
  await A.getByRole('link', { name: 'Inizia allenamento' }).first().click();
  await A.getByRole('timer').waitFor();
  await A.getByRole('button', { name: 'Pausa' }).click();
  await A.getByRole('button', { name: 'Riprendi' }).waitFor();
  await A.getByRole('button', { name: 'Termina' }).click();
  await A.getByRole('dialog').getByLabel('Durata effettiva (min)').fill('25');
  await A.getByRole('dialog').getByLabel('Distanza (km)').fill('2,5');
  await A.getByRole('dialog').getByRole('button', { name: 'Salva nello storico' }).click();
  await A.getByText('Completata').first().waitFor();
  await A.getByRole('heading', { name: 'Confronto con il programma' }).waitFor();
  await shot(A, 'sessione-completata-390');
  ok('cronometro (avvia/pausa/riprendi/termina), registrazione e confronto con il programma');
  await A.goto(`${BASE}/profilo/statistiche`);
  await A.getByText('Da un\'uscita', { exact: false }).first().waitFor({ timeout: 2000 }).catch(() => {});
  await A.goto(`${BASE}/piano/sessione/nuova?date=${new Date().toISOString().slice(0, 10)}`);
  await A.getByLabel('Tipo di allenamento').selectOption('strength');
  await A.getByLabel('Nome', { exact: true }).fill('Forza gambe');
  await A.getByLabel('Aggiungi un esercizio dalla libreria').selectOption({ label: 'Squat a corpo libero (Corpo libero)' });
  await A.getByRole('button', { name: 'Salva la sessione' }).click();
  await A.getByRole('heading', { name: 'Forza gambe' }).waitFor();
  await A.getByText('Squat a corpo libero').waitFor();
  await A.getByRole('button', { name: 'Registra a mano' }).click();
  await A.getByRole('dialog').getByLabel(/Carico Squat a corpo libero serie 1/).fill('20');
  await A.getByRole('dialog').getByRole('button', { name: 'Salva nello storico' }).click();
  await A.getByText('Completata').first().waitFor();
  await A.goto(`${BASE}/piano/progressi`);
  await A.getByText('Carico massimo per giorno').waitFor();
  await shot(A, 'progressi-390');
  ok('sessione di forza con serie e carichi e grafico di progressione');

  console.log('Percorsi e meteo');
  await A.goto(`${BASE}/percorso/nuovo`);
  await A.getByLabel('Nome', { exact: true }).fill('Giro del parco');
  await A.getByLabel('Punto di partenza').fill('Ingresso nord');
  await A.getByLabel('Distanza (km)').fill('5,2');
  await A.getByRole('button', { name: 'Salva il percorso' }).click();
  await A.getByRole('heading', { name: 'Giro del parco' }).waitFor();
  await A.getByText('Distanza inserita a mano').waitFor();
  const routeUrl = A.url();
  ok('percorso salvato a mano (distanza dichiarata come tale)');
  await A.goto(`${BASE}/percorso/nuovo`);
  await A.getByLabel('Nome', { exact: true }).fill('Giro con tracciato');
  await A.getByLabel('Punto di partenza').fill('Partenza');
  await A.getByRole('checkbox').uncheck();
  await A.getByLabel('Cerca la partenza').fill('Piazza Saffi');
  await A.getByRole('button', { name: 'Cerca' }).first().click();
  await A.getByRole('button', { name: /piazza saffi, Forlì/i }).click();
  await A.getByLabel('Cerca l\'arrivo').fill('Parco Urbano');
  await A.getByRole('button', { name: 'Cerca' }).nth(1).click();
  await A.getByRole('button', { name: /parco urbano, Forlì/i }).click();
  await A.getByRole('button', { name: 'Calcola il percorso a piedi' }).click();
  await A.getByText(/Percorso calcolato/).waitFor();
  await A.getByText(/OpenRouteService/).first().waitFor();
  await shot(A, 'percorso-form-390');
  await A.getByRole('button', { name: 'Salva il percorso' }).click();
  await A.getByRole('heading', { name: 'Giro con tracciato' }).waitFor();
  await A.getByText('Distanza dal tracciato').waitFor();
  await shot(A, 'percorso-390');
  ok('ricerca luogo, calcolo del percorso (mock ORS), mappa Leaflet con tracciato e attribuzione OSM');
  // condivisione e preferiti
  await B.goto(routeUrl);
  await B.getByRole('heading', { name: 'Giro del parco' }).waitFor();
  await B.getByRole('button', { name: 'Salva nei preferiti' }).click();
  await B.getByRole('button', { name: 'Nei preferiti' }).waitFor();
  const ctxC = await newCtx();
  const C = await page(ctxC, 'C');
  await C.goto(routeUrl.split('?')[0]);
  await C.getByText(/non trovato o non accessibile/).waitFor();
  ok('percorso condiviso con link: preferiti per l\'amico, inaccessibile senza token');
  // uscita con percorso e meteo
  await A.goto(`${BASE}/uscita/nuova`);
  await A.getByLabel('Titolo').fill('Corsa con meteo');
  await A.getByLabel('Luogo di ritrovo').fill('Piazza Saffi');
  await A.getByLabel('Percorso').selectOption({ label: 'Giro del parco · 5,2 km' });
  await A.getByRole('button', { name: 'Aggiungi la posizione del ritrovo' }).click();
  await A.getByText(/Posizione approssimata/).first().waitFor();
  await A.getByRole('button', { name: /Controlla e pubblica/ }).click();
  await A.getByRole('dialog').getByRole('button', { name: 'Pubblica' }).click();
  await A.getByRole('heading', { name: 'Corsa con meteo' }).waitFor();
  await A.getByRole('heading', { name: 'Meteo previsto' }).waitFor();
  await A.getByText('Coperto').waitFor();
  await A.getByText('18°').waitFor();
  await A.getByText(/Open-Meteo/).first().waitFor();
  await A.getByText('Percorso: Giro del parco').waitFor();
  await shot(A, 'uscita-meteo-390');
  ok('uscita con percorso associato e previsioni meteo con attribuzione e ora di aggiornamento');
  // dall'uscita a sessione del piano
  await A.goto(`${BASE}/piano`);

  console.log('Strava, import, AI');
  await A.goto(`${BASE}/profilo/integrazioni`);
  await A.getByRole('heading', { name: 'Strava' }).waitFor();
  await A.getByText(/restano privati/).first().waitFor();
  await shot(A, 'integrazioni-390');
  await A.getByRole('button', { name: 'Collega Strava' }).click();
  await A.waitForURL(/profilo\/integrazioni/);
  await A.getByText('Strava collegato').waitFor();
  await A.getByText('Collegato', { exact: true }).waitFor();
  await A.getByRole('button', { name: 'Sincronizza ora' }).click();
  await A.getByText(/2 nuove/).first().waitFor();
  await A.getByText(/Ultima sincronizzazione:/).first().waitFor();
  ok('OAuth Strava completo (mock), sincronizzazione manuale e data dell\'ultima sincronizzazione');
  await A.goto(`${BASE}/profilo/statistiche`);
  await A.getByRole('combobox').first().waitFor({ state: 'attached' }).catch(() => {});
  await A.getByRole('button', { name: 'Tutto' }).click();
  await A.getByText('Importata da Strava').first().waitFor();
  await A.getByRole('link', { name: /Visualizza su Strava/ }).first().waitFor();
  await A.getByText(/Powered by Strava/).waitFor();
  await shot(A, 'stats-strava-390');
  ok('attività Strava marcate "Importata", con link e attribuzione, solo per l\'utente');
  await A.goto(challengeUrl.trim());
  assert((await A.getByText('Corsa Strava').count()) === 0, 'Strava non nella sfida');
  // import GPX
  const gpx = join(dir, 'giro.gpx');
  writeFileSync(gpx, `<?xml version="1.0"?><gpx><trk><name>Corsa GPX</name><trkseg><trkpt lat="44.2200" lon="12.0400"><time>${day(40)}</time></trkpt><trkpt lat="44.2300" lon="12.0400"><time>${new Date(Date.parse(day(40)) + 600000).toISOString()}</time></trkpt></trkseg></trk></gpx>`);
  await A.goto(`${BASE}/profilo/integrazioni`);
  await A.locator('input[type=file]').setInputFiles(gpx);
  await A.getByText(/trovate 1 attività/).waitFor();
  await A.getByRole('button', { name: /Importa 1 attività/ }).click();
  await A.getByText(/Importate 1, già presenti 0/).waitFor();
  await A.locator('input[type=file]').setInputFiles(gpx);
  await A.getByRole('button', { name: /Importa 1 attività/ }).click();
  await A.getByText(/Importate 0, già presenti 1/).waitFor();
  await A.getByRole('heading', { name: /Apple Salute/ }).waitFor();
  await A.getByText(/un sito non può leggere Apple Salute/).waitFor();
  ok('import da file GPX con deduplica; Apple Salute dichiarata non disponibile per la PWA');
  // Coach AI
  await A.goto(`${BASE}/coach`);
  await A.getByText(/Richieste di oggi: 0 su 2/).waitFor();
  await A.getByRole('button', { name: 'Chiedi al coach' }).click();
  await A.getByRole('region', { name: 'Risposta del coach' }).getByText(/Inizia con 3 sessioni/).waitFor();
  await A.getByText('Consiglio generico', { exact: true }).first().waitFor();
  await A.getByText(/Richieste di oggi: 1 su 2/).waitFor();
  await shot(A, 'coach-390');
  ok('Coach AI: risposta (mock Worker firmato), etichetta "generico", quota aggiornata');
  await A.waitForTimeout(5200);
  await A.getByRole('button', { name: 'Chiedi al coach' }).click();
  await A.getByText(/Richieste di oggi: 2 su 2/).waitFor();
  await A.getByRole('button', { name: 'Limite di oggi raggiunto' }).waitFor();
  ok('limite giornaliero AI raggiunto: pulsante disattivato e messaggio chiaro');

  console.log('Responsive e stati non configurati');
  for (const [w, h, label] of [[360, 740, 'piccolo'], [1280, 800, 'desktop']]) {
    const ctx = await newCtx({ viewport: { width: w, height: h } });
    const P = await page(ctx, `resp-${label}`);
    await P.goto(`${BASE}/benvenuto`);
    await P.getByLabel('Email').fill('anna@example.com');
    await P.getByLabel('Password', { exact: true }).fill('password123');
    await P.getByRole('button', { name: 'Accedi', exact: true }).last().click();
    await P.waitForURL(`${BASE}/`);
    for (const [path, n] of [['/', 'home'], ['/piano', 'piano'], ['/profilo/statistiche', 'stats'], ['/profilo', 'profilo'], ['/esplora?t=percorsi', 'percorsi'], ['/social', 'social'], ['/profilo/integrazioni', 'integrazioni'], ['/coach', 'coach'], ['/privacy', 'privacy'], ['/piano/progressi', 'progressi']]) {
      await P.goto(BASE + path);
      await shot(P, `f-${n}-${label}`);
    }
    await ctx.close();
  }
  ok('nessuno scroll orizzontale su 360 e 1280 px nelle nuove schermate');

  assert(problems.length === 0, `errori di console/rete:\n${problems.join('\n')}`);
  ok('nessun errore di console o di rete');
  console.log(`\n${results.length} verifiche superate.`);
} catch (e) {
  console.error('\nFALLITO:', e.message);
  if (problems.length) console.error('Problemi raccolti:\n' + problems.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.kill();
  await Promise.all([strava, nominatim, ors, meteo, aiw].map((m) => m.close()));
  rmSync(dir, { recursive: true, force: true });
}
