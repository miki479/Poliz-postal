import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { AppError } from '../shared/engine.ts';
import type { StoryExportData } from '../shared/storyExport.ts';
const W = 540,
  H = 960,
  FPS = 12,
  SECONDS = 12;
const ink = [53, 198, 207],
  backdrop = [14, 18, 22];
function textLines(text: string, width: number, maxLines: number) {
  const words = text.replace(/[\r\n]+/g, ' ').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    for (let part = 0; part < word.length; part += width) {
      const token = word.slice(part, part + width);
      if (line.length + token.length + 1 > width) {
        lines.push(line);
        line = token;
      } else line += (line ? ' ' : '') + token;
    }
  }
  if (line) lines.push(line);
  return lines.filter(Boolean).slice(0, maxLines).join('\n');
}
function dot(buf: Buffer, x: number, y: number, r: number, c: number[]) {
  for (let yy = Math.max(0, Math.floor(y - r)); yy < Math.min(H, y + r + 1); yy++)
    for (let xx = Math.max(0, Math.floor(x - r)); xx < Math.min(W, x + r + 1); xx++) {
      const distance = Math.hypot(xx - x, yy - y);
      const a = Math.max(0, Math.min(1, r + 0.5 - distance));
      if (a <= 0) continue;
      const i = (yy * W + xx) * 3;
      for (let k = 0; k < 3; k++) buf[i + k] = Math.round(buf[i + k] * (1 - a) + c[k] * a);
    }
}
function line(buf: Buffer, a: { x: number; y: number }, b: { x: number; y: number }, fraction = 1) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  for (let n = 0; n <= d * fraction; n += 1.5) {
    const p = d ? n / d : 0;
    dot(buf, a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 3, ink);
  }
}
export function videoFrame(data: StoryExportData, index: number): Buffer {
  const frame = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const tint = Math.max(0, 1 - Math.hypot(y - 150, 100) / 700);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      frame[i] = backdrop[0] + Math.round(tint * 10);
      frame[i + 1] = backdrop[1] + Math.round(tint * 4);
      frame[i + 2] = backdrop[2] + Math.round(tint * 22);
    }
  }
  const t = index / FPS;
  if (t >= 6 && t < 9 && data.track.length > 1) {
    const p = data.track;
    const lat = p.map((v) => v.lat),
      lng = p.map((v) => v.lng);
    const mid = lat.reduce((a, b) => a + b, 0) / lat.length;
    const factor = Math.cos((mid * Math.PI) / 180);
    const minX = Math.min(...lng) * factor,
      maxX = Math.max(...lng) * factor,
      minY = Math.min(...lat),
      maxY = Math.max(...lat);
    const scale = Math.min(420 / Math.max(maxX - minX, 1e-7), 350 / Math.max(maxY - minY, 1e-7));
    const points = p.map((v) => ({
      x: W / 2 + (v.lng * factor - (minX + maxX) / 2) * scale,
      y: 440 - (v.lat - (minY + maxY) / 2) * scale,
    }));
    const progress = data.reduceMotion ? 1 : Math.min(1, (t - 6) / 2.6);
    const end = progress * (points.length - 1);
    for (let i = 1; i < points.length && i - 1 < end; i++) {
      if (p[i].breakBefore) continue;
      line(frame, points[i - 1], points[i], Math.min(1, end - (i - 1)));
    }
  }
  return frame;
}
/** Encoder isolato: file temporanei, niente URL esterni, comandi senza shell e limite di tempo. */
export async function renderStoryVideo(data: StoryExportData, config: { ffmpeg?: string; font?: string } = {}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'runngo-story-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const font = config.font ?? process.env.STORY_FONT_PATH ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    await copyFile(font, join(dir, 'font.ttf'));
    const texts = [
      ['brand', 'RUNNGO', 42, 40, 0, 12],
      ['title', textLines(data.title, 25, 3), 44, 170, 0, 3],
      ['date', data.date, 25, 420, 0, 3],
      ['source', data.source, 22, 770, 0, 3],
      ['metrics', data.metrics.join('\n\n'), 38, 220, 3, 6],
      ['route', data.track.length > 1 ? 'Il tuo percorso' : 'Rivivi il tuo allenamento', 32, 150, 6, 9],
      ['routeNote', data.track.length > 1 ? 'Estremi protetti · schema del GPS' : 'Percorso non incluso nel file', 22, 700, 6, 9],
      ['context', textLines(data.context, 27, 4), 34, 260, 9, 12],
      ['closing', 'Ogni uscita è un passo avanti', 25, 620, 9, 12],
    ] as const;
    const filters: string[] = [];
    for (const [id, text, size, y, start, end] of texts) {
      await writeFile(join(dir, `${id}.txt`), text, 'utf8');
      filters.push(
        `drawtext=fontfile=font.ttf:textfile=${id}.txt:expansion=none:fontcolor=white:fontsize=${size}:x=40:y=${y}:line_spacing=12:enable='gte(t,${start})*lt(t,${end})'`,
      );
    }
    child = spawn(
      config.ffmpeg ?? process.env.STORY_FFMPEG_PATH ?? 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${W}x${H}`,
        '-r',
        String(FPS),
        '-i',
        'pipe:0',
        '-an',
        '-vf',
        filters.join(','),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-threads',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-y',
        'story.mp4',
      ],
      { cwd: dir, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true },
    );
    const processHandle = child;
    processHandle.stdin!.on('error', () => {});
    processHandle.stderr!.resume();
    const done = new Promise<void>((res, rej) => {
      processHandle.once('error', () => rej(new AppError('unavailable', 'Esportazione video non disponibile in questo momento.')));
      processHandle.once('close', (code) =>
        code === 0 ? res() : rej(new AppError('unavailable', 'Non riesco a preparare il video. Riprova.')),
      );
    });
    // Evita una rejection non gestita se l’encoder termina durante la scrittura.
    void done.catch(() => {});
    const timeout = setTimeout(() => processHandle.kill(), 60_000);
    try {
      for (let i = 0; i < FPS * SECONDS; i++) {
        if (!processHandle.stdin!.write(videoFrame(data, i)))
          await Promise.race([
            once(processHandle.stdin!, 'drain'),
            done.then(() => {
              throw new AppError('unavailable', 'Esportazione interrotta. Riprova.');
            }),
          ]);
      }
      processHandle.stdin!.end();
      await done;
    } finally {
      clearTimeout(timeout);
    }
    const video = await readFile(join(dir, 'story.mp4'));
    if (video.length > 8_000_000) throw new AppError('unavailable', 'Il video è troppo grande. Riprova senza percorso.');
    return video;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('unavailable', 'Non riesco a esportare il Racconto. Riprova tra poco.');
  } finally {
    child?.kill();
    const root = resolve(tmpdir()) + sep;
    if (resolve(dir).startsWith(root) && basename(dir).startsWith('runngo-story-')) await rm(dir, { recursive: true, force: true });
  }
}
