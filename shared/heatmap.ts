import { AppError, type Ctx } from './engine.ts';
import { haversineKm } from './time.ts';
import type { LatLng } from './types.ts';

export interface HeatCell extends LatLng { runners: number }
/** Rounded ~100m cells, no identities/timestamps, at least three distinct contributors.
 * Exclude the first/last 200m near home and never use private, imported or interrupted tracks.
 */
export function nearbyHeatmap(ctx: Ctx, center: LatLng): HeatCell[] {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180) throw new AppError('validation', 'Posizione non valida.');
  const cells = new Map<string, { lat: number; lng: number; users: Set<string> }>();
  const since = ctx.now.getTime() - 90 * 86_400_000;
  for (const log of Object.values(ctx.db.workoutLogs)) {
    if (!log.heatmapConsent || log.origin === 'strava' || log.gpsQuality?.gaps || log.environment === 'treadmill' || !log.track || log.track.length < 2 || Date.parse(log.startedAt) < since) continue;
    const user = ctx.db.users[log.userId];
    if (!user) continue;
    const first = log.track[0], last = log.track[log.track.length - 1];
    for (const point of log.track) {
      if (haversineKm(center, point) > 5 || haversineKm(first, point) < 0.2 || haversineKm(last, point) < 0.2) continue;
      const lat = Math.round(point.lat * 1000) / 1000, lng = Math.round(point.lng * 1000) / 1000;
      const key = `${lat},${lng}`;
      const cell = cells.get(key) ?? { lat, lng, users: new Set<string>() };
      cell.users.add(log.userId);
      cells.set(key, cell);
    }
  }
  return [...cells.values()].filter((c) => c.users.size >= 3).map((c) => ({ lat: c.lat, lng: c.lng, runners: c.users.size })).slice(0, 2000);
}
