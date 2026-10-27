import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, linkToken, readOutbox, startServer, type Srv } from './helpers.ts';

let dir: string;
let srv: Srv;
let outbox: string;
const PORT = 8800 + Math.floor(Math.random() * 90);

const future = (h = 48) => new Date(Date.now() + h * 3_600_000).toISOString();
const evInput = (over: Record<string, unknown> = {}) => ({
  title: 'Corsa test', sport: 'running', startsAt: future(), timezone: 'Europe/Rome', meetingPlace: 'Ingresso palestra', area: 'Forlì',
  lat: null, lng: null, distanceKm: 8, paceSecPerKm: 330, level: 'medium', notes: '', maxParticipants: null, visibility: 'public', clubId: null, ...over,
});
const profileOf = (u: { displayName: string; username: string }, over: Record<string, unknown> = {}) => ({
  displayName: u.displayName, username: u.username, avatar: null, bio: '', sports: ['running'], area: '',
  privacy: { showStats: false, showClubs: true, showUpcoming: true, shareActivity: true }, ...over,
});

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'podismo-'));
  outbox = join(dir, 'outbox.jsonl');
  writeFileSync(outbox, '');
  srv = await startServer({ port: PORT, dataFile: join(dir, 'db.json'), outbox });
});
afterAll(async () => {
  await srv?.stop();
  rmSync(dir, { recursive: true, force: true });
});
const C = () => new Client(srv.base);

describe('Autenticazione', () => {
  it('health espone solo configurazione pubblica', async () => {
    const r = await fetch(`${srv.base}/api/health`);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, mode: 'server', emailEnabled: true, googleClientId: null, appleClientId: null });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('registrazione con email e password valide; rifiuta dati non validi', async () => {
    const bad = await C().post('/api/auth/register', { email: 'non-una-email', password: 'corta' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.json.error.fields).sort()).toEqual(['email', 'password']);
    const c = C();
    const reg = await c.post('/api/auth/register', { email: 'Mario@Example.com', password: 'password123' });
    expect(reg.status).toBe(200);
    expect(reg.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(reg.headers.get('set-cookie')).toMatch(/SameSite=Lax/);
    expect(reg.json.user.profileCompleted).toBe(false);
    // né email né segreti nella risposta
    expect(JSON.stringify(reg.json)).not.toMatch(/mario@example|password|hash|salt/i);
  });

  it('email duplicata (anche con maiuscole diverse) rifiutata', async () => {
    const r = await C().post('/api/auth/register', { email: 'MARIO@example.COM', password: 'password123' });
    expect(r.status).toBe(422);
    expect(r.json.error.fields.email).toMatch(/già/);
  });

  it('login, errori generici, logout e sessione persistente', async () => {
    const c = C();
    expect((await c.post('/api/auth/login', { email: 'mario@example.com', password: 'sbagliata1' })).status).toBe(401);
    const unknown = await c.post('/api/auth/login', { email: 'nessuno@example.com', password: 'password123' });
    const wrong = await c.post('/api/auth/login', { email: 'mario@example.com', password: 'sbagliata1' });
    expect(unknown.json.error.message).toBe(wrong.json.error.message); // nessuna enumerazione
    expect((await c.post('/api/auth/login', { email: 'mario@example.com', password: 'password123' })).status).toBe(200);
    expect((await c.call('me')).json.result.id).toMatch(/^usr_/);
    // la stessa sessione continua a funzionare in richieste successive (nessun nuovo login)
    expect((await c.call('getHome', new Date().toISOString())).status).toBe(200);
    await c.post('/api/auth/logout', {});
    expect((await c.call('me')).json.result).toBeNull();
    expect((await c.call('getHome', new Date().toISOString())).status).toBe(401);
    // il vecchio cookie non è più valido
    const stale = new Client(srv.base);
    stale.cookie = c.cookie;
    expect((await stale.call('me')).json.result).toBeNull();
  });

  it('username univoco e modifica solo del proprio profilo', async () => {
    const a = C();
    const b = C();
    const ua = await a.register('anna@example.com');
    const ub = await b.register('bruno@example.com');
    expect(ua.username).not.toBe(ub.username);
    const taken = await b.call('updateProfile', profileOf(ub, { username: ua.username }));
    expect(taken.status).toBe(422);
    expect(taken.json.error.fields.username).toMatch(/già in uso/);
    expect((await b.post('/api/auth/username-available', { username: ua.username })).json.available).toBe(false);
    expect((await b.post('/api/auth/username-available', { username: 'libero.nome' })).json.available).toBe(true);
    const ok = await a.call('updateProfile', profileOf(ua, { displayName: 'Anna Rossi', username: 'anna.rossi' }));
    expect(ok.json.result).toMatchObject({ username: 'anna.rossi', displayName: 'Anna Rossi', profileCompleted: true });
    // B prova a "farsi passare" per A inviando l'id/username di A: il server ignora e modifica solo B
    await b.call('updateProfile', { ...profileOf(ub, { displayName: 'Bruno B' }), id: ua.id, userId: ua.id });
    expect((await a.call('me')).json.result.displayName).toBe('Anna Rossi');
    expect((await b.call('me')).json.result.displayName).toBe('Bruno B');
  });

  it('recupero password: link monouso, sessioni chiuse, password nuova', async () => {
    const c = C();
    await c.register('recupero@example.com', 'vecchiapass1');
    expect((await c.call('me')).json.result).not.toBeNull();
    const before = readOutbox(outbox).length;
    const f = await C().post('/api/auth/forgot', { email: 'recupero@example.com' });
    expect(f.status).toBe(200);
    // account inesistente: stessa risposta, nessuna email
    expect((await C().post('/api/auth/forgot', { email: 'ignoto@example.com' })).json).toEqual({ ok: true });
    const mails = readOutbox(outbox).slice(before).filter((m) => /Reimposta/.test(m.subject));
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('recupero@example.com');
    const token = linkToken(mails[0].text);
    expect((await C().post('/api/auth/reset', { token: 'tokenfinto', password: 'nuovapass123' })).status).toBe(400);
    expect((await C().post('/api/auth/reset', { token, password: 'corta' })).status).toBe(422);
    expect((await C().post('/api/auth/reset', { token, password: 'nuovapass123' })).status).toBe(200);
    expect((await C().post('/api/auth/reset', { token, password: 'altra12345' })).status).toBe(400); // monouso
    expect((await c.call('me')).json.result).toBeNull(); // sessione precedente chiusa
    expect((await C().post('/api/auth/login', { email: 'recupero@example.com', password: 'vecchiapass1' })).status).toBe(401);
    expect((await C().post('/api/auth/login', { email: 'recupero@example.com', password: 'nuovapass123' })).status).toBe(200);
  });

  it('verifica email con token monouso', async () => {
    const c = C();
    await c.register('verifica@example.com');
    const mail = readOutbox(outbox).filter((m) => m.to === 'verifica@example.com' && /Conferma/.test(m.subject)).pop()!;
    expect((await c.post('/api/auth/account', {})).json.emailVerified).toBe(false);
    const token = linkToken(mail.text);
    expect((await C().post('/api/auth/verify', { token })).status).toBe(200);
    expect((await C().post('/api/auth/verify', { token })).status).toBe(400);
    expect((await c.post('/api/auth/account', {})).json).toMatchObject({ emailVerified: true, hasPassword: true, email: 'verifica@example.com' });
  });

  it('cambio password e eliminazione account (password richiesta)', async () => {
    const c = C();
    const u = await c.register('elimina@example.com', 'passwordvecchia');
    expect((await c.post('/api/auth/change-password', { current: 'sbagliata', password: 'passwordnuova1' })).status).toBe(422);
    expect((await c.post('/api/auth/change-password', { current: 'passwordvecchia', password: 'passwordnuova1' })).status).toBe(200);
    expect((await c.post('/api/auth/delete', { password: 'sbagliata' })).status).toBe(403);
    expect((await c.post('/api/auth/delete', { password: 'passwordnuova1' })).status).toBe(200);
    expect((await c.call('me')).json.result).toBeNull();
    expect((await C().post('/api/auth/login', { email: 'elimina@example.com', password: 'passwordnuova1' })).status).toBe(401);
    expect(u.id).toMatch(/^usr_/);
  });

  it('social login non configurato → errore esplicito, nessun account creato', async () => {
    const r = await C().post('/api/auth/google', { idToken: 'a.b.c' });
    expect(r.status).toBe(503);
    expect(r.json.error.message).toMatch(/non è configurato/);
    expect((await C().post('/api/auth/apple', { idToken: 'a.b.c' })).status).toBe(503);
  });
});

describe('Autorizzazione e protezione dati', () => {
  it('richiede sessione per le operazioni private, rifiuta metodi e origini estranee', async () => {
    const anon = C();
    for (const m of ['createEvent', 'joinEvent', 'getHome', 'getProfile', 'listNotifications', 'updateProfile', 'deleteAccount'])
      expect((await anon.call(m, evInput())).status, m).toBe(401);
    expect((await anon.post('/api/auth/account', {})).status).toBe(401);
    expect((await anon.post('/api/auth/delete', { password: 'x' })).status).toBe(401);
    const u = C();
    await u.register('tester@example.com');
    expect((await u.call('__proto__')).status).toBe(400);
    expect((await u.call('constructor')).status).toBe(400);
    const evil = await fetch(`${srv.base}/api/call`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: u.cookie }, body: JSON.stringify({ method: 'me', args: [] }) });
    expect(evil.status).toBe(403);
    const txt = await fetch(`${srv.base}/api/call`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: u.cookie }, body: '{}' });
    expect(txt.status).toBe(415);
    const forged = new Client(srv.base);
    forged.cookie = 'ps_session=cookie-inventato';
    expect((await forged.call('getHome', new Date().toISOString())).status).toBe(401);
  });

  it('nessuna email né credenziale compare nelle viste degli altri utenti', async () => {
    const a = C();
    const b = C();
    const ua = await a.register('privata.a@example.com');
    await b.register('privata.b@example.com');
    const ev = (await a.call('createEvent', evInput())).json.result;
    await b.call('joinEvent', ev.id);
    const views = [
      (await b.call('getEvent', ev.id)).json,
      (await b.call('getProfile', ua.id)).json,
      (await b.call('listEvents', {})).json,
      (await b.call('getFeed')).json,
    ];
    expect(JSON.stringify(views)).not.toMatch(/@example\.com|passwordhash|"salt"|"hash"/i);
  });

  it('non si possono modificare o eliminare i dati di un altro utente', async () => {
    const a = C();
    const b = C();
    await a.register('dati.a@example.com');
    await b.register('dati.b@example.com');
    const act = (await a.call('logActivity', { date: new Date(Date.now() - 3600_000).toISOString(), sport: 'running', distanceKm: 5, durationMin: 30, note: '' })).json.result;
    expect((await b.call('deleteActivity', act.id)).status).toBe(403);
    const ev = (await a.call('createEvent', evInput())).json.result;
    expect((await b.call('updateEvent', ev.id, evInput({ title: 'Hack' }), 1)).status).toBe(403);
    expect((await b.call('cancelEvent', ev.id)).status).toBe(403);
    expect((await b.call('getProfile', (await a.call('me')).json.result.id)).json.result.activities).toBeNull();
  });

  it('crea, partecipa senza doppioni, ritira, e solo l\'organizzatore annulla', async () => {
    const a = C();
    const b = C();
    await a.register('orga1@example.com');
    await b.register('amico1@example.com');
    const id = (await a.call('createEvent', evInput())).json.result.id;
    for (let i = 0; i < 3; i++) expect((await b.call('joinEvent', id)).status).toBe(200);
    expect((await b.call('getEvent', id)).json.result.participantCount).toBe(2);
    expect((await b.call('leaveEvent', id)).json.result.participantCount).toBe(1);
    expect((await a.call('cancelEvent', id)).json.result.status).toBe('cancelled');
    expect((await b.call('joinEvent', id)).json.error.code).toBe('cancelled');
    const invalid = await a.call('createEvent', evInput({ title: '', startsAt: '2001-01-01T00:00:00Z' }));
    expect(invalid.status).toBe(422);
  });

  it('l\'ultimo posto va a una sola persona anche con richieste simultanee', async () => {
    const a = C();
    await a.register('orga2@example.com');
    const id = (await a.call('createEvent', evInput({ maxParticipants: 3 }))).json.result.id;
    const people = await Promise.all(Array.from({ length: 8 }, async (_, i) => { const c = C(); await c.register(`runner${i}@example.com`); return c; }));
    const results = await Promise.all(people.map((c) => c.call('joinEvent', id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.json.error?.code === 'full')).toHaveLength(6);
    expect((await a.call('getEvent', id)).json.result.participantCount).toBe(3);
  });

  it('club con codice e uscite private con token', async () => {
    const a = C();
    const b = C();
    await a.register('capo1@example.com');
    await b.register('socio1@example.com');
    const club = (await a.call('createClub', { name: 'Palestra Forte', description: '', sport: 'running', area: 'Forlì', imageDataUrl: null })).json.result;
    expect((await b.call('getClub', club.id)).status).toBe(404);
    expect((await b.call('joinClub', 'ZZZZ-ZZZZ')).status).toBe(404);
    expect((await b.call('joinClub', club.inviteCode)).json.result.memberCount).toBe(2);
    const priv = (await a.call('createEvent', evInput({ visibility: 'private' }))).json.result;
    const c = C();
    await c.register('esterno1@example.com');
    expect((await c.call('getEvent', priv.id)).status).toBe(404);
    expect((await c.call('joinEvent', priv.id, priv.inviteToken)).status).toBe(200);
  });
});

describe('Sessione persistente al riavvio del server', () => {
  it('il cookie resta valido dopo il riavvio e i dati sono conservati', async () => {
    const d = mkdtempSync(join(tmpdir(), 'podismo-restart-'));
    const file = join(d, 'db.json');
    const port = PORT + 91;
    let s = await startServer({ port, dataFile: file });
    const c = new Client(s.base);
    const u = await c.register('persist@example.com');
    await c.call('updateProfile', profileOf(u, { displayName: 'Persistente', username: 'persistente' }));
    await s.stop();
    s = await startServer({ port, dataFile: file });
    const again = new Client(s.base);
    again.cookie = c.cookie;
    const me = (await again.call('me')).json.result;
    expect(me).toMatchObject({ id: u.id, displayName: 'Persistente', username: 'persistente' });
    expect((await new Client(s.base).post('/api/auth/login', { email: 'persist@example.com', password: 'password123' })).status).toBe(200);
    await s.stop();
    rmSync(d, { recursive: true, force: true });
  });

  it('senza email configurata il recupero password dichiara di non essere disponibile', async () => {
    const d = mkdtempSync(join(tmpdir(), 'podismo-nomail-'));
    const s = await startServer({ port: PORT + 92, dataFile: join(d, 'db.json'), env: { NODE_ENV: 'production', APP_URL: '' } });
    expect((await (await fetch(`${s.base}/api/health`)).json()).emailEnabled).toBe(false);
    const r = await new Client(s.base).post('/api/auth/forgot', { email: 'x@example.com' });
    expect(r.status).toBe(503);
    expect(r.json.error.message).toMatch(/non è configurato/);
    await s.stop();
    rmSync(d, { recursive: true, force: true });
  });
});
