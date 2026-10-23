import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  // Le librerie Google restano esterne (installate con npm ci --omit=dev nell'immagine).
  external: ['@google-cloud/firestore'],
  logLevel: 'info',
});
