import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Cache a scadenza con dimensione massima (rimuove le voci più vecchie). */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  private max: number;
  private ttl: number;
  constructor(max: number, ttlMs: number) {
    this.max = max;
    this.ttl = ttlMs;
  }
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.m.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { v, exp: Date.now() + this.ttl });
  }
}

/** Serializza le chiamate lasciando almeno `gapMs` tra una partenza e la successiva (es. 1 richiesta/secondo). */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  private gap: number;
  constructor(gapMs: number) {
    this.gap = gapMs;
  }
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(async () => {
      const wait = this.last + this.gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.tail = p.catch(() => {});
    return p;
  }
}

/** Contatore giornaliero (giorno UTC): serve a restare entro le quote gratuite dei servizi esterni. */
export class DailyCap {
  private day = '';
  private n = 0;
  private cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }
  take(): boolean {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.n = 0;
    }
    if (this.n >= this.cap) return false;
    this.n++;
    return true;
  }
  get used() {
    return this.n;
  }
}

/* ---------- cifratura dei token a riposo (AES-256-GCM) ---------- */

export function parseKey(b64: string | undefined): Buffer | null {
  if (!b64) return null;
  const k = Buffer.from(b64, 'base64');
  return k.length === 32 ? k : null;
}

export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function unseal(key: Buffer, sealed: string): string {
  const [iv, tag, enc] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/* ---------- firma di valori a breve scadenza (state OAuth, richieste al Worker) ---------- */

export function hmac(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** fetch con timeout: nessuna chiamata esterna resta appesa. */
export async function fetchT(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
