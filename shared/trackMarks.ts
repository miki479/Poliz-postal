/**
 * Punti notevoli lungo un tracciato REALE: partenza, arrivo, chilometri, record su porzione.
 * Le posizioni vengono interpolate sulle coordinate e sui tempi registrati. Senza tempi reali (es. tracciato
 * importato da Strava, con t=0) non si ricostruisce nessun punto cronometrato: restano solo partenza e arrivo.
 */
import { splits, isTimed } from './track.ts';
import { haversineKm } from './time.ts';
import type { Award } from './records.ts';
import type { TrackPoint, WorkoutLog } from './types.ts';

export type MarkKind = 'start' | 'finish' | 'split' | 'record';

export interface TrackMark {
  id: string;
  kind: MarkKind;
  lat: number;
  lng: number;
  /** Etichetta breve sul marker (es. "1", "5"). */
  label: string;
  title: string;
  detail: string;
  /** Podio dei chilometri: 1 oro, 2 argento, 3 bronzo (solo per i pin dei km, a parità di tempi veri). */
  medal?: 1 | 2 | 3;
  /** Per i record: id dell'award associato. */
  awardId?: string;
  /** Exact recorded-time interval for a segment record. */
  fromT?: number;
  toT?: number;
}

const fmtSec = (s: number) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` : `${m}:${String(t % 60).padStart(2, '0')}`;
};

/** Punto a distanza cumulata `km` lungo la traccia (interpolazione lineare tra due punti consecutivi). */
function pointAt(track: TrackPoint[], cum: number[], km: number): { lat: number; lng: number } {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < km) i++;
  const seg = cum[i] - cum[i - 1];
  const f = seg > 0 ? Math.min(1, Math.max(0, (km - cum[i - 1]) / seg)) : 0;
  return { lat: track[i - 1].lat + (track[i].lat - track[i - 1].lat) * f, lng: track[i - 1].lng + (track[i].lng - track[i - 1].lng) * f };
}

function cumulative(track: TrackPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + haversineKm(track[i - 1], track[i]));
  return cum;
}

/** Fine (posizione) della porzione continua più veloce di `km`: coerente con bestSegmentSec. */
export function bestSegmentEnd(track: TrackPoint[], km: number): { lat: number; lng: number; sec: number; fromT: number; toT: number } | null {
  if (track.length < 2 || track.some((p) => p.breakBefore)) return null;
  const cum = cumulative(track);
  if (cum[cum.length - 1] < km) return null;
  let best: { j: number; sec: number; fromT: number } | null = null;
  let i = 0;
  for (let j = 1; j < track.length; j++) {
    const target = cum[j] - km;
    if (target < 0) continue;
    while (i + 1 < j && cum[i + 1] <= target) i++;
    const seg = cum[i + 1] - cum[i];
    const tAt = seg > 0 ? track[i].t + ((target - cum[i]) / seg) * (track[i + 1].t - track[i].t) : track[i].t;
    const sec = track[j].t - tAt;
    if (sec > 0 && (!best || sec < best.sec)) best = { j, sec, fromT: tAt };
  }
  return best ? { lat: track[best.j].lat, lng: track[best.j].lng, sec: Math.round(best.sec), fromT: best.fromT, toT: track[best.j].t } : null;
}

export function buildMarks(log: Pick<WorkoutLog, 'track' | 'id'>, awards: Award[]): TrackMark[] {
  const track = log.track;
  if (!track || track.length < 2) return [];
  const first = track[0];
  const last = track[track.length - 1];
  const out: TrackMark[] = [
    { id: 'start', kind: 'start', lat: first.lat, lng: first.lng, label: '', title: 'Partenza', detail: 'Punto di partenza registrato.' },
  ];
  if (isTimed(track) && !track.some((p) => p.breakBefore)) {
    const cum = cumulative(track);
    const sp = splits(track).filter((s) => s.distKm >= 1 - 1e-9);
    const every = sp.length > 15 ? 5 : sp.length > 8 ? 2 : 1;
    const order = [...sp].sort((a, b) => a.sec - b.sec);
    const medalOf = (km: number): 1 | 2 | 3 | undefined => { const i = order.findIndex((x) => x.km === km); return sp.length >= 4 && i >= 0 && i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined; };
    for (const s of sp) {
      if ((s.km % every !== 0 && s.km !== 1) && !medalOf(s.km)) continue;
      if (false) continue;
      if (s.km % every !== 0 && s.km !== 1) continue;
      const p = pointAt(track, cum, s.km);
      out.push({ id: `km${s.km}`, kind: 'split', lat: p.lat, lng: p.lng, label: String(s.km), title: `Km ${s.km}`, detail: `${fmtSec(s.sec)} · passo ${fmtSec(s.paceSecPerKm)}/km`, medal: medalOf(s.km) });
    }
    for (const a of awards) {
      const m = /^seg_(\d+)$/.exec(a.code);
      if (!m) continue;
      const end = bestSegmentEnd(track, Number(m[1]));
      if (!end) continue;
      out.push({ id: `rec_${a.code}`, kind: 'record', lat: end.lat, lng: end.lng, label: m[1], title: `Record sui ${m[1]} km`, detail: `${a.value}${a.previous ? ` · prima ${a.previous}` : ''}${a.improvement ? ` · ${a.improvement}` : ''}. Raggiunto qui.`, awardId: a.id, fromT: end.fromT, toT: end.toT });
    }
  }
  out.push({ id: 'finish', kind: 'finish', lat: last.lat, lng: last.lng, label: '', title: 'Arrivo', detail: 'Punto di arrivo registrato.' });
  return out;
}
