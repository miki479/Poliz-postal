import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GOOGLE, verifyIdToken, type FetchLike } from '../server/oidc.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const fakeFetch: FetchLike = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function sign(claims: Record<string, unknown>, key = privateKey, kid = 'k1') {
  const data = `${b64({ alg: 'RS256', kid })}.${b64(claims)}`;
  const sig = createSign('RSA-SHA256').update(data).sign(key).toString('base64url');
  return `${data}.${sig}`;
}
const now = Date.now();
const good = { iss: 'https://accounts.google.com', aud: 'client-123', sub: 'sub-1', email: 'Mario@Example.com', email_verified: true, exp: Math.floor(now / 1000) + 600, iat: Math.floor(now / 1000) - 5 };
const P = GOOGLE('client-123');

describe('verifica ID token (Google/Apple)', () => {
  it('accetta un token valido', async () => {
    expect(await verifyIdToken(sign(good), P, fakeFetch, now)).toMatchObject({ sub: 'sub-1', email: 'mario@example.com', emailVerified: true });
  });
  it('restituisce solo il nonce firmato, per legare l’accesso al tentativo mobile', async () => {
    expect((await verifyIdToken(sign({ ...good, nonce: 'attempt-nonce' }), P, fakeFetch, now)).nonce).toBe('attempt-nonce');
    expect((await verifyIdToken(sign(good), P, fakeFetch, now)).nonce).toBeUndefined();
  });
  it('rifiuta firma errata, audience, emittente, scadenza e algoritmo', async () => {
    await expect(verifyIdToken(sign(good, other.privateKey), P, fakeFetch, now)).rejects.toThrow(/Firma/);
    await expect(verifyIdToken(sign({ ...good, aud: 'altro-client' }), P, fakeFetch, now)).rejects.toThrow(/Destinatario/);
    await expect(verifyIdToken(sign({ ...good, iss: 'https://evil.example' }), P, fakeFetch, now)).rejects.toThrow(/Emittente/);
    await expect(verifyIdToken(sign({ ...good, exp: Math.floor(now / 1000) - 10 }), P, fakeFetch, now)).rejects.toThrow(/scaduto/);
    await expect(verifyIdToken(sign(good, privateKey, 'sconosciuta'), P, fakeFetch, now)).rejects.toThrow(/Chiave/);
    const none = `${b64({ alg: 'none' })}.${b64(good)}.`;
    await expect(verifyIdToken(none, P, fakeFetch, now)).rejects.toThrow(/Algoritmo/);
    await expect(verifyIdToken('non.un.jwt.valido', P, fakeFetch, now)).rejects.toThrow();
  });
});
