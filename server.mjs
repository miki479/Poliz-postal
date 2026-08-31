import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'dist-render');
const port = Number(process.env.PORT) || 8789;
const host = '0.0.0.0';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = normalize(decoded).replace(/^([/\\])+/, '');
  const candidate = resolve(join(outputDirectory, relativePath));
  return candidate === outputDirectory || candidate.startsWith(`${outputDirectory}${sep}`)
    ? candidate
    : null;
}

function sendFile(request, response, filePath) {
  const extension = extname(filePath).toLowerCase();
  const isAsset = filePath.includes(`${sep}assets${sep}`);
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
}

if (!existsSync(join(outputDirectory, 'index.html'))) {
  throw new Error('Build Render assente: esegui npm run build:render prima di avviare il server.');
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const requestedPath = safeFilePath(pathname === '/' ? '/index.html' : pathname);
  const filePath = requestedPath && existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : join(outputDirectory, 'index.html');

  sendFile(request, response, filePath);
});

server.listen(port, host, () => {
  process.stdout.write(`Turno Reale pronto sulla porta ${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
