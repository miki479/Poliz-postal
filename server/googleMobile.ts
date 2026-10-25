import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../shared/engine.ts';

interface Attempt {
  pollHash: string; browserHash: string; nonce: string; expires: number;
  state: 'pending' | 'verifying' | 'complete'; userId?: string;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const matches = (value: unknown, expected: string) => typeof value === 'string' && timingSafeEqual(Buffer.from(hash(value), 'hex'), Buffer.from(expected, 'hex'));

/** Credenziali temporanee solo in memoria; il browser non riceve il segreto del client nativo. */
export class GoogleMobileAttempts {
  private attempts = new Map<string, Attempt>();
  begin(now = Date.now()) {
    for (const [id, attempt] of this.attempts) if (attempt.expires <= now) this.attempts.delete(id);
    if (this.attempts.size >= 200) throw new AppError('rate_limited', 'Troppi accessi in corso. Riprova tra poco.');
    const id = randomBytes(16).toString('hex');
    const pollToken = randomBytes(32).toString('base64url');
    const browserToken = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    this.attempts.set(id, { pollHash: hash(pollToken), browserHash: hash(browserToken), nonce, expires: now + 300_000, state: 'pending' });
    return { id, pollToken, browserToken, expiresAt: now + 300_000 };
  }
  private get(id: unknown, now: number): Attempt {
    const a = typeof id === 'string' ? this.attempts.get(id) : undefined;
    if (!a || a.expires <= now) {
      if (typeof id === 'string') this.attempts.delete(id);
      throw new AppError('not_found', 'Accesso scaduto. Torna nell’app e riprova.');
    }
    return a;
  }
  browser(id: unknown, secret: unknown, now = Date.now()) {
    const a = this.get(id, now);
    if (!matches(secret, a.browserHash) || a.state !== 'pending') throw new AppError('not_found', 'Accesso non disponibile. Riprova dall’app.');
    return a.nonce;
  }
  async complete(id: unknown, secret: unknown, verify: (nonce: string) => Promise<string>, now = Date.now()): Promise<void> {
    const a = this.get(id, now);
    const nonce = this.browser(id, secret, now);
    a.state = 'verifying';
    try {
      const userId = await verify(nonce);
      if (a.expires <= Date.now()) throw new AppError('not_found', 'Accesso scaduto. Riprova dall’app.');
      a.userId = userId; a.state = 'complete';
    } catch (e) {
      this.attempts.delete(String(id));
      throw e;
    }
  }
  poll(id: unknown, secret: unknown, now = Date.now()): string | null {
    const a = this.get(id, now);
    if (!matches(secret, a.pollHash)) throw new AppError('not_found', 'Accesso non disponibile. Riprova.');
    if (a.state !== 'complete') return null;
    this.attempts.delete(String(id));
    return a.userId!;
  }
  cancel(id: unknown, secret: unknown, now = Date.now()) {
    const a = this.get(id, now);
    if (!matches(secret, a.pollHash)) throw new AppError('not_found', 'Accesso non disponibile.');
    this.attempts.delete(String(id));
  }
}

/** Pagina HTTPS nel browser di sistema: usa il pulsante ufficiale Google e non trasporta ID token nell'URL. */
export const GOOGLE_MOBILE_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accedi a Runngo</title><style>body{margin:0;background:#101418;color:#f6f7f9;font:17px system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:360px;padding:28px;text-align:center}h1{font-size:30px}p{line-height:1.5;color:#b6bec8}#google{display:flex;justify-content:center;margin:28px 0}</style><script src="https://accounts.google.com/gsi/client" defer></script><script src="/api/auth/google/mobile/client.js" defer></script></head><body><main><h1>RUNNGO</h1><p id="message" role="status">Scegli il tuo account Google per continuare.</p><div id="google"></div><p>Dopo l’accesso chiudi questa pagina e torna nell’app.</p></main></body></html>`;

export const GOOGLE_MOBILE_JS = `(async () => {
  const message = document.getElementById('message');
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('id'); const browserToken = params.get('key');
  history.replaceState(null, '', location.pathname);
  async function post(path, body) {
    const res = await fetch(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!res.ok) throw new Error('Accesso non riuscito. Chiudi la pagina e riprova dall’app.');
    return res.json();
  }
  try {
    const context = await post('/api/auth/google/mobile/context', {id,browserToken});
    if (!window.google) throw new Error('Google non è raggiungibile. Riprova tra poco.');
    google.accounts.id.initialize({client_id:context.clientId,nonce:context.nonce,auto_select:false,callback:async response => {
      message.textContent = 'Completo l’accesso…';
      try {
        await post('/api/auth/google/mobile/complete', {id,browserToken,idToken:response.credential});
        document.getElementById('google').replaceChildren();
        message.textContent = 'Accesso riuscito. Chiudi questa pagina per tornare a Runngo.';
      } catch { message.textContent = 'Non riesco a completare l’accesso. Torna nell’app e riprova.'; }
    }});
    google.accounts.id.renderButton(document.getElementById('google'),{theme:'filled_black',size:'large',text:'continue_with',locale:'it',shape:'pill',width:300});
  } catch { message.textContent = 'Google non è raggiungibile. Torna nell’app e riprova tra poco.'; }
})();`;
