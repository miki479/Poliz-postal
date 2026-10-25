/** Campioni presenti nel file. Le proprietà mancanti restano mancanti, senza interpolazioni. */
export interface FileSample { distanceKm?: number; hr?: number; alt?: number; cadence?: number }
/** Riepiloghi esplicitamente presenti nel file: non sono campioni né serie ricostruite. */
export interface FileSummary { hrAvg?: number; hrMax?: number; cadAvg?: number; cadMax?: number; gain?: number; loss?: number }
export interface FileActivityData { durationSec: number | null; samples: FileSample[]; summary: FileSummary }
export const MAX_FILE_DOCUMENT_BYTES = 900_000;
export function jsonBytes(value: unknown): number {
  let bytes = 0;
  for (const char of JSON.stringify(value)) {
    const cp = char.codePointAt(0)!;
    bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
  }
  return bytes;
}
/** Margine rispetto a 1 MiB: il server Firestore aggiunge nome, versione e JSON serializzato. */
export function assertFileDocumentSize(value: unknown): void {
  if (jsonBytes(value) > MAX_FILE_DOCUMENT_BYTES) throw new Error('Questa attività contiene troppi dati per essere salvata. Suddividi il file in attività più brevi.');
}
const limits = { distanceKm: [0, 1000], hr: [1, 300], alt: [-1000, 10000], cadence: [0, 400] } as const;
export function cleanFileSamples(value: unknown): FileSample[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 20000) throw new Error('Il file contiene più di 20.000 campioni per attività. Suddividilo in file più brevi.');
  return value.map((raw) => {
    const sample: FileSample = {};
    if (raw && typeof raw === 'object') for (const key of Object.keys(limits) as Array<keyof FileSample>) {
      const v = raw[key]; const [min, max] = limits[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) sample[key] = v;
    }
    return sample;
  });
}
export function cleanFileSummary(value: unknown): FileSummary {
  const out: FileSummary = {};
  if (!value || typeof value !== 'object') return out;
  const ranges = { hrAvg: [1, 300], hrMax: [1, 300], cadAvg: [0, 400], cadMax: [0, 400], gain: [0, 100000], loss: [0, 100000] } as const;
  for (const key of Object.keys(ranges) as Array<keyof FileSummary>) {
    const v = (value as Record<string, unknown>)[key]; const [min, max] = ranges[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
export function fileMeasurements(samples: FileSample[], summary: FileSummary = {}) {
  const values = (key: keyof FileSample) => samples.flatMap((s) => s[key] == null ? [] : [s[key]!]);
  const avg = (v: number[]) => v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  const max = (v: number[]) => v.length ? v.reduce((a, b) => Math.max(a, b)) : null;
  const hr = values('hr'); const cad = values('cadence');
  let gain = 0; let loss = 0; let pairs = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].alt; const b = samples[i].alt;
    if (a == null || b == null) continue;
    pairs++; if (b >= a) gain += b - a; else loss += a - b;
  }
  const series = (key: 'hr' | 'alt' | 'cadence') => {
    const pts = samples.filter((s) => s.distanceKm != null && s[key] != null);
    return { xs: pts.map((s) => s.distanceKm!), ys: pts.map((s) => s[key]!) };
  };
  return { hrAvg: summary.hrAvg ?? avg(hr), hrMax: summary.hrMax ?? max(hr), cadAvg: summary.cadAvg ?? avg(cad), cadMax: summary.cadMax ?? max(cad), gain: summary.gain ?? (pairs ? Math.round(gain) : null), loss: summary.loss ?? (pairs ? Math.round(loss) : null), heart: series('hr'), altitude: series('alt') };
}
