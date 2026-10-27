/**
 * Piccole utilità di colore per la creazione dell'uscita (solo esadecimali #RRGGBB dei token e dei colori attività).
 * Servono a ricavare sfumature leggibili dai colori ufficiali, senza introdurre palette nuove.
 */
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Miscela due colori esadecimali (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const k = clamp01(t);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** Stesso colore con trasparenza (0-1). */
export const alpha = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(clamp01(a) * 255).toString(16).padStart(2, '0')}`;

/**
 * Versione scura del colore (k = quanto scurire). Sui colori delle attività, k ≥ 0,4 tiene il testo bianco
 * sopra il 4,5:1 (turchese, ambra, verde e pietra verificati): serve alle tessere a tutto colore.
 */
export const shade = (hex: string, k: number) => mix(hex, '#000000', k);
