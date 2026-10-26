import { AppError, requireActorOf, type Ctx } from './engine.ts';
import { displayTrack } from './routeDisplay.ts';
import { haversineKm, formatPace, isValidTimezone } from './time.ts';
import type { TrackPoint } from './types.ts';
export interface StoryExportData {
  title: string;
  date: string;
  metrics: string[];
  context: string;
  source: string;
  track: TrackPoint[];
  reduceMotion: boolean;
}
export function storyExportData(
  ctx: Ctx,
  logId: string,
  options: { includeRoute?: boolean; includePeople?: boolean; reduceMotion?: boolean; timezone?:string } = {},
): StoryExportData {
  const me = requireActorOf(ctx);
  const log = ctx.db.workoutLogs[logId];
  if (!log || log.userId !== me.id) throw new AppError('not_found', 'Allenamento non trovato.');
  const metric: string[] = [];
  if (log.distanceKm != null) metric.push(`${log.distanceKm.toFixed(2).replace('.', ',')} km`);
  metric.push(`${Math.floor(log.durationSec / 60)} min ${log.durationSec % 60} s`);
  if (log.paceSecPerKm) metric.push(`Passo ${formatPace(log.paceSecPerKm)}`);
  let track: TrackPoint[] = [];
  if (options.includeRoute === true && log.origin !== 'strava') {
    const clean = displayTrack(log.track ?? []).points;
    const first = clean[0],
      last = clean.at(-1);
    let gap = false;
    // Il file da condividere non contiene i 300 m attorno agli estremi, né sensori.
    if (first && last)
      for (const p of clean) {
        if (haversineKm(first, p) < 0.3 || haversineKm(last, p) < 0.3) {
          gap = true;
          continue;
        }
        track.push({ lat: p.lat, lng: p.lng, t: p.t, ...(gap || p.breakBefore ? { breakBefore: true } : {}) });
        gap = false;
      }
  }
  const people =
    options.includePeople === true
      ? Object.values(ctx.db.workoutCompanions ?? {})
          .filter((r) => r.logId === logId && r.status === 'accepted' && ctx.db.users[r.toId]?.privacy.shareActivity)
          .map((r) => ctx.db.users[r.toId].displayName)
      : [];
  const event = log.eventId ? ctx.db.events[log.eventId] : null;
  return {
    title: log.title,
    date: new Date(log.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: options.timezone&&isValidTimezone(options.timezone)?options.timezone:'UTC' }),
    metrics: metric,
    context: people.length ? `Con ${people.join(', ')}` : event ? 'Uscita di gruppo collegata' : 'Attività individuale',
    source: log.origin === 'strava' ? 'Importata da Strava' : log.origin === 'file' ? 'Importata da file' : log.mode==='manual'?'Attività dichiarata':log.edited?'Dati modificati manualmente':'Registrata con Runngo',
    track,
    reduceMotion: options.reduceMotion === true,
  };
}
