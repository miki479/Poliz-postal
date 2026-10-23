const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Identificatore casuale stabile e non indovinabile, con prefisso leggibile. */
export function newId(prefix: string): string {
  let out = '';
  for (const b of randomBytes(12)) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Codice d'invito breve e facile da dettare (senza caratteri ambigui). */
export function newInviteCode(): string {
  let out = '';
  for (const b of randomBytes(8)) out += ALPHABET[b % ALPHABET.length].toUpperCase();
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeInviteCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function newToken(): string {
  let out = '';
  for (const b of randomBytes(16)) out += ALPHABET[b % ALPHABET.length];
  return out;
}
