import { appendFileSync } from 'node:fs';

export interface MailConfig {
  provider: 'resend' | 'outbox' | 'none';
  from: string;
  apiKey: string;
  outboxFile: string;
  /** URL pubblico dell'app, usato nei link delle email (mai ricavato dall'header Host). */
  appUrl: string;
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv, port: number): MailConfig {
  const production = env.NODE_ENV === 'production';
  let provider: MailConfig['provider'] = 'none';
  if (env.RESEND_API_KEY) provider = 'resend';
  else if (env.MAIL_PROVIDER === 'outbox' && !production) provider = 'outbox'; // solo sviluppo/test
  const appUrl = (env.APP_URL || (production ? '' : `http://localhost:${port}`)).replace(/\/$/, '');
  if (!appUrl) provider = 'none'; // senza URL pubblico non si possono generare link sicuri
  return { provider, from: env.MAIL_FROM || 'PODISMO SOCIAL <onboarding@resend.dev>', apiKey: env.RESEND_API_KEY || '', outboxFile: env.MAIL_OUTBOX_FILE || '', appUrl };
}

export const mailEnabled = (c: MailConfig) => c.provider !== 'none';

export async function sendMail(c: MailConfig, m: { to: string; subject: string; text: string }): Promise<void> {
  if (c.provider === 'outbox') {
    appendFileSync(c.outboxFile, JSON.stringify({ ...m, at: new Date().toISOString() }) + '\n');
    return;
  }
  if (c.provider !== 'resend') throw new Error('Email non configurata');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: [m.to], subject: m.subject, text: m.text }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Invio email fallito (${res.status})`);
  } finally {
    clearTimeout(timer);
  }
}
