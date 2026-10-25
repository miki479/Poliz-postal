import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, startServer, type Srv } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'runngo-google-'));
const port = 18000 + Math.floor(Math.random() * 2000);
let server: Srv;
let unavailable: Srv;
beforeAll(async () => {
  server = await startServer({ port, dataFile: join(dir, 'google.json'), env: { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' } });
  unavailable = await startServer({ port: port + 1, dataFile: join(dir, 'no-google.json'), env: { GOOGLE_CLIENT_ID: '' } });
});
afterAll(async () => {
  await server?.stop(); await unavailable?.stop(); rmSync(dir, { recursive: true, force: true });
});

describe('Google mobile via HTTP', () => {
  it('separa browser e client: il polling non crea sessioni prima del consenso', async () => {
    const client = new Client(server.base);
    const start = await client.post('/api/auth/google/mobile/start', {});
    expect(start.status).toBe(200); expect(start.headers.get('cache-control')).toBe('no-store');
    expect(start.json.path).not.toContain(start.json.pollToken);
    const fragment = new URLSearchParams(start.json.path.split('#')[1]);
    const context = await client.post('/api/auth/google/mobile/context', { id: start.json.id, browserToken: fragment.get('key') });
    expect(context.json.clientId).toBe('test.apps.googleusercontent.com');
    expect(context.json.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    const pending = await client.post('/api/auth/google/mobile/poll', { id: start.json.id, pollToken: start.json.pollToken });
    expect(pending.json).toEqual({ status: 'pending' }); expect(client.cookie).toBe('');
    expect((await client.post('/api/auth/google/mobile/poll', { id: start.json.id, pollToken: fragment.get('key') })).status).toBe(404);
    await client.post('/api/auth/google/mobile/cancel', { id: start.json.id, pollToken: start.json.pollToken });
    expect((await client.post('/api/auth/google/mobile/context', { id: start.json.id, browserToken: fragment.get('key') })).status).toBe(404);
  });
  it('rifiuta credenziali non firmate e richieste da altre origini', async () => {
    const client = new Client(server.base);
    const start = (await client.post('/api/auth/google/mobile/start', {})).json;
    const fragment = new URLSearchParams(start.path.split('#')[1]);
    const unsigned = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.e30.';
    const complete = await client.post('/api/auth/google/mobile/complete', { id: start.id, browserToken: fragment.get('key'), idToken: unsigned });
    expect(complete.status).toBe(401); expect(client.cookie).toBe('');
    expect((await client.post('/api/auth/google/mobile/poll', { id: start.id, pollToken: start.pollToken })).status).toBe(404);
    expect((await client.post('/api/auth/google/mobile/start', {}, { Origin: 'https://evil.invalid' })).status).toBe(403);
  });
  it('la pagina usa GIS ufficiale, header sicuri e testi italiani', async () => {
    const page = await fetch(server.base + '/api/auth/google/mobile/page');
    expect(page.headers.get('content-security-policy')).toContain('https://accounts.google.com/gsi/');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    const html = await page.text(); expect(html).toContain('lang="it"'); expect(html).toContain('https://accounts.google.com/gsi/client');
    const js = await (await fetch(server.base + '/api/auth/google/mobile/client.js')).text();
    expect(js).toContain('nonce:context.nonce'); expect(js).not.toContain('pollToken');
  });
  it('configurazione mancante: messaggio comprensibile, nessun accesso fittizio', async () => {
    const client = new Client(unavailable.base);
    const result = await client.post('/api/auth/google/mobile/start', {});
    expect(result.status).toBe(503); expect(result.json.error.message).toContain('Puoi usare email e password');
  });
});
