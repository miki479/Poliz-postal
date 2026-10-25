/**
 * Parser di file di allenamento forniti dall'utente (GPX, TCX, export.xml di Apple Health).
 * Funzionano su testo, senza DOM, così sono testabili e usabili anche a pezzi (streaming).
 * Distanze e durate vengono SOLO lette o calcolate dai dati presenti nel file: nulla è stimato.
 */
import { haversineKm } from './time.ts';
import type { SportId } from './types.ts';
import { cleanFileSamples, cleanFileSummary, assertFileDocumentSize, type FileSample, type FileSummary } from './fileMeasurements.ts';

export interface ParsedActivity {
  samples?: FileSample[];
  summary?: FileSummary;
  durationSec?: number | null;
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

/** Le serie dei sensori possono essere grandi: lotti entro il limite HTTP, senza scartare campioni. */
export function fileImportBatches(items: ParsedActivity[], maxBytes = 1_800_000): ParsedActivity[][] {
  const batches: ParsedActivity[][] = [];
  let batch: ParsedActivity[] = []; let bytes = 1024;
  for (const item of items) {
    let size = 1;
    for (const char of JSON.stringify(item)) {
      const cp = char.codePointAt(0)!;
      size += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
    }
    if (size + 1024 > maxBytes) throw new Error('Questa attività contiene troppi campioni per un singolo invio. Importa un file più breve.');
    if (batch.length && (bytes + size > maxBytes || batch.length >= 400)) { batches.push(batch); batch = []; bytes = 1024; }
    batch.push(item); bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
};

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Tag con prefisso XML facoltativo (gpxtpx, ns3, ...). */
function element(xml: string, name: string): string | undefined {
  return new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i').exec(xml)?.[1];
}
function numberElement(xml: string, name: string): number | undefined {
  const text = element(xml, name)?.trim();
  if (!text) return undefined;
  const value = Number(text); return Number.isFinite(value) ? value : undefined;
}

/** Tipo dal testo del file: il trail solo se il file lo dice (es. "trail_running", "TrailRun"); l'escursionismo resta camminata. */
export function sportFromText(t: string): SportId | null {
  const s = t.toLowerCase();
  if (/trail/.test(s) && !/walk|hik|cammin/.test(s)) return 'trail';
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
    const pts: Array<{ lat: number; lng: number; t: number | null; sample: FileSample }> = [];
    for (const m of trk.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi)) {
      const lat = Number(attr(m[1], 'lat') ?? NaN);
      const lng = Number(attr(m[1], 'lon') ?? NaN);
      const tm = /<time>([^<]+)<\/time>/i.exec(m[2]);
      if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) pts.push({ lat, lng, t: tm ? Date.parse(tm[1]) : null, sample: { hr: numberElement(m[2], 'hr'), alt: numberElement(m[2], 'ele'), cadence: numberElement(m[2], 'cad') } });
    }
    if (pts.length < 2) {
      skipped++;
      continue;
    }
    let km = 0;
    pts[0].sample.distanceKm = 0;
    for (let i = 1; i < pts.length; i++) { km += haversineKm(pts[i - 1], pts[i]); pts[i].sample.distanceKm = km; }
    const times = pts.map((p) => p.t).filter((t): t is number => t !== null && !Number.isNaN(t));
    const start = times.length ? Math.min(...times) : null;
    if (start === null) {
      skipped++; // senza orari non si può collocare l'attività nel tempo
      continue;
    }
    const durationSec = times.length > 1 && Math.max(...times) > start ? (Math.max(...times) - start) / 1000 : null;
    const durationMin = durationSec != null ? durationSec / 60 : null;
    const name = /<name>([^<]*)<\/name>/i.exec(trk)?.[1];
    const type = /<type>([^<]*)<\/type>/i.exec(trk)?.[1] ?? name ?? 'running';
    const sport = sportFromText(type) ?? 'running'; // i GPX spesso non indicano lo sport: si assume corsa, modificabile dall'utente
    const date = new Date(start).toISOString();
    const samples = cleanFileSamples(pts.map((p) => p.sample));
    assertFileDocumentSize({ samples });
    activities.push({ externalId: `gpx:${date}:${round2(km)}`, sport, title: name ? decodeXml(name).slice(0, 80) : 'Attività da GPX', date, distanceKm: round2(km), durationMin, durationSec, samples });
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
    // I dati dei Trackpoint non sono riepiloghi Lap: non usarne il primo come totale.
    const laps = [...a.matchAll(/<Lap\b[\s\S]*?<\/Lap>/gi)].map((m) => m[0].replace(/<(?:[\w.-]+:)?Track\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?Track>/gi, ''));
    const lapMeters = laps.map((lap) => numberElement(lap, 'DistanceMeters'));
    const lapSeconds = laps.map((lap) => numberElement(lap, 'TotalTimeSeconds'));
    const meters = lapMeters.length && lapMeters.every((v) => v != null && v >= 0) ? lapMeters.reduce<number>((sum, v) => sum + v!, 0) : null;
    const seconds = lapSeconds.length && lapSeconds.every((v) => v != null && v > 0) ? lapSeconds.reduce<number>((sum, v) => sum + v!, 0) : null;
    const weighted = (values: Array<number | undefined>): number | undefined => {
      if (!values.length || values.some((v) => v == null)) return undefined;
      if (values.length === 1) return values[0];
      return seconds != null ? values.reduce<number>((sum, v, i) => sum + v! * lapSeconds[i]!, 0) / seconds : undefined;
    };
    const lapMax = (values: Array<number | undefined>): number | undefined => {
      const present = values.filter((v): v is number => v != null);
      return present.length ? Math.max(...present) : undefined;
    };
    const summary = cleanFileSummary({
      hrAvg: weighted(laps.map((lap) => numberElement(element(lap, 'AverageHeartRateBpm') ?? '', 'Value'))),
      hrMax: lapMax(laps.map((lap) => numberElement(element(lap, 'MaximumHeartRateBpm') ?? '', 'Value'))),
      cadAvg: weighted(laps.map((lap) => numberElement(lap, 'AvgRunCadence') ?? numberElement(lap, 'Cadence'))),
      cadMax: lapMax(laps.map((lap) => numberElement(lap, 'MaxRunCadence'))),
    });
    const date = new Date(start).toISOString();
    const samples = [...a.matchAll(/<(?:[\w.-]+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Trackpoint>/gi)].map((m): FileSample => {
      const dist = numberElement(m[1], 'DistanceMeters');
      return { distanceKm: dist == null ? undefined : dist / 1000, hr: numberElement(element(m[1], 'HeartRateBpm') ?? '', 'Value'), alt: numberElement(m[1], 'AltitudeMeters'), cadence: numberElement(m[1], 'RunCadence') ?? numberElement(m[1], 'Cadence') };
    });
    const pointTimes = [...a.matchAll(/<(?:[\w.-]+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Trackpoint>/gi)]
      .map((m) => Date.parse(element(m[1], 'Time') ?? '')).filter(Number.isFinite);
    const timedDuration = pointTimes.length > 1 && Math.max(...pointTimes) > Math.min(...pointTimes) ? (Math.max(...pointTimes) - Math.min(...pointTimes)) / 1000 : null;
    const durationSec = seconds ?? timedDuration;
    const cleaned = cleanFileSamples(samples);
    assertFileDocumentSize({ samples: cleaned, summary });
    out.push({ externalId: `tcx:${date}:${Math.round(meters ?? 0)}`, sport, title: 'Attività da TCX', date, distanceKm: meters != null && meters > 0 ? round2(meters / 1000) : null, durationMin: durationSec != null ? durationSec / 60 : null, durationSec, samples: cleaned, summary });
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
