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
