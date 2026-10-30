import { haversineKm } from './time.ts';
import type { TrackPoint } from './types.ts';
import type { ReplayTimeline } from './replay.ts';
import { replayPosition } from './replay.ts';

/** Small native polylines: completed chunks are sent once, only the tip changes each frame. */
export function replayChunks(track: TrackPoint[], size = 64) {
  const chunks: { from: number; to: number; points: TrackPoint[] }[] = [];
  let start = 0;
  for (let i = 1; i <= track.length; i++) {
    if (i < track.length && !track[i].breakBefore) continue;
    for (let from = start; from < i - 1; from += size) {
      const to = Math.min(i - 1, from + size);
      chunks.push({ from, to, points: track.slice(from, to + 1) });
    }
    start = i;
  }
  return chunks;
}
export function replayChunkPoints(chunk: ReturnType<typeof replayChunks>[number], timeline: ReplayTimeline, elapsed: number) {
  if (elapsed <= 0) return [];
  const head = replayPosition(timeline, elapsed);
  if (!head || head.index < chunk.from) return [];
  if (head.index >= chunk.to) return chunk.points;
  const points = chunk.points.slice(0, head.index - chunk.from + 1);
  if (!head.gap) points.push(head.point);
  return points.length > 1 ? points : [];
}
export function replayEndpoints(track: TrackPoint[], finished: boolean, reducedMotion: boolean) {
  const close = track.length > 1 && haversineKm(track[0], track[track.length - 1]) < 0.02;
  return { start: !(close && (finished || reducedMotion)), finish: finished || reducedMotion, close };
}
export function nextReplayValue(at:number, deltaMs:number, rate:number, total:number) {
  return Math.min(total, at + Math.min(50,Math.max(0,deltaMs))/1000 * rate);
}

/** Scala lento → veloce del percorso: blu, viola, ambra, rosso. */
const PACE_STOPS = ['#4FC3F7', '#8E75FF', '#FFB020', '#FF5C6C'];
export const PACE_GRADIENT = PACE_STOPS;
export function paceColor(f: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0)) * (PACE_STOPS.length - 1);
  const i = Math.min(PACE_STOPS.length - 2, Math.floor(x));
  const t = x - i;
  const a = PACE_STOPS[i], b = PACE_STOPS[i + 1];
  const ch = (h: string, k: number) => parseInt(h.slice(1 + k * 2, 3 + k * 2), 16);
  const mix = (k: number) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t).toString(16).padStart(2, '0');
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

/**
 * Un colore per ogni blocco del percorso secondo la velocità reale (km/h tra i punti registrati, tempi in secondi).
 * Senza tempi reali (es. tracciato importato) o con velocità quasi uniforme restituisce null: il percorso resta di un solo colore.
 */
export function chunkSpeedColors(chunks: { points: TrackPoint[] }[]): string[] | null {
  const speeds = chunks.map((c) => {
    const a = c.points[0], b = c.points[c.points.length - 1];
    const dt = b.t - a.t;
    let d = 0;
    for (let i = 1; i < c.points.length; i++) d += haversineKm(c.points[i - 1], c.points[i]);
    return dt > 0 ? d / (dt / 3600) : 0;
  });
  const ok = speeds.filter((v) => v > 0 && Number.isFinite(v)).sort((x, y) => x - y);
  if (ok.length < 3) return null;
  const lo = ok[Math.floor(ok.length * 0.1)], hi = ok[Math.floor(ok.length * 0.9)];
  if (!(hi - lo > 0.4)) return null;
  return speeds.map((v) => (v > 0 ? paceColor((v - lo) / (hi - lo)) : PACE_STOPS[1]));
}
