/**
 * Cloudflare Worker dedicato al Coach AI (Workers AI).
 * - Accetta SOLO richieste firmate dal server di PODISMO SOCIAL (HMAC-SHA256 + timestamp ≤ 60 s).
 * - Non riceve né verifica credenziali utente: l'identità e le quote per account sono gestite dal server.
 * - Valida e limita input e output; usa il modello configurato in AI_MODEL.
 * Segreti: SHARED_SECRET (wrangler secret put SHARED_SECRET). Nessuna chiave nel codice o nel frontend.
 */

interface AiBinding {
  run(model: string, input: { messages: Array<{ role: string; content: string }>; max_tokens?: number }): Promise<{ response?: string } | string>;
}

export interface Env {
  AI: AiBinding;
  SHARED_SECRET: string;
  AI_MODEL?: string;
  MAX_TOKENS_CAP?: string;
}

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_BODY = 8 * 1024;
const MAX_AGE_S = 60;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!env.SHARED_SECRET) return json({ error: 'not_configured' }, 503);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    const ts = Number(req.headers.get('X-Timestamp'));
    const sig = req.headers.get('X-Signature') ?? '';
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_S) return json({ error: 'expired' }, 401);
    if (!equal(await hmacHex(env.SHARED_SECRET, `${ts}.${raw}`), sig)) return json({ error: 'bad_signature' }, 401);

    let body: { messages?: Array<{ role?: string; content?: string }>; maxTokens?: number };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    const msgs = body.messages;
    if (!Array.isArray(msgs) || msgs.length < 1 || msgs.length > 4) return json({ error: 'bad_messages' }, 400);
    let total = 0;
    for (const m of msgs) {
      if ((m.role !== 'system' && m.role !== 'user') || typeof m.content !== 'string' || m.content.length > 4000) return json({ error: 'bad_messages' }, 400);
      total += m.content.length;
    }
    if (total > 6000) return json({ error: 'too_large' }, 413);

    const cap = Math.min(600, Number(env.MAX_TOKENS_CAP) || 400);
    const maxTokens = Math.min(cap, Math.max(50, Number(body.maxTokens) || 300));
    try {
      const out = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages: msgs as Array<{ role: string; content: string }>, max_tokens: maxTokens });
      const text = typeof out === 'string' ? out : out.response;
      if (!text || typeof text !== 'string') return json({ error: 'empty' }, 502);
      return json({ response: text.slice(0, 3000), model: env.AI_MODEL || DEFAULT_MODEL });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // Limite del piano gratuito esaurito: nessun addebito sul piano Free, la richiesta semplicemente fallisce.
      if (/limit|quota|capacity|neuron|4006/i.test(msg)) return json({ error: 'quota' }, 429);
      return json({ error: 'upstream' }, 502);
    }
  },
};
