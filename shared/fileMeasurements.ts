/** Campioni presenti nel file. Le proprietà mancanti restano mancanti, senza interpolazioni. */
export interface FileSample { distanceKm?: number; hr?: number; alt?: number; cadence?: number }
const limits = { distanceKm: [0, 1000], hr: [1, 300], alt: [-1000, 10000], cadence: [0, 400] } as const;
export function cleanFileSamples(value: unknown): FileSample[] {
  if (!Array.isArray(value) || value.length > 20000) return [];
  return value.map((raw) => {
    const sample: FileSample = {};
    if (raw && typeof raw === 'object') for (const key of Object.keys(limits) as Array<keyof FileSample>) {
      const v = raw[key]; const [min, max] = limits[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) sample[key] = v;
    }
    return sample;
  });
}
export function fileMeasurements(samples: FileSample[]) {
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
  return { hrAvg: avg(hr), hrMax: max(hr), cadAvg: avg(cad), cadMax: max(cad), gain: pairs ? Math.round(gain) : null, loss: pairs ? Math.round(loss) : null, heart: series('hr'), altitude: series('alt') };
}
