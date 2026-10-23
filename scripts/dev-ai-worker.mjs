/**
 * Worker AI SIMULATO per lo sviluppo locale (nessuna credenziale, nessun modello).
 * Rispetta lo stesso protocollo firmato del Worker reale, ma restituisce un testo fisso marcato come SIMULATO.
 * Uso: AI_WORKER_SECRET=dev node scripts/dev-ai-worker.mjs   e sul server: AI_ENABLED=1 AI_WORKER_URL=http://127.0.0.1:8788 AI_WORKER_SECRET=dev
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const secret = process.env.AI_WORKER_SECRET || 'dev';
const port = Number(process.env.AI_DEV_PORT) || 8788;

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    const ts = String(req.headers['x-timestamp'] ?? '');
    const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    const got = String(req.headers['x-signature'] ?? '');
    const ok = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected)) && Math.abs(Date.now() / 1000 - Number(ts)) <= 60;
    res.setHeader('Content-Type', 'application/json');
    if (!ok) return res.writeHead(401).end(JSON.stringify({ error: 'bad_signature' }));
    res.end(JSON.stringify({ response: '[SIMULATO — sviluppo, nessun modello reale]\nConsiglio generico:\n- Questo è un testo fisso per provare l\'interfaccia.\n- Con il Worker Cloudflare configurato qui comparirebbe la risposta del modello.\nAscolta il tuo corpo e, per dubbi di salute, chiedi al tuo medico.', simulated: true }));
  });
}).listen(port, '127.0.0.1', () => console.log(`Worker AI simulato su http://127.0.0.1:${port}`));
