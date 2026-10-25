/**
 * Utilità sul tracciato GPS di un allenamento: distanza, semplificazione, passaggi per km e giri.
 * Tutto è calcolato SOLO dai punti registrati: nessuna stima o dato inventato.
 */
import { haversineKm } from './time.ts';
import type { TrackPoint } from './types.ts';

/** true se il tracciato ha tempi reali crescenti (registrato dall'app); i tracciati importati non li hanno. */
export function isTimed(track: TrackPoint[]): boolean {
  return track.length > 2 && track[track.length - 1].t > track[0].t && track.every((p, i) => i === 0 || p.t >= track[i - 1].t);
}

/** Distanza totale lungo il tracciato, in km. */
export function trackDistanceKm(track: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < track.length; i++) d += haversineKm(track[i - 1], track[i]);
  return d;
}

/** Riduce i punti a `max` mantenendo forma e primo/ultimo punto (campionamento uniforme). */
export function downsample(track: TrackPoint[], max: number): TrackPoint[] {
  if (track.length <= max) return track;
  const out: TrackPoint[] = [];
  for (let i = 0; i < max; i++) out.push(track[Math.round((i * (track.length - 1)) / (max - 1))]);
  return out;
}

export interface Split {
  km: number;
  /** Secondi impiegati per questo chilometro (l'ultimo può essere parziale). */
  sec: number;
  /** Lunghezza reale della frazione in km (1 per i chilometri interi). */
  distKm: number;
  /** Passo in secondi per km. */
  paceSecPerKm: number;
}

/** Tempi per chilometro, interpolando linearmente tra i punti. */
export function splits(track: TrackPoint[]): Split[] {
  if (track.length < 2 || !isTimed(track)) return []; // senza tempi reali non si calcola nulla
  const out: Split[] = [];
  let acc = 0;
  let lastT = track[0].t;
  let nextKm = 1;
  for (let i = 1; i < track.length; i++) {
    const seg = haversineKm(track[i - 1], track[i]);
    const prevAcc = acc;
    acc += seg;
    while (acc >= nextKm && seg > 0) {
      const frac = (nextKm - prevAcc) / seg;
      const t = track[i - 1].t + frac * (track[i].t - track[i - 1].t);
      out.push({ km: nextKm, sec: Math.round(t - lastT), distKm: 1, paceSecPerKm: Math.round(t - lastT) });
      lastT = t;
      nextKm++;
    }
  }
  const rest = acc - (nextKm - 1);
  const endT = track[track.length - 1].t;
  if (rest >= 0.1 && endT > lastT) out.push({ km: nextKm, sec: Math.round(endT - lastT), distKm: Math.round(rest * 100) / 100, paceSecPerKm: Math.round((endT - lastT) / rest) });
  return out;
}

/**
 * Numero di giri se il tracciato è un circuito ripetuto: un giro si conta ogni volta che si torna entro
 * `radiusKm` dal punto di partenza dopo essersi allontanati di almeno `minLapKm`. Restituisce 1 se non c'è ripetizione.
 */
export function countLaps(track: TrackPoint[], radiusKm = 0.04, minLapKm = 0.3): number {
  if (track.length < 3) return 1;
  const start = track[0];
  let laps = 0;
  let far = false;
  let sinceLap = 0;
  for (let i = 1; i < track.length; i++) {
    sinceLap += haversineKm(track[i - 1], track[i]);
    const d = haversineKm(start, track[i]);
    if (d > radiusKm * 2) far = true;
    if (far && d <= radiusKm && sinceLap >= minLapKm) {
      laps++;
      far = false;
      sinceLap = 0;
    }
  }
  return Math.max(1, laps);
}

/** Riquadro che contiene il tracciato (per centrare la mappa). */
export function bounds(track: TrackPoint[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (!track.length) return null;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of track) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Dislivello stimato dall'altitudine GPS: media mobile su 5 punti e soglia di 3 m per non contare il rumore.
 * Restituisce null se meno della metà dei punti ha l'altitudine (nessuna stima inventata).
 */
export function elevationOf(track: TrackPoint[]): { gainM: number; lossM: number; profile: Array<{ distKm: number; alt: number }> } | null {
  const withAlt = track.filter((p) => typeof p.alt === 'number');
  if (track.length < 5 || withAlt.length < track.length / 2) return null;
  const alts = track.map((p) => p.alt ?? NaN);
  const smooth = alts.map((_, i) => {
    const w = alts.slice(Math.max(0, i - 2), i + 3).filter((v) => Number.isFinite(v));
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN;
  });
  let gain = 0;
  let loss = 0;
  let ref = smooth.find((v) => Number.isFinite(v))!;
  for (const v of smooth) {
    if (!Number.isFinite(v)) continue;
    if (v - ref >= 3) {
      gain += v - ref;
      ref = v;
    } else if (ref - v >= 3) {
      loss += ref - v;
      ref = v;
    }
  }
  const profile: Array<{ distKm: number; alt: number }> = [];
  let d = 0;
  for (let i = 0; i < track.length; i++) {
    if (i) d += haversineKm(track[i - 1], track[i]);
    if (Number.isFinite(smooth[i])) profile.push({ distKm: d, alt: smooth[i] });
  }
  return { gainM: Math.round(gain), lossM: Math.round(loss), profile };
}
