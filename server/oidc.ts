/** Verifica di ID token OpenID Connect (Google, Apple) con le chiavi pubbliche del provider. */
import { createPublicKey, verify } from 'node:crypto';

interface Jwk {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}
export interface OidcClaims {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}
export interface OidcProvider {
  jwksUrl: string;
  issuers: string[];
  audience: string;
}

export const GOOGLE = (audience: string): OidcProvider => ({ jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], audience });
export const APPLE = (audience: string): OidcProvider => ({ jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audience });

const cache = new Map<string, { keys: Jwk[]; at: number }>();
export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

async function getKeys(url: string, f: FetchLike, force = false): Promise<Jwk[]> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < 3_600_000) return hit.keys;
  const res = await f(url);
  if (!res.ok) throw new Error('JWKS non disponibile');
  const keys = ((await res.json()) as { keys: Jwk[] }).keys;
  cache.set(url, { keys, at: Date.now() });
  return keys;
}

const b64 = (s: string) => Buffer.from(s, 'base64url');

export async function verifyIdToken(token: string, p: OidcProvider, f: FetchLike = (u) => fetch(u) as never, now = Date.now()): Promise<OidcClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token non valido');
  const header = JSON.parse(b64(parts[0]).toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error('Algoritmo non supportato');
  let keys = await getKeys(p.jwksUrl, f);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getKeys(p.jwksUrl, f, true); // le chiavi ruotano
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('Chiave sconosciuta');
  const key = createPublicKey({ key: jwk as never, format: 'jwk' });
  const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
  if (!ok) throw new Error('Firma non valida');
  const c = JSON.parse(b64(parts[1]).toString('utf8')) as Record<string, unknown>;
  if (typeof c.exp !== 'number' || c.exp * 1000 < now) throw new Error('Token scaduto');
  if (typeof c.iat === 'number' && c.iat * 1000 > now + 120_000) throw new Error('Token non ancora valido');
  if (!p.issuers.includes(String(c.iss))) throw new Error('Emittente non valido');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(p.audience)) throw new Error('Destinatario non valido');
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('Token senza soggetto');
  return {
    sub: c.sub,
    email: typeof c.email === 'string' ? c.email.toLowerCase() : undefined,
    emailVerified: c.email_verified === true || c.email_verified === 'true',
    name: typeof c.name === 'string' ? c.name : undefined,
  };
}
