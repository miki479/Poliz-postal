/**
 * Parser di file di allenamento forniti dall'utente (GPX, TCX, export.xml di Apple Health).
 * Funzionano su testo, senza DOM, così sono testabili e usabili anche a pezzi (streaming).
 * Distanze e durate vengono SOLO lette o calcolate dai dati presenti nel file: nulla è stimato.
 */
import { haversineKm } from './time.ts';
import type { SportId } from './types.ts';

export interface ParsedActivity {
  externalId: string;
  sport: SportId;
  title: string;
  date: string;
  distanceKm: number | null;
  durationMin: number | null;
}

export interface ParseResult {
  activities: ParsedActivity[];
  /** Voci riconosciute ma non importabili (altri sport, dati incompleti). */
  skipped: number;
  format: 'gpx' | 'tcx' | 'apple-health';
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
};

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function sportFromText(t: string): SportId | null {
  const s = t.toLowerCase();
  if (/run|corsa|jog/.test(s)) return 'running';
  if (/walk|hik|cammin/.test(s)) return 'walking';
  return null;
}

export function detectFormat(text: string): ParseResult['format'] | null {
  const head = text.slice(0, 4000);
  if (/<gpx[\s>]/i.test(head)) return 'gpx';
  if (/<TrainingCenterDatabase[\s>]/i.test(head)) return 'tcx';
  if (/<HealthData[\s>]/i.test(head) || /<Workout\s/i.test(text.slice(0, 200_000))) return 'apple-health';
  return null;
}

export function parseGpx(text: string): ParseResult {
  const tracks = text.match(/<trk[\s>][\s\S]*?<\/trk>/gi) ?? [];
  const activities: ParsedActivity[] = [];
  let skipped = 0;
  for (const trk of tracks) {
    const pts: Array<{ lat: number; lng: number; t: number | null }> = [];
    for (const m of trk.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi)) {
      const lat = Number(attr(m[1], 'lat'));
      const lng = Number(attr(m[1], 'lon'));
      const tm = /<time>([^<]+)<\/time>/i.exec(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng, t: tm ? Date.parse(tm[1]) : null });
    }
    if (pts.length < 2) {
      skipped++;
      continue;
    }
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
    const times = pts.map((p) => p.t).filter((t): t is number => t !== null && !Number.isNaN(t));
    const start = times.length ? Math.min(...times) : null;
    if (start === null) {
      skipped++; // senza orari non si può collocare l'attività nel tempo
      continue;
    }
    const durationMin = times.length > 1 ? Math.max(1, Math.round((Math.max(...times) - start) / 60000)) : null;
    const name = /<name>([^<]*)<\/name>/i.exec(trk)?.[1];
    const type = /<type>([^<]*)<\/type>/i.exec(trk)?.[1] ?? name ?? 'running';
    const sport = sportFromText(type) ?? 'running'; // i GPX spesso non indicano lo sport: si assume corsa, modificabile dall'utente
    const date = new Date(start).toISOString();
    activities.push({ externalId: `gpx:${date}:${round2(km)}`, sport, title: name ? decodeXml(name).slice(0, 80) : 'Attività da GPX', date, distanceKm: round2(km), durationMin });
  }
  return { activities, skipped, format: 'gpx' };
}

export function parseTcx(text: string): ParseResult {
  const acts = text.match(/<Activity\b[\s\S]*?<\/Activity>/gi) ?? [];
  const out: ParsedActivity[] = [];
  let skipped = 0;
  for (const a of acts) {
    const head = /<Activity\b([^>]*)>/i.exec(a)?.[1] ?? '';
    const sport = sportFromText(attr(head, 'Sport') ?? '');
    const id = /<Id>([^<]+)<\/Id>/i.exec(a)?.[1];
    const start = id ? Date.parse(id) : NaN;
    if (!sport || Number.isNaN(start)) {
      skipped++;
      continue;
    }
    let meters = 0;
    let seconds = 0;
    for (const lap of a.matchAll(/<Lap\b[\s\S]*?<\/Lap>/gi)) {
      meters += Number(/<DistanceMeters>([^<]+)<\/DistanceMeters>/i.exec(lap[0])?.[1] ?? 0) || 0;
      seconds += Number(/<TotalTimeSeconds>([^<]+)<\/TotalTimeSeconds>/i.exec(lap[0])?.[1] ?? 0) || 0;
    }
    const date = new Date(start).toISOString();
    out.push({ externalId: `tcx:${date}:${Math.round(meters)}`, sport, title: 'Attività da TCX', date, distanceKm: meters > 0 ? round2(meters / 1000) : null, durationMin: seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null });
  }
  return { activities: out, skipped, format: 'tcx' };
}

/** "2024-03-01 07:30:00 +0100" → ISO UTC. */
function parseHealthDate(s: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const UNIT_KM: Record<string, number> = { km: 1, mi: 1.609344, m: 0.001 };
const UNIT_MIN: Record<string, number> = { min: 1, s: 1 / 60, hr: 60, h: 60 };

/** Legge gli elementi <Workout> di export.xml di Apple Health. Ignora ogni altro dato (frequenza cardiaca, sonno, ecc.). */
export function parseAppleHealthWorkouts(text: string): ParseResult {
  const out: ParsedActivity[] = [];
  let skipped = 0;
  for (const m of text.matchAll(/<Workout\s([^>]*?)\/?>/g)) {
    const tag = m[1];
    const type = attr(tag, 'workoutActivityType') ?? '';
    const sport = /Running/.test(type) ? 'running' : /Walking|Hiking/.test(type) ? 'walking' : null;
    const date = parseHealthDate(attr(tag, 'startDate') ?? '');
    if (!sport || !date) {
      skipped++;
      continue;
    }
    const dist = Number(attr(tag, 'totalDistance'));
    const dur = Number(attr(tag, 'duration'));
    const km = Number.isFinite(dist) && dist > 0 ? dist * (UNIT_KM[attr(tag, 'totalDistanceUnit') ?? 'km'] ?? 1) : null;
    const min = Number.isFinite(dur) && dur > 0 ? dur * (UNIT_MIN[attr(tag, 'durationUnit') ?? 'min'] ?? 1) : null;
    out.push({ externalId: `apple:${date}:${km ? round2(km) : 0}`, sport, title: sport === 'running' ? 'Corsa (Apple Salute)' : 'Camminata (Apple Salute)', date, distanceKm: km ? round2(km) : null, durationMin: min ? Math.max(1, Math.round(min)) : null });
  }
  return { activities: out, skipped, format: 'apple-health' };
}

export function parseWorkoutFile(text: string): ParseResult {
  const f = detectFormat(text);
  if (f === 'gpx') return parseGpx(text);
  if (f === 'tcx') return parseTcx(text);
  if (f === 'apple-health') return parseAppleHealthWorkouts(text);
  throw new Error('Formato non riconosciuto. Sono supportati GPX, TCX e l\'export.xml di Apple Salute.');
}
