import { haversineKm } from '../../../shared/time.ts';
import type { TrackPoint } from '../../../shared/types.ts';

/**
 * Geometria di un tracciato pronta per il disegno vettoriale.
 *
 * - `chunks`: il path con TUTTI i punti (nessuna semplificazione, coordinate al decimo di pixel), diviso in tratti
 *   consecutivi, ognuno con il suo riquadro. Chi anima il disegno ridisegna così solo il tratto in corso (su Android
 *   react-native-svg rasterizza l'intera vista a ogni modifica: un riquadro piccolo costa molto meno di tutta la mappa).
 *   I tratti condividono il punto di giunzione: insieme contengono tutti i punti.
 * - `len`: lunghezza in pixel calcolata dalle STESSE coordinate del path (il tratteggio coincide con la linea disegnata).
 * - Tabelle per l'animazione (`input` → `frac`, `xs`, `ys`): `input` è la frazione di tempo reale se i punti hanno tempi
 *   crescenti, altrimenti la frazione di lunghezza; vale 0 al primo punto e 1 all'ultimo, sempre crescente.
 *
 * Funzioni pure, senza dipendenze da React Native: si provano con vitest.
 */
export interface RouteChunk {
  /** Path nelle coordinate locali del riquadro (origine in x, y). */
  d: string;
  /**
   * Riquadro nel sistema della vista (dp), margine per lo spessore della linea già incluso. Con `px` l'origine cade su un
   * pixel fisico intero: tutti i riquadri si arrotondano allo stesso modo e le giunzioni restano allineate.
   */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lunghezza del percorso prima del tratto e lunghezza del tratto, in pixel. */
  start: number;
  len: number;
}

/** Tabelle minime per seguire il tracciato (le uniche da passare al thread UI). */
export interface RouteTables {
  input: number[];
  frac: number[];
  xs: number[];
  ys: number[];
  /** Lunghezza totale in pixel (0 se tutti i punti coincidono). */
  len: number;
}

export interface RouteGeometry extends RouteTables {
  chunks: RouteChunk[];
  /** Lunghezza del path (px) fino a ogni punto del tracciato: cum[i] per il punto i (solo thread JS). */
  cum: number[];
  /** true se le tabelle seguono il tempo reale della registrazione. */
  timed: boolean;
}

/** Posizione sul tracciato: lunghezza percorsa (px) e punto. */
export interface RoutePos {
  s: number;
  x: number;
  y: number;
}

export type Projector = (p: { lat: number; lng: number }) => { x: number; y: number };

export interface LatLngBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Bordi della porzione di mappa visibile (gradi). */
export interface MapEdges {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Significato del centro di una regione: Apple Maps (iOS) dà il centro della vista, cioè il punto medio in Mercatore;
 * react-native-maps su Android dà il punto medio in latitudine dei bordi visibili (LatLngBounds.getCenter).
 */
export type RegionCenter = 'mercator' | 'latitude';

export interface GeometryOptions {
  /** Margine dei riquadri dei tratti (metà dello spessore massimo disegnato + arrotondamenti). */
  margin?: number;
  /** Dimensioni della vista: limitano la somma delle aree dei riquadri (memoria). */
  view?: { w: number; h: number };
  /** Pixel fisici per dp (PixelRatio.get()): allinea l'origine dei riquadri alla griglia dello schermo. */
  px?: number;
}

const RAD = Math.PI / 180;
const cache = new Map<string, RouteGeometry>();
/** Poche geometrie bastano (riapertura della stessa schermata); ognuna può pesare qualche centinaio di kB. */
const CACHE_MAX = 8;
/** Punti chiave delle tabelle di animazione; il path disegnato contiene sempre tutti i punti. */
const MAX_KEYS = 4000;
/** Lunghezza indicativa di un tratto (px) e limiti. */
const CHUNK_PX = 160;
const MAX_CHUNKS = 24;
const MAX_CHUNK_SEGS = 700;
/** Somma delle aree dei riquadri ≤ AREA_BUDGET × area della vista. */
const AREA_BUDGET = 3;
/** Ricerca del punto di giunzione: ± punti attorno alla posizione ideale. */
const CUT_WINDOW = 8;

const keys = new WeakMap<TrackPoint[], string>();

/**
 * Chiave di un tracciato calcolata da TUTTI i punti (due hash a 32 bit su lat/lng al 1e-7 e tempi al millisecondo).
 * Non bastano numero di punti ed estremi: i tracciati Strava hanno sempre 900 punti e t = 0, quindi due percorsi
 * diversi con la stessa partenza e lo stesso arrivo avrebbero la stessa chiave (geometria in cache sbagliata).
 * Memorizzata per array (WeakMap): richiamarla a ogni render del genitore non ricalcola nulla.
 */
export function trackKey(t: TrackPoint[]): string {
  const hit = keys.get(t);
  if (hit !== undefined) return hit;
  let a = 0x811c9dc5 | 0;
  let b = 0x2545f491 | 0;
  const mix = (v: number) => {
    a = Math.imul(a ^ v, 0x01000193);
    b = Math.imul(b ^ v, 0x5bd1e995);
    b ^= b >>> 13;
  };
  for (const p of t) {
    mix(Math.round(p.lat * 1e7) | 0);
    mix(Math.round(p.lng * 1e7) | 0);
    const ms = Math.round(p.t * 1000);
    mix(ms | 0);
    mix(Math.floor(ms / 4294967296) | 0);
  }
  const key = `${t.length}:${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
  keys.set(t, key);
  return key;
}

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

/** Riquadro geografico del tracciato. */
export function trackBox(track: TrackPoint[]): LatLngBox | null {
  if (!track.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of track) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Bordi di una regione secondo il significato del suo centro (vedi RegionCenter). */
export function edgesOfRegion(r: MapRegion, center: RegionCenter = 'mercator'): MapEdges {
  const d = r.latitudeDelta;
  let north = r.latitude + d / 2;
  if (center === 'mercator') {
    // Il centro è a metà in Mercatore: merc(N) + merc(N − d) = 2·merc(c). Newton, converge in 2-3 passi.
    const m2 = 2 * merc(r.latitude);
    for (let k = 0; k < 4; k++) {
      const g = merc(north) + merc(north - d) - m2;
      const gp = RAD / Math.cos(north * RAD) + RAD / Math.cos((north - d) * RAD);
      const next = north - g / gp;
      if (!Number.isFinite(next)) break;
      north = next;
    }
    if (!Number.isFinite(north)) north = r.latitude + d / 2;
  }
  return { north, south: north - d, west: r.longitude - r.longitudeDelta / 2, east: r.longitude + r.longitudeDelta / 2 };
}

/** Proiezione dai bordi visibili alla vista (w × h px): x lineare in longitudine, y in Mercatore. */
export function edgesProjector(e: MapEdges, w: number, h: number): Projector {
  const top = merc(e.north);
  const span = top - merc(e.south);
  const dl = e.east - e.west;
  return (p) => ({ x: ((p.lng - e.west) / dl) * w, y: ((top - merc(p.lat)) / span) * h });
}

/** Proiezione di un riquadro di mappa (regione visibile) in pixel: x lineare in longitudine, y in Mercatore. */
export function regionProjector(r: MapRegion, w: number, h: number, center: RegionCenter = 'mercator'): Projector {
  return edgesProjector(edgesOfRegion(r, center), w, h);
}

/** Bordi utilizzabili per una proiezione (niente valori assurdi, niente antimeridiano). */
export function validEdges(e: MapEdges): boolean {
  const { north, south, east, west } = e;
  if (![north, south, east, west].every(Number.isFinite)) return false;
  return north > south && east > west && north - south < 60 && east - west < 90 && north < 85.05 && south > -85.05;
}

/** I bordi contengono il tracciato (con tolleranza in frazione dell'ampiezza): scarta regioni precedenti all'adattamento. */
export function edgesCover(e: MapEdges, b: LatLngBox, tol = 0.03): boolean {
  const tl = (e.north - e.south) * tol;
  const tg = (e.east - e.west) * tol;
  return b.minLat >= e.south - tl && b.maxLat <= e.north + tl && b.minLng >= e.west - tg && b.maxLng <= e.east + tg;
}

/** Ampiezza in latitudine sotto cui la mappa è al massimo ingrandimento o quasi (~550 m): lì il riempimento non conta. */
const CLOSE_SPAN = 0.005;

/**
 * Il tracciato riempie davvero la vista (adattamento avvenuto): almeno `minFill` dell'ampiezza in una delle due
 * direzioni, oppure la vista è già molto ravvicinata. Scarta la regione iniziale della mappa (su iOS, per esempio,
 * il Paese intero): contiene il tracciato, ma lo ridurrebbe a pochi pixel e il disegno partirebbe da una proiezione sbagliata.
 */
export function edgesFit(e: MapEdges, b: LatLngBox, minFill = 0.2): boolean {
  if (e.north - e.south <= CLOSE_SPAN) return true;
  const fy = (merc(b.maxLat) - merc(b.minLat)) / (merc(e.north) - merc(e.south));
  const fx = (b.maxLng - b.minLng) / (e.east - e.west);
  return Math.max(fx, fy) >= minFill;
}

/**
 * Indici dei punti in cui si chiude un giro, con la STESSA regola di countLaps (shared/track.ts): ritorno entro
 * `radiusKm` dalla partenza dopo essersi allontanati, e almeno `minLapKm` dall'ultimo giro. Con più di un giro,
 * `lapEnds(t).length === countLaps(t)`: l'indicazione "Giro N di M" segue i passaggi veri, non una divisione in parti uguali.
 */
export function lapEnds(track: TrackPoint[], radiusKm = 0.04, minLapKm = 0.3): number[] {
  const out: number[] = [];
  if (track.length < 3) return out;
  const start = track[0];
  let far = false;
  let since = 0;
  for (let i = 1; i < track.length; i++) {
    since += haversineKm(track[i - 1], track[i]);
    const d = haversineKm(start, track[i]);
    if (d > radiusKm * 2) far = true;
    if (far && d <= radiusKm && since >= minLapKm) {
      out.push(i);
      far = false;
      since = 0;
    }
  }
  return out;
}

/** Bordi praticamente uguali (differenza ≤ rel × ampiezza: con 5e-4 meno di 0,2 px su 340 px). */
export function edgesClose(a: MapEdges, b: MapEdges, rel = 5e-4): boolean {
  const tl = (a.north - a.south) * rel;
  const tg = (a.east - a.west) * rel;
  return Math.abs(a.north - b.north) <= tl && Math.abs(a.south - b.south) <= tl && Math.abs(a.east - b.east) <= tg && Math.abs(a.west - b.west) <= tg;
}

/** Proiezione "adatta al riquadro": mantiene proporzioni e forma, con margine. */
export function fitProjector(track: TrackPoint[], w: number, h: number, pad: number): Projector {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of track) {
    const x = p.lng;
    const y = merc(p.lat) * (180 / Math.PI);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanY * s) / 2;
  return (p) => ({ x: ox + (p.lng - minX) * s, y: oy + (maxY - merc(p.lat) * (180 / Math.PI)) * s });
}

/** Punti con tempi reali crescenti (registrazione GPS dell'app): il replay può seguire il tempo vero. */
export function isTimedTrack(t: TrackPoint[]): boolean {
  if (t.length <= 2 || !(t[t.length - 1].t > t[0].t)) return false;
  for (let i = 1; i < t.length; i++) if (!(t[i].t >= t[i - 1].t)) return false;
  return true;
}

/**
 * Costruisce (o riprende dalla cache) la geometria. La chiave deve identificare tracciato E proiezione
 * (dimensioni della vista e bordi), perché il risultato dipende da entrambi.
 */
export function buildGeometry(key: string, track: TrackPoint[], project: Projector, opts: GeometryOptions = {}): RouteGeometry {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // in coda: la più usata di recente resta
    cache.set(key, hit);
    return hit;
  }
  const n = track.length;
  // Coordinate in decimi di pixel (interi): path, lunghezze e riquadri usano gli stessi valori. Un punto non
  // proiettabile resta sul precedente (o, in testa, sul primo valido): mai un segmento inventato verso l'angolo (0, 0).
  const tx: number[] = new Array(n);
  const ty: number[] = new Array(n);
  let lastX = NaN;
  let lastY = NaN;
  let firstOk = -1;
  for (let i = 0; i < n; i++) {
    const q = project(track[i]);
    if (Number.isFinite(q.x) && Number.isFinite(q.y)) {
      lastX = Math.round(q.x * 10);
      lastY = Math.round(q.y * 10);
      if (firstOk < 0) firstOk = i;
    }
    tx[i] = lastX;
    ty[i] = lastY;
  }
  for (let i = 0; i < n && (firstOk < 0 || i < firstOk); i++) {
    tx[i] = firstOk < 0 ? 0 : tx[firstOk];
    ty[i] = firstOk < 0 ? 0 : ty[firstOk];
  }
  const cum: number[] = new Array(n);
  for (let i = 0; i < n; i++) cum[i] = i ? cum[i - 1] + Math.hypot(tx[i] - tx[i - 1], ty[i] - ty[i - 1]) / 10 : 0;
  const len = n ? cum[n - 1] : 0;

  const timed = isTimedTrack(track);
  const T = timed ? track[n - 1].t - track[0].t : 0;
  const step = Math.max(1, Math.ceil(n / MAX_KEYS));
  const input: number[] = [];
  const frac: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (i: number) => {
    const f = len > 0 ? cum[i] / len : n > 1 ? i / (n - 1) : 1;
    let x = timed ? (track[i].t - track[0].t) / T : f;
    const prev = input.length ? input[input.length - 1] : -1;
    if (x <= prev) x = prev + 1e-9; // tempi uguali: valori comunque crescenti
    input.push(x);
    frac.push(f);
    xs.push(tx[i] / 10);
    ys.push(ty[i] / 10);
  };
  for (let i = 0; i < n; i += step) push(i);
  if (n && (n - 1) % step) push(n - 1);
  // Chiusura esatta: 0 al primo punto, 1 all'ultimo.
  const lastIn = input.length ? input[input.length - 1] : 0;
  if (lastIn > 0) for (let k = 0; k < input.length; k++) input[k] /= lastIn;
  if (input.length) {
    input[input.length - 1] = 1;
    frac[frac.length - 1] = 1;
  }

  const margin = opts.margin ?? 8;
  const budget = opts.view ? opts.view.w * opts.view.h * AREA_BUDGET : Infinity;
  const px = opts.px && opts.px > 0 ? opts.px : 1;
  const chunks = makeChunks(tx, ty, cum, margin, budget, px);

  const g: RouteGeometry = { len, input, frac, xs, ys, chunks, cum, timed };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, g);
  return g;
}

/** Angolo (rad) tra il segmento che entra nel punto e quello che esce; alto se un segmento è nullo. */
function turnAt(tx: number[], ty: number[], c: number): number {
  const ax = tx[c] - tx[c - 1];
  const ay = ty[c] - ty[c - 1];
  const bx = tx[c + 1] - tx[c];
  const by = ty[c + 1] - ty[c];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1 || lb < 1) return 4; // segmento di lunghezza nulla: direzione indefinita
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
}

/** Indici di giunzione [0, …, n−1]: vicini a lunghezze uguali, preferendo punti dove la linea è dritta. */
function cutPoints(tx: number[], ty: number[], cum: number[], k: number): number[] {
  const n = tx.length;
  const len = cum[n - 1];
  const cuts = [0];
  for (let j = 1; j < k; j++) {
    const target = (len * j) / k;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const from = Math.max(cuts[cuts.length - 1] + 1, lo - CUT_WINDOW);
    const to = Math.min(n - 2, lo + CUT_WINDOW);
    if (from > to) continue;
    let best = Math.min(Math.max(lo, from), to);
    let bestScore = Infinity;
    for (let c = from; c <= to; c++) {
      const s = turnAt(tx, ty, c) + Math.abs(cum[c] - target) / CHUNK_PX;
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    }
    cuts.push(best);
  }
  cuts.push(n - 1);
  return cuts;
}

/** Riquadro (dp) dei punti s…e con margine; bordi sulla griglia dei pixel fisici (multipli di 1/px). */
function boxOf(tx: number[], ty: number[], s: number, e: number, margin: number, px: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = s; i <= e; i++) {
    if (tx[i] < minX) minX = tx[i];
    if (tx[i] > maxX) maxX = tx[i];
    if (ty[i] < minY) minY = ty[i];
    if (ty[i] > maxY) maxY = ty[i];
  }
  const x0 = Math.floor((minX / 10 - margin) * px) / px;
  const y0 = Math.floor((minY / 10 - margin) * px) / px;
  const x1 = Math.ceil((maxX / 10 + margin) * px) / px;
  const y1 = Math.ceil((maxY / 10 + margin) * px) / px;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/** Coordinata locale al centesimo di pixel (stringhe brevi, errore trascurabile). */
const local = (v: number) => Math.round(v * 100) / 100;

function makeChunks(tx: number[], ty: number[], cum: number[], margin: number, budget: number, px: number): RouteChunk[] {
  const n = tx.length;
  if (!n) return [];
  const len = cum[n - 1];
  let k = n < 2 || len <= 0 ? 1 : Math.min(MAX_CHUNKS, Math.max(1, Math.round(len / CHUNK_PX), Math.ceil((n - 1) / MAX_CHUNK_SEGS)));
  let cuts = k > 1 ? cutPoints(tx, ty, cum, k) : [0, n - 1];
  let boxes = cuts.slice(1).map((e, j) => boxOf(tx, ty, cuts[j], e, margin, px));
  // Molti giri sullo stesso anello: i riquadri si sovrappongono, quindi meno tratti (memoria limitata).
  for (let guard = 0; guard < 8 && cuts.length > 2; guard++) {
    if (boxes.reduce((a, b) => a + b.w * b.h, 0) <= budget) break;
    k = Math.max(1, Math.floor((cuts.length - 1) * 0.7));
    cuts = k > 1 ? cutPoints(tx, ty, cum, k) : [0, n - 1];
    boxes = cuts.slice(1).map((e, j) => boxOf(tx, ty, cuts[j], e, margin, px));
  }
  return boxes.map((b, j) => {
    const s = cuts[j];
    const e = cuts[j + 1];
    let d = '';
    for (let i = s; i <= e; i++) d += `${i === s ? 'M' : 'L'}${local(tx[i] / 10 - b.x0)} ${local(ty[i] / 10 - b.y0)}`;
    return { d, x: b.x0, y: b.y0, w: b.w, h: b.h, start: cum[s], len: cum[e] - cum[s] };
  });
}

/**
 * Posizione sul tracciato alla frazione di replay `p` (0…1): ricerca binaria sulle tabelle e interpolazione lineare.
 * Gira anche sul thread UI (worklet) a ogni frame.
 */
export function sampleRoute(g: RouteTables, p: number): RoutePos {
  'worklet';
  const n = g.input.length;
  if (n === 0) return { s: 0, x: 0, y: 0 };
  const last = n - 1;
  if (!(p > g.input[0])) return { s: g.frac[0] * g.len, x: g.xs[0], y: g.ys[0] };
  if (p >= g.input[last]) return { s: g.len, x: g.xs[last], y: g.ys[last] };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.input[mid] <= p) lo = mid;
    else hi = mid;
  }
  const a = g.input[lo];
  const span = g.input[hi] - a;
  const k = span > 0 ? (p - a) / span : 1;
  return {
    s: (g.frac[lo] + (g.frac[hi] - g.frac[lo]) * k) * g.len,
    x: g.xs[lo] + (g.xs[hi] - g.xs[lo]) * k,
    y: g.ys[lo] + (g.ys[hi] - g.ys[lo]) * k,
  };
}

/**
 * Scostamento del tratteggio di un tratto lungo `len` che inizia a `start`, con la testa a `s` px dall'inizio del
 * percorso. Va usato con strokeDasharray [len + 2, len + 6]: è visibile esattamente [0, s − start]; un tratto non
 * ancora raggiunto non mostra nulla (nemmeno il puntino del terminale arrotondato).
 */
export function chunkDashOffset(s: number, start: number, len: number): number {
  'worklet';
  const v = Math.min(len, Math.max(0, s - start));
  return v > 0 ? len + 2 - v : len + 4;
}
