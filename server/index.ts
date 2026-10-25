import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, PUBLIC_METHODS, READ_ONLY_METHODS, type MethodName } from '../shared/api.ts';
import { AppError, createUser, deleteAccount, suggestUsername, usernameAvailable, type Ctx } from '../shared/engine.ts';
import { HANDLE_RE, normalizeEmail, validateEmailPassword } from '../shared/validation.ts';
import { mailConfigFromEnv, mailEnabled, sendMail } from './mail.ts';
import { storageFromEnv, type Account, type Persisted, type Storage, type TokenRec } from './storage.ts';
import { APPLE, GOOGLE, verifyIdToken, type OidcProvider } from './oidc.ts';
import { analyzeWorkout, factsToContext, factsToText } from '../shared/brief.ts';
import { aiConfig, aiStatus, buildContext, buildMessages, callWorker, PRESETS, refund, reserve, type Preset } from './ai.ts';
import { geocode, geoConfig, route as routeFn } from './geo.ts';
import { authorizeUrl, deauthorize, exchangeCode, fetchStreams, fetchHeartZones, stravaConfig, stravaPublicStatus, syncActivities, verifyState } from './strava.ts';
import { forecast, weatherConfig } from './weather.ts';

/* ---------- configurazione (variabili d'ambiente, nessun segreto nel frontend) ---------- */

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = resolve(process.env.DATA_FILE || join(process.cwd(), 'data', 'db.json'));
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(here, '..', 'dist'));
const REGISTRATION_CODE = process.env.REGISTRATION_CODE || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SESSION_DAYS = 30;
/** Dietro Firebase Hosting passa solo il cookie "__session": imposta SESSION_COOKIE_NAME=__session. */
const COOKIE = process.env.SESSION_COOKIE_NAME || 'ps_session';
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
const MAX_BODY = 250_000;
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT_PER_HOUR) || 10;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI || '';
const mail = mailConfigFromEnv(process.env, PORT);
const strava = stravaConfig(process.env, mail.appUrl);
const geo = geoConfig(process.env);
const weather = weatherConfig(process.env);
const ai = aiConfig(process.env);
const SYNC_COOLDOWN_MS = process.env.STRAVA_SYNC_COOLDOWN_MS !== undefined ? Number(process.env.STRAVA_SYNC_COOLDOWN_MS) : 300_000;
const aiBusy = new Set<string>();

/* ---------- persistenza (file JSON o Firestore, vedi server/storage.ts) ---------- */

const storage: Storage = await storageFromEnv(process.env, DATA_FILE);
const store: Persisted = await storage.load();
console.log(`Archivio dati: ${storage.kind}`);

let flushing: Promise<void> = Promise.resolve();
/** Salva in modo serializzato. Le richieste che modificano dati attendono l'esito prima di rispondere. */
function persist(): Promise<void> {
  const p = flushing.then(() => storage.save(store));
  flushing = p.catch((e) => console.error('Salvataggio fallito:', (e as Error).message));
  return p;
}

/* ---------- password, sessioni, token ---------- */

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(password, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
}

async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: (await scrypt(password, salt)).toString('hex') };
}

/** Confronto a tempo costante; esegue comunque lo scrypt se l'account non esiste (niente differenze di tempo). */
async function verifyPassword(password: string, rec: Account | undefined): Promise<boolean> {
  const salt = Buffer.from(rec?.salt ?? '00'.repeat(16), 'hex');
  const derived = await scrypt(password, salt);
  if (!rec?.hash) return false;
  const expected = Buffer.from(rec.hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  store.sessions[sha(token)] = { userId, expires: Date.now() + SESSION_DAYS * 86_400_000 };
  return token;
}

function dropSessions(userId: string, except?: string | null) {
  for (const [k, s] of Object.entries(store.sessions)) if (s.userId === userId && k !== except) delete store.sessions[k];
}

function sessionUser(req: IncomingMessage): { userId: string | null; token: string | null } {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie ?? '');
  if (!m) return { userId: null, token: null };
  const key = sha(m[1]);
  const s = store.sessions[key];
  if (!s) return { userId: null, token: null };
  if (s.expires < Date.now() || !store.db.users[s.userId] || !store.accounts[s.userId]) {
    delete store.sessions[key];
    return { userId: null, token: null };
  }
  if (s.expires - Date.now() < (SESSION_DAYS / 2) * 86_400_000) {
    s.expires = Date.now() + SESSION_DAYS * 86_400_000; // sessione scorrevole
    void persist().catch(() => {});
  }
  return { userId: s.userId, token: m[1] };
}

function cookieHeader(req: IncomingMessage, token: string | null): string {
  const secure = req.headers['x-forwarded-proto'] === 'https' || (req.socket as { encrypted?: boolean }).encrypted ? '; Secure' : '';
  const base = `${COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86400}` : `${base}; Max-Age=0`;
}

function newTokenFor(userId: string, type: TokenRec['type'], ttlMs: number): string {
  const token = randomBytes(32).toString('base64url');
  store.tokens[sha(token)] = { userId, type, expires: Date.now() + ttlMs };
  return token;
}

/** Consuma un token monouso: valido, del tipo giusto, non scaduto. */
function consumeToken(token: unknown, type: TokenRec['type']): TokenRec {
  const key = typeof token === 'string' ? sha(token) : '';
  const rec = store.tokens[key];
  if (!rec || rec.type !== type || rec.expires < Date.now() || !store.accounts[rec.userId]) {
    if (rec && rec.expires < Date.now()) delete store.tokens[key];
    throw new AppError('bad_request', 'Il link non è valido o è scaduto. Richiedine uno nuovo.');
  }
  delete store.tokens[key];
  return rec;
}

const accountByEmail = (email: string) => Object.values(store.accounts).find((a) => a.email === email);

/* ---------- rate limiting in memoria ---------- */

const buckets = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  b.n += 1;
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  for (const [k, s] of Object.entries(store.sessions)) if (s.expires < now) delete store.sessions[k];
}, 600_000).unref();

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/* ---------- HTTP helpers ---------- */

const google = GOOGLE_CLIENT_ID ? ' https://accounts.google.com/gsi/' : '';
const apple = APPLE_CLIENT_ID ? ' https://appleid.cdn-apple.com https://appleid.apple.com' : '';
const tileHost = (() => {
  try {
    return new URL(geo.tileUrl.replace(/\{[a-z]\}/g, 'a')).origin.replace(/^(https?:\/\/)a\./, '$1*.');
  } catch {
    return '';
  }
})();
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Content-Security-Policy':
    `default-src 'self'; img-src 'self' data: ${tileHost}; style-src 'self' 'unsafe-inline'${google}; script-src 'self'${google}${apple}; connect-src 'self'${google}${apple}; frame-src${google || " 'none'"}${apple}; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
};

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string | string[]> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(json);
}

function fail(res: ServerResponse, err: unknown) {
  if (err instanceof AppError) return send(res, err.status, { error: { code: err.code, message: err.message, fields: err.fields } });
  console.error(err);
  return send(res, 500, { error: { code: 'server_error', message: 'Errore interno. Riprova tra poco.' } });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AppError('bad_request', 'Richiesta troppo grande.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new AppError('bad_request', 'JSON non valido.'));
      }
    });
    req.on('error', reject);
  });
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // richieste non-browser
  try {
    const host = new URL(origin).host;
    // Dietro un proxy (Cloud Run / Firebase Hosting) l'host originale arriva in X-Forwarded-Host.
    const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() : '';
    return host === req.headers.host || (!!fwd && host === fwd) || ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function hueFor(seed: string): number {
  return parseInt(sha(seed).slice(0, 4), 16) % 360;
}

const nameFromEmail = (email: string) =>
  email.split('@')[0].replace(/[._-]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 30) || 'Runner';

async function startSession(req: IncomingMessage, res: ServerResponse, userId: string, extra: Record<string, unknown> = {}) {
  const session = createSession(userId);
  await persist();
  return send(res, 200, { user: store.db.users[userId], ...extra }, { 'Set-Cookie': cookieHeader(req, session) });
}

async function sendVerification(userId: string) {
  const acc = store.accounts[userId];
  if (!mailEnabled(mail) || !acc || acc.emailVerified) return;
  const token = newTokenFor(userId, 'verify', 48 * 3_600_000);
  await persist();
  await sendMail(mail, {
    to: acc.email,
    subject: 'Conferma il tuo indirizzo email — RUNNGO',
    text: `Ciao!\n\nConferma il tuo indirizzo email aprendo questo link (valido 48 ore):\n${mail.appUrl}/verifica-email?token=${token}\n\nSe non hai creato tu l'account puoi ignorare questo messaggio.`,
  });
}

function oidcProvider(kind: 'google' | 'apple'): OidcProvider {
  const id = kind === 'google' ? GOOGLE_CLIENT_ID : APPLE_CLIENT_ID;
  if (!id) throw new AppError('unavailable', `L'accesso con ${kind === 'google' ? 'Google' : 'Apple'} non è configurato su questo server.`);
  return kind === 'google' ? GOOGLE(id) : APPLE(id);
}

/** Accesso/registrazione con provider esterno: collega l'account per sub, oppure per email SOLO se verificata dal provider. */
async function socialSignIn(req: IncomingMessage, res: ServerResponse, kind: 'google' | 'apple', idToken: unknown, nameHint: unknown) {
  if (typeof idToken !== 'string' || idToken.length > 4000) throw new AppError('bad_request', 'Token non valido.');
  let claims;
  try {
    claims = await verifyIdToken(idToken, oidcProvider(kind));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('unauthenticated', 'Accesso non riuscito: token del provider non valido o scaduto.');
  }
  let acc = Object.values(store.accounts).find((a) => a[kind] === claims.sub);
  if (!acc && claims.email && claims.emailVerified) {
    const byEmail = accountByEmail(claims.email);
    if (byEmail) {
      byEmail[kind] = claims.sub;
      byEmail.emailVerified = true;
      acc = byEmail;
    }
  }
  if (!acc) {
    if (!claims.email) throw new AppError('validation', 'Il provider non ha fornito un indirizzo email: usa email e password.');
    const display = (typeof nameHint === 'string' && nameHint.trim()) || claims.name || nameFromEmail(claims.email);
    const user = createUser(store.db, new Date(), { displayName: display.slice(0, 30), username: suggestUsername(store.db, claims.email.split('@')[0]), hue: hueFor(claims.sub), profileCompleted: false });
    acc = { userId: user.id, email: claims.email, emailVerified: claims.emailVerified, [kind]: claims.sub, createdAt: new Date().toISOString() };
    store.accounts[user.id] = acc;
  }
  return startSession(req, res, acc.userId, { created: !store.db.users[acc.userId].profileCompleted });
}

/* ---------- OAuth Strava: ritorno dal browser ---------- */

async function stravaCallback(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const back = (status: string) => {
    res.writeHead(302, { Location: `/profilo/integrazioni?strava=${status}`, 'Cache-Control': 'no-store' });
    res.end();
  };
  if (!strava.enabled) return back('unavailable');
  if (limited(`stravacb:${clientIp(req)}`, 30, 600_000)) return back('error');
  const { userId } = sessionUser(req);
  // Il "state" firmato deve corrispondere all'utente della sessione: impedisce di collegare l'account Strava a un altro utente.
  const stateUser = verifyState(strava, url.searchParams.get('state') ?? '');
  if (!userId || !stateUser || stateUser !== userId) return back('state_error');
  if (url.searchParams.get('error')) return back('denied');
  const code = url.searchParams.get('code');
  if (!code) return back('error');
  try {
    const link = await exchangeCode(strava, code, url.searchParams.get('scope') ?? '');
    const taken = Object.values(store.accounts).find((a) => a.userId !== userId && a.strava && a.strava.athleteId === link.athleteId && link.athleteId !== 0);
    if (taken) return back('already_linked');
    store.accounts[userId].strava = link;
    await persist();
    return back('ok');
  } catch (e) {
    return back((e as Error).message === 'scope_missing' ? 'scope_missing' : 'error'); // nessun token o codice nei log
  }
}

/* ---------- API ---------- */

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const ip = clientIp(req);
  if (pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      mode: 'server',
      registrationCodeRequired: !!REGISTRATION_CODE,
      emailEnabled: mailEnabled(mail),
      googleClientId: GOOGLE_CLIENT_ID || null,
      appleClientId: APPLE_CLIENT_ID && APPLE_REDIRECT_URI ? APPLE_CLIENT_ID : null,
      appleRedirectUri: APPLE_CLIENT_ID && APPLE_REDIRECT_URI ? APPLE_REDIRECT_URI : null,
      features: {
        strava: strava.enabled,
        geocoding: geo.searchEnabled,
        routing: geo.routingProvider !== 'none',
        weather: weather.enabled,
        ai: ai.enabled,
      },
      map: { tileUrl: geo.tileUrl, attribution: geo.tileAttribution },
    });
  }
  if (pathname === '/api/strava/callback' && req.method === 'GET') return stravaCallback(req, res);
  if (req.method !== 'POST') return send(res, 405, { error: { code: 'bad_request', message: 'Metodo non consentito.' } });
  if (!sameOrigin(req)) return send(res, 403, { error: { code: 'forbidden', message: 'Origine non consentita.' } });
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
    return send(res, 415, { error: { code: 'bad_request', message: 'Content-Type deve essere application/json.' } });
  if (limited(`all:${ip}`, 600, 60_000)) return send(res, 429, { error: { code: 'rate_limited', message: 'Troppe richieste. Attendi un momento.' } });

  const body = (await readBody(req)) as Record<string, unknown>;
  const { userId, token } = sessionUser(req);
  const fieldErr = (field: string, msg: string) => new AppError('validation', msg, { [field]: msg });

  switch (pathname) {
    case '/api/auth/register': {
      if (limited(`reg:${ip}`, REGISTER_LIMIT, 3_600_000)) throw new AppError('rate_limited', 'Troppe registrazioni da questo dispositivo. Riprova più tardi.');
      const errors = validateEmailPassword(body.email, body.password);
      if (Object.keys(errors).length) throw new AppError('validation', 'Controlla i campi evidenziati.', errors);
      if (REGISTRATION_CODE && String(body.registrationCode ?? '').trim() !== REGISTRATION_CODE) throw fieldErr('registrationCode', 'Codice non valido.');
      const email = normalizeEmail(body.email);
      if (accountByEmail(email)) throw fieldErr('email', 'Esiste già un account con questa email. Prova ad accedere.');
      const { salt, hash } = await hashPassword(String(body.password));
      if (accountByEmail(email)) throw fieldErr('email', 'Esiste già un account con questa email. Prova ad accedere.');
      const user = createUser(store.db, new Date(), { displayName: nameFromEmail(email), username: suggestUsername(store.db, email.split('@')[0]), hue: hueFor(email), profileCompleted: false });
      store.accounts[user.id] = { userId: user.id, email, emailVerified: false, salt, hash, createdAt: new Date().toISOString() };
      sendVerification(user.id).catch((e) => console.error('verifica email non inviata:', (e as Error).message));
      return startSession(req, res, user.id);
    }

    case '/api/auth/login': {
      const email = normalizeEmail(body.email);
      if (limited(`login:${ip}`, 20, 900_000) || limited(`login:${email}`, 10, 900_000)) throw new AppError('rate_limited', 'Troppi tentativi. Riprova tra qualche minuto.');
      const acc = accountByEmail(email);
      const ok = await verifyPassword(String(body.password ?? ''), acc);
      if (!ok || !acc) {
        if (acc && !acc.hash) throw new AppError('unauthenticated', 'Questo account usa l\'accesso con Google o Apple. Usa il pulsante dedicato, oppure imposta una password con "Password dimenticata?".');
        throw new AppError('unauthenticated', 'Email o password non corretti.');
      }
      return startSession(req, res, acc.userId);
    }

    case '/api/auth/google':
    case '/api/auth/apple': {
      if (limited(`social:${ip}`, 30, 900_000)) throw new AppError('rate_limited', 'Troppi tentativi. Riprova tra qualche minuto.');
      return socialSignIn(req, res, pathname.endsWith('google') ? 'google' : 'apple', body.idToken, body.name);
    }

    case '/api/auth/logout': {
      if (token) delete store.sessions[sha(token)];
      await persist();
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, null) });
    }

    case '/api/auth/username-available': {
      const u = String(body.username ?? '').trim().toLowerCase();
      if (!HANDLE_RE.test(u)) return send(res, 200, { available: false, reason: 'format' });
      return send(res, 200, { available: usernameAvailable(store.db, u, userId ?? undefined) });
    }

    case '/api/auth/forgot': {
      if (!mailEnabled(mail)) throw new AppError('unavailable', 'Il recupero password via email non è configurato su questo server. Contatta chi gestisce il servizio.');
      const email = normalizeEmail(body.email);
      if (limited(`forgot:${ip}`, 10, 3_600_000) || limited(`forgot:${email}`, 3, 3_600_000)) throw new AppError('rate_limited', 'Hai già richiesto più link. Controlla la posta o riprova più tardi.');
      const acc = accountByEmail(email);
      if (acc) {
        const t = newTokenFor(acc.userId, 'reset', 3_600_000);
        await persist();
        try {
          await sendMail(mail, { to: acc.email, subject: 'Reimposta la tua password — RUNNGO', text: `Hai chiesto di reimpostare la password.\n\nApri questo link (valido 1 ora, utilizzabile una volta):\n${mail.appUrl}/reimposta-password?token=${t}\n\nSe non sei stato tu, ignora questo messaggio: la tua password resta invariata.` });
        } catch (e) {
          console.error('reset email non inviata:', (e as Error).message);
          throw new AppError('unavailable', 'Non riusciamo a inviare l\'email in questo momento. Riprova tra poco.');
        }
      }
      // Risposta identica a prescindere dall'esistenza dell'account.
      return send(res, 200, { ok: true });
    }

    case '/api/auth/reset': {
      const pw = String(body.password ?? '');
      const errors = validateEmailPassword('a@b.it', pw);
      if (errors.password) throw new AppError('validation', errors.password, { password: errors.password });
      const rec = consumeToken(body.token, 'reset');
      const acc = store.accounts[rec.userId];
      Object.assign(acc, await hashPassword(pw));
      dropSessions(rec.userId); // chiude tutte le sessioni esistenti
      await persist();
      return send(res, 200, { ok: true });
    }

    case '/api/auth/verify': {
      const rec = consumeToken(body.token, 'verify');
      store.accounts[rec.userId].emailVerified = true;
      await persist();
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/weather') {
    if (limited(`wx:${ip}`, 60, 60_000)) throw new AppError('rate_limited', 'Troppe richieste meteo: attendi un momento.');
    return send(res, 200, await forecast(weather, Number(body.lat), Number(body.lng), String(body.startsAt ?? '')));
  }

  // ---- da qui servono credenziali valide: l'identità viene SOLO dal cookie di sessione ----
  const publicCall = pathname === '/api/call' && PUBLIC_METHODS.has(String(body.method ?? '') as MethodName);
  if ((['/api/auth/', '/api/strava/', '/api/geo/', '/api/ai/'].some((p) => pathname.startsWith(p)) || pathname === '/api/call') && !publicCall) {
    if (!userId) throw new AppError('unauthenticated', 'Sessione scaduta o assente. Accedi di nuovo.');
  }

  switch (pathname) {
    case '/api/auth/account': {
      const a = store.accounts[userId!];
      return send(res, 200, { email: a.email, emailVerified: a.emailVerified, hasPassword: !!a.hash, google: !!a.google, apple: !!a.apple, mailEnabled: mailEnabled(mail) });
    }
    case '/api/auth/resend-verification': {
      if (!mailEnabled(mail)) throw new AppError('unavailable', 'L\'invio email non è configurato su questo server.');
      if (limited(`resend:${userId}`, 3, 3_600_000)) throw new AppError('rate_limited', 'Hai già richiesto più email. Riprova più tardi.');
      if (store.accounts[userId!].emailVerified) return send(res, 200, { ok: true });
      await sendVerification(userId!).catch(() => { throw new AppError('unavailable', 'Invio email non riuscito. Riprova tra poco.'); });
      return send(res, 200, { ok: true });
    }
    case '/api/auth/change-password': {
      const acc = store.accounts[userId!];
      if (acc.hash && !(await verifyPassword(String(body.current ?? ''), acc))) throw fieldErr('current', 'Password attuale non corretta.');
      const errors = validateEmailPassword('a@b.it', body.password);
      if (errors.password) throw fieldErr('password', errors.password);
      Object.assign(acc, await hashPassword(String(body.password)));
      dropSessions(userId!, token ? sha(token) : null);
      await persist();
      return send(res, 200, { ok: true });
    }
    case '/api/auth/delete': {
      const acc = store.accounts[userId!];
      if (acc.hash) {
        if (!(await verifyPassword(String(body.password ?? ''), acc))) throw new AppError('forbidden', 'Password non corretta.');
      } else if (String(body.confirm ?? '') !== 'ELIMINA') throw new AppError('forbidden', 'Scrivi ELIMINA per confermare.');
      if (acc.strava && strava.enabled) await deauthorize(strava, acc.strava);
      deleteAccount({ db: store.db, now: new Date(), actorId: userId } as Ctx);
      delete store.accounts[userId!];
      dropSessions(userId!);
      for (const [k, t] of Object.entries(store.tokens)) if (t.userId === userId) delete store.tokens[k];
      await persist();
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, null) });
    }
    case '/api/strava/status':
      return send(res, 200, stravaPublicStatus(strava, store.accounts[userId!].strava));

    case '/api/strava/connect': {
      if (!strava.enabled) throw new AppError('unavailable', strava.reason ?? 'Integrazione Strava non attiva.');
      return send(res, 200, { url: authorizeUrl(strava, userId!) });
    }

    case '/api/strava/zones': {
      const link = store.accounts[userId!].strava;
      if (!strava.enabled || !link) return send(res, 200, { zones: null, needsReconnect: true });
      const result = await fetchHeartZones(strava, link);
      await persist();
      return send(res, 200, result);
    }
    case '/api/strava/streams': {
      // Serie (cuore, altitudine, cadenza) di un MIO racconto nato da Strava; mai di altri.
      const acc = store.accounts[userId!];
      const log = store.db.workoutLogs[String(body.logId ?? '')];
      if (!log || log.userId !== userId) throw new AppError('not_found', 'Attività non trovata.');
      const act = log.activityId ? store.db.activities[log.activityId] : null;
      if (!strava.enabled || !acc.strava || !act || act.source !== 'strava' || !act.externalId) return send(res, 200, { streams: null });
      try {
        const streams = await fetchStreams(strava, acc.strava, act.externalId.replace(/^strava:/, ''), act.sport);
        return send(res, 200, { streams });
      } catch {
        return send(res, 200, { streams: null, unavailable: true });
      }
    }
    case '/api/strava/sync': {
      if (!strava.enabled) throw new AppError('unavailable', strava.reason ?? 'Integrazione Strava non attiva.');
      const acc = store.accounts[userId!];
      if (!acc.strava) throw new AppError('bad_request', 'Strava non è collegato.');
      if (SYNC_COOLDOWN_MS > 0 && limited(`stravasync:${userId}`, 1, SYNC_COOLDOWN_MS)) throw new AppError('rate_limited', 'Hai sincronizzato da poco. Riprova tra qualche minuto (Strava limita le richieste).');
      const summary = await syncActivities(strava, acc.strava, store.db, userId!);
      acc.strava.lastSync = summary;
      await persist();
      return send(res, 200, { summary, status: stravaPublicStatus(strava, acc.strava) });
    }

    case '/api/strava/disconnect': {
      const acc = store.accounts[userId!];
      if (acc.strava && strava.enabled) await deauthorize(strava, acc.strava);
      delete acc.strava;
      let deleted = 0;
      if (body.deleteData !== false) {
        for (const a of Object.values(store.db.activities)) if (a.userId === userId && a.source === 'strava') { delete store.db.activities[a.id]; deleted++; }
        for (const l of Object.values(store.db.workoutLogs)) if (l.userId === userId && l.origin === 'strava') delete store.db.workoutLogs[l.id];
      }
      await persist();
      return send(res, 200, { ok: true, deleted, status: stravaPublicStatus(strava, undefined) });
    }

    case '/api/geo/search': {
      if (limited(`geo:${userId}`, 15, 60_000)) throw new AppError('rate_limited', 'Troppe ricerche: attendi un momento.');
      return send(res, 200, await geocode(geo, String(body.q ?? '')));
    }

    case '/api/geo/route': {
      if (limited(`route:${userId}`, 6, 60_000)) throw new AppError('rate_limited', 'Troppi calcoli di percorso: attendi un momento.');
      return send(res, 200, await routeFn(geo, body.points as never));
    }

    case '/api/ai/status':
      return send(res, 200, aiStatus(ai, store.ai, userId!));

    case '/api/ai/chat': {
      if (!ai.enabled) throw new AppError('unavailable', ai.reason ?? 'Coach AI non disponibile.');
      const prompt = typeof body.prompt === 'string' ? body.prompt.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '';
      const preset = (typeof body.preset === 'string' && body.preset in PRESETS ? body.preset : 'free') as Preset;
      if (prompt.length > 500) throw new AppError('validation', 'Scrivi al massimo 500 caratteri.', { prompt: 'Scrivi al massimo 500 caratteri.' });
      if (preset === 'free' && prompt.length < 5) throw new AppError('validation', 'Scrivi cosa ti serve.', { prompt: 'Scrivi cosa ti serve.' });
      if (aiBusy.has(userId!)) throw new AppError('rate_limited', 'Hai già una richiesta in corso.');
      if (limited(`aigap:${userId}`, 1, 5_000)) throw new AppError('rate_limited', 'Attendi qualche secondo tra una richiesta e l\'altra.');
      const useData = body.useData === true;
      aiBusy.add(userId!);
      try {
        reserve(ai, store.ai, userId!);
        await persist();
        try {
          const out = await callWorker(ai, buildMessages(preset, prompt, useData ? buildContext(store.db, userId!) : null));
          return send(res, 200, { text: out.text, generic: !useData, simulated: out.simulated, remaining: aiStatus(ai, store.ai, userId!).remaining });
        } catch (e) {
          refund(store.ai, userId!); // la richiesta fallita non consuma la quota dell'utente
          await persist();
          throw e;
        }
      } finally {
        aiBusy.delete(userId!);
      }
    }

    case '/api/ai/brief': {
      // Briefing dopo un allenamento: se il Coach AI non c'è o la quota è finita, resta il riepilogo calcolato con regole fisse.
      const log = store.db.workoutLogs[String(body.logId ?? '')];
      if (!log || log.userId !== userId) throw new AppError('not_found', 'Allenamento non trovato.');
      if (log.brief && body.refresh !== true) return send(res, 200, { brief: log.brief, facts: analyzeWorkout(store.db, log), remaining: aiStatus(ai, store.ai, userId!).remaining });
      if (limited(`aibrief:${userId}`, 6, 60_000)) throw new AppError('rate_limited', 'Attendi un momento prima di rigenerare il briefing.');
      const facts = analyzeWorkout(store.db, log);
      let brief = { text: factsToText(facts), at: new Date().toISOString(), ai: false };
      if (ai.enabled && !aiBusy.has(userId!) && aiStatus(ai, store.ai, userId!).remaining > 0 && aiStatus(ai, store.ai, userId!).serviceAvailable) {
        aiBusy.add(userId!);
        try {
          reserve(ai, store.ai, userId!);
          try {
            const out = await callWorker(ai, buildMessages('workout_brief', '', factsToContext(facts)));
            brief = { text: out.text, at: brief.at, ai: !out.simulated };
          } catch {
            refund(store.ai, userId!); // se l'AI non risponde, la quota non si consuma e si usa il riepilogo automatico
          }
        } finally {
          aiBusy.delete(userId!);
        }
      }
      log.brief = brief;
      await persist();
      return send(res, 200, { brief, facts, remaining: aiStatus(ai, store.ai, userId!).remaining });
    }

    case '/api/call': {
      const method = String(body.method ?? '');
      const args = Array.isArray(body.args) ? body.args : [];
      const ctx: Ctx = { db: store.db, now: new Date(), actorId: userId };
      const result = call(ctx, method, args);
      if (!READ_ONLY_METHODS.has(method) || ctx.dirty) await persist();
      return send(res, 200, { result: result === undefined ? null : result });
    }
  }
  return send(res, 404, { error: { code: 'not_found', message: 'Endpoint inesistente.' } });
}

/* ---------- file statici (build del client) ---------- */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = '/';
  }
  let file = resolve(join(STATIC_DIR, rel));
  const inside = file === STATIC_DIR || file.startsWith(STATIC_DIR + sep);
  const isFile = inside && existsSync(file) && statSync(file).isFile();
  const spa = !isFile;
  if (spa) {
    if (extname(rel) && extname(rel) !== '.html') {
      res.writeHead(404, SECURITY_HEADERS);
      return res.end('Not found');
    }
    file = join(STATIC_DIR, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Build del client assente: esegui "npm run build".');
  }
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((err) => fail(res, err));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`RUNNGO API pronta su http://${HOST}:${PORT} (dati: ${DATA_FILE})`);
});

// All'arresto (es. Cloud Run) si attende l'ultimo salvataggio in corso.
const stop = () => server.close(() => void flushing.finally(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
