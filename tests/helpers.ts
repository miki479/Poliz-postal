import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

export interface Srv {
  proc: ChildProcess;
  base: string;
  stop(): Promise<void>;
}

export async function startServer(opts: { port: number; dataFile: string; outbox?: string; env?: Record<string, string> }): Promise<Srv> {
  const base = `http://127.0.0.1:${opts.port}`;
  const proc = spawn('node', ['--experimental-strip-types', '--no-warnings', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: String(opts.port),
      HOST: '127.0.0.1',
      DATA_FILE: opts.dataFile,
      STATIC_DIR: '/nonexistent',
      REGISTER_LIMIT_PER_HOUR: '1000',
      APP_URL: base,
      ...(opts.outbox ? { MAIL_PROVIDER: 'outbox', MAIL_OUTBOX_FILE: opts.outbox } : {}),
      ...opts.env,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        return {
          proc,
          base,
          stop: () =>
            new Promise((res) => {
              proc.once('exit', () => res());
              proc.kill();
            }),
        };
      }
    } catch {
      /* attende l'avvio */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('server non avviato');
}

export class Client {
  cookie = '';
  base: string;
  constructor(base: string) {
    this.base = base;
  }
  async post(path: string, body: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: this.cookie, ...headers }, body: JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, json: (await res.json()) as any, headers: res.headers };
  }
  call(method: string, ...args: unknown[]) {
    return this.post('/api/call', { method, args });
  }
  async register(email: string, password = 'password123') {
    const r = await this.post('/api/auth/register', { email, password });
    if (r.status !== 200) throw new Error(`register ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.user as { id: string; username: string; displayName: string };
  }
}

export function readOutbox(file: string): Array<{ to: string; subject: string; text: string }> {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

export function linkToken(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error('nessun token nel messaggio');
  return m[1];
}
