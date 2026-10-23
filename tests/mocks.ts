import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Mock {
  url: string;
  hits: Array<{ method: string; path: string; headers: IncomingMessage['headers']; body: string }>;
  handler: { fn: (req: { method: string; path: string; search: URLSearchParams; headers: IncomingMessage['headers']; body: string }) => { status?: number; json?: unknown; headers?: Record<string, string> } };
  close(): Promise<void>;
}

/** Piccolo server HTTP programmabile per simulare i servizi esterni nei test. */
export async function mockServer(fn: Mock['handler']['fn']): Promise<Mock> {
  const hits: Mock['hits'] = [];
  const handler = { fn };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const u = new URL(req.url ?? '/', 'http://x');
      hits.push({ method: req.method ?? 'GET', path: u.pathname, headers: req.headers, body });
      const out = handler.fn({ method: req.method ?? 'GET', path: u.pathname, search: u.searchParams, headers: req.headers, body });
      res.writeHead(out.status ?? 200, { 'Content-Type': 'application/json', ...(out.headers ?? {}) });
      res.end(JSON.stringify(out.json ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, hits, handler, close: () => new Promise((r) => server.close(() => r())) };
}
