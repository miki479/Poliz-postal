import { describe, expect, it } from 'vitest';

import {
  buildGeometry,
  chunkDashOffset,
  edgesClose,
  edgesCover,
  edgesFit,
  edgesOfRegion,
  edgesProjector,
  isTimedTrack,
  lapEnds,
  regionProjector,
  sampleRoute,
  trackBox,
  trackKey,
  validEdges,
  type MapEdges,
  type RouteGeometry,
} from '../mobile/src/lib/routeGeometry.ts';
import { countLaps } from '../shared/track.ts';

const RAD = Math.PI / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const unmerc = (m: number) => (2 * Math.atan(Math.exp(m)) - Math.PI / 2) / RAD;

/** Tre giri di un anello attorno a Torino, un punto al secondo (tempi reali crescenti). */
const ring = (n: number, laps = 3, t0 = 1000) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * 2 * Math.PI * laps;
    return { lat: 45.07 + 0.004 * Math.sin(a), lng: 7.68 + 0.0056 * Math.cos(a) + i * 2e-7, t: t0 + i };
  });

const EDGES: MapEdges = { north: 45.08, south: 45.06, east: 7.70, west: 7.66 };
const W = 390;
const H = 340;

let seq = 0;
const geo = (track: { lat: number; lng: number; t: number }[], opts: Parameters<typeof buildGeometry>[3] = {}, e = EDGES): RouteGeometry =>
  buildGeometry(`test-${seq++}`, track, edgesProjector(e, W, H), { view: { w: W, h: H }, ...opts });

/** Punti (x, y) di un path "M… L…". */
const points = (d: string) => (d.match(/[ML][^ML]+/g) ?? []).map((s) => s.slice(1).trim().split(' ').map(Number));

/** Tutti i punti disegnati, nel sistema della vista: i tratti in fila, senza ripetere il punto di giunzione. */
const drawn = (g: RouteGeometry) => {
  const out: number[][] = [];
  g.chunks.forEach((c, j) => {
    const pts = points(c.d).map(([x, y]) => [x + c.x, y + c.y]);
    out.push(...(j ? pts.slice(1) : pts));
  });
  return out;
};

/** Punti del tracciato proiettati come fa buildGeometry (decimo di pixel). */
const projected = (track: { lat: number; lng: number }[], e = EDGES) => {
  const p = edgesProjector(e, W, H);
  return track.map((q) => {
    const r = p(q);
    return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10];
  });
};

const pathLen = (pts: number[][]) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
};

/** Lunghezza visibile di un tratto lungo `len` con il tratteggio [len + 2, len + 6] e lo scostamento dato. */
const visible = (offset: number, len: number) => (offset < len + 2 ? Math.min(len, len + 2 - offset) : 0);

describe('regione e proiezione', () => {
  it('bordi da una regione con centro in Mercatore (iOS) e in latitudine (Android)', () => {
    const lng = (EDGES.east + EDGES.west) / 2;
    const dLng = EDGES.east - EDGES.west;
    const dLat = EDGES.north - EDGES.south;
    const ios = edgesOfRegion({ latitude: unmerc((merc(EDGES.north) + merc(EDGES.south)) / 2), longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng }, 'mercator');
    const android = edgesOfRegion({ latitude: (EDGES.north + EDGES.south) / 2, longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng }, 'latitude');
    for (const e of [ios, android]) {
      expect(e.north).toBeCloseTo(EDGES.north, 9);
      expect(e.south).toBeCloseTo(EDGES.south, 9);
      expect(e.east).toBeCloseTo(EDGES.east, 9);
      expect(e.west).toBeCloseTo(EDGES.west, 9);
    }
    // ad alte latitudini i due significati del centro differiscono davvero
    const far = { latitude: 60, longitude: 10, latitudeDelta: 4, longitudeDelta: 4 };
    expect(Math.abs(edgesOfRegion(far, 'mercator').north - edgesOfRegion(far, 'latitude').north)).toBeGreaterThan(0.05);
  });

  it('gli angoli della vista e il centro in Mercatore cadono dove devono', () => {
    const p = edgesProjector(EDGES, W, H);
    const nw = p({ lat: EDGES.north, lng: EDGES.west });
    const se = p({ lat: EDGES.south, lng: EDGES.east });
    expect(nw.x).toBeCloseTo(0, 9);
    expect(nw.y).toBeCloseTo(0, 9);
    expect(se.x).toBeCloseTo(W, 9);
    expect(se.y).toBeCloseTo(H, 9);
    const mid = p({ lat: unmerc((merc(EDGES.north) + merc(EDGES.south)) / 2), lng: (EDGES.east + EDGES.west) / 2 });
    expect(mid.x).toBeCloseTo(W / 2, 9);
    expect(mid.y).toBeCloseTo(H / 2, 9);
    const r = regionProjector({ latitude: (EDGES.north + EDGES.south) / 2, longitude: 7.68, latitudeDelta: 0.02, longitudeDelta: 0.04 }, W, H, 'latitude')({ lat: 45.07, lng: 7.68 });
    expect(r.x).toBeCloseTo(W / 2, 6);
  });

  it('bordi validi, copertura del tracciato e bordi quasi uguali', () => {
    expect(validEdges(EDGES)).toBe(true);
    expect(validEdges({ north: 10, south: 20, east: 1, west: 0 })).toBe(false); // invertiti
    expect(validEdges({ north: 80, south: -80, east: 180, west: -180 })).toBe(false); // mondo intero: non è l'adattamento
    expect(validEdges({ north: NaN, south: 0, east: 1, west: 0 })).toBe(false);
    const box = trackBox(ring(200))!;
    expect(edgesCover(EDGES, box)).toBe(true);
    expect(edgesCover({ ...EDGES, north: 45.072 }, box)).toBe(false);
    expect(edgesClose(EDGES, { ...EDGES, north: EDGES.north + 1e-6 })).toBe(true);
    expect(edgesClose(EDGES, { ...EDGES, north: EDGES.north + 1e-4 })).toBe(false);
  });
});

describe('geometria del tracciato', () => {
  it('il path disegnato contiene TUTTI i punti, nella posizione proiettata, e la lunghezza è quella del path', () => {
    const track = ring(900);
    const g = geo(track);
    const pts = drawn(g);
    const src = projected(track);
    expect(pts).toHaveLength(track.length);
    pts.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(src[i][0], 1);
      expect(y).toBeCloseTo(src[i][1], 1);
    });
    expect(g.len).toBeCloseTo(pathLen(src), 6);
    expect(g.len).toBeGreaterThan(500);
    // ogni tratto ha la lunghezza dei suoi segmenti (il tratteggio coincide con la linea)
    for (const c of g.chunks) expect(pathLen(points(c.d))).toBeCloseTo(c.len, 0);
  });

  it('tabelle crescenti da 0 a 1; tempo reale solo con tempi crescenti', () => {
    const g = geo(ring(900));
    expect(g.timed).toBe(true);
    expect(g.input[0]).toBe(0);
    expect(g.input[g.input.length - 1]).toBe(1);
    expect(g.frac[0]).toBe(0);
    expect(g.frac[g.frac.length - 1]).toBe(1);
    for (let i = 1; i < g.input.length; i++) expect(g.input[i]).toBeGreaterThan(g.input[i - 1]);
    const flat = geo(ring(900).map((p) => ({ ...p, t: 0 }))); // es. import da Strava senza tempi
    expect(flat.timed).toBe(false);
    expect(flat.input).toEqual(flat.frac);
    expect(isTimedTrack(ring(10))).toBe(true);
    expect(isTimedTrack(ring(10).map((p, i) => ({ ...p, t: i === 5 ? 0 : p.t })))).toBe(false);
  });

  it('i tratti coprono il path senza buchi: tutti i punti, giunzioni condivise, lunghezze che si sommano', () => {
    const track = ring(900);
    const g = geo(track, { margin: 9 });
    expect(g.chunks.length).toBeGreaterThan(1);
    expect(g.chunks.length).toBeLessThanOrEqual(24);
    const all = projected(track);
    let k = 0;
    let start = 0;
    for (const c of g.chunks) {
      expect(c.start).toBeCloseTo(start, 6);
      start += c.len;
      const pts = points(c.d);
      if (k > 0) k -= 1; // il primo punto del tratto è l'ultimo del precedente
      for (const [x, y] of pts) {
        expect(x + c.x).toBeCloseTo(all[k][0], 1);
        expect(y + c.y).toBeCloseTo(all[k][1], 1);
        // dentro il riquadro, con il margine per lo spessore
        expect(x).toBeGreaterThanOrEqual(9 - 0.01);
        expect(y).toBeGreaterThanOrEqual(9 - 0.01);
        expect(x).toBeLessThanOrEqual(c.w - 9 + 0.01);
        expect(y).toBeLessThanOrEqual(c.h - 9 + 0.01);
        k++;
      }
    }
    expect(k).toBe(track.length);
    expect(start).toBeCloseTo(g.len, 6);
  });

  it('origine dei riquadri sulla griglia dei pixel fisici', () => {
    const px = 2.75;
    const g = geo(ring(600), { px });
    for (const c of g.chunks) {
      expect(Math.abs(c.x * px - Math.round(c.x * px))).toBeLessThan(1e-6);
      expect(Math.abs(c.y * px - Math.round(c.y * px))).toBeLessThan(1e-6);
      expect(Math.abs((c.x + c.w) * px - Math.round((c.x + c.w) * px))).toBeLessThan(1e-6);
    }
  });

  it('molti giri sullo stesso anello: meno tratti, memoria limitata', () => {
    const many = ring(4000, 25);
    const g = geo(many);
    const area = g.chunks.reduce((a, c) => a + c.w * c.h, 0);
    expect(area).toBeLessThanOrEqual(3 * W * H);
  });

  it('tracciati lunghi (5000+ punti): tabelle limitate, path comunque completo, testa sempre in avanti', () => {
    const big = ring(12000, 4);
    const g = geo(big);
    const pts = drawn(g);
    expect(pts).toHaveLength(12000);
    expect(g.chunks.length).toBeLessThanOrEqual(24);
    expect(g.input.length).toBeLessThanOrEqual(4001);
    const src = projected(big);
    expect(g.xs[g.xs.length - 1]).toBe(src[11999][0]);
    expect(g.ys[g.ys.length - 1]).toBe(src[11999][1]);
    let prev = -1;
    for (let p = 0; p <= 1; p += 1 / 997) {
      const s = sampleRoute(g, p).s;
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
    expect(sampleRoute(g, 1).s).toBe(g.len);
  });

  it('stessa chiave: stessa geometria dalla cache', () => {
    const track = ring(300);
    const p = edgesProjector(EDGES, W, H);
    const key = `${trackKey(track)}|cache`;
    expect(buildGeometry(key, track, p)).toBe(buildGeometry(key, track, p));
  });

  it('tracciati con 0, 1 o 2 punti, o tutti uguali: nessun errore, nessun valore non numerico', () => {
    const one = { lat: 45.07, lng: 7.68, t: 0 };
    for (const track of [[], [one], [one, { ...one, t: 5 }], [one, { lat: 45.071, lng: 7.681, t: 5 }], Array.from({ length: 50 }, () => one)]) {
      const g = geo(track);
      expect(Number.isFinite(g.len)).toBe(true);
      for (const v of [...g.input, ...g.frac, ...g.xs, ...g.ys]) expect(Number.isFinite(v)).toBe(true);
      for (const p of [0, 0.5, 1]) {
        const r = sampleRoute(g, p);
        expect([r.s, r.x, r.y].every(Number.isFinite)).toBe(true);
      }
      for (const c of g.chunks) expect([c.x, c.y, c.w, c.h, c.start, c.len].every(Number.isFinite)).toBe(true);
      expect(g.chunks.length).toBe(track.length ? 1 : 0);
    }
    expect(isTimedTrack([one, { ...one, t: 5 }])).toBe(false); // due punti: il replay uniforme coincide con quello temporale
  });

  it('un punto non proiettabile non crea segmenti inventati verso l’angolo della vista', () => {
    const track = ring(200, 1);
    const project = edgesProjector(EDGES, W, H);
    const bad = (q: { lat: number; lng: number }) => (q === track[0] || q === track[50] ? { x: NaN, y: NaN } : project(q));
    const g = buildGeometry(`test-${seq++}`, track, bad, { view: { w: W, h: H } });
    const pts = drawn(g);
    expect(pts).toHaveLength(200);
    expect(pts[0][0]).toBeCloseTo(pts[1][0], 6); // il primo resta sul primo valido
    expect(pts[50][0]).toBeCloseTo(pts[49][0], 6); // gli altri sul precedente
    for (const [x, y] of pts) expect(x > 0 && y > 0).toBe(true);
  });

  it('tracciato Strava (900 punti, senza tempi): replay sulla lunghezza, tutti i punti', () => {
    const strava = ring(900, 1).map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, t: 0 }));
    const g = geo(strava);
    expect(g.timed).toBe(false);
    expect(drawn(g)).toHaveLength(900);
    // a metà replay, metà della lunghezza disegnata
    expect(sampleRoute(g, 0.5).s).toBeCloseTo(g.len / 2, 0);
  });
});

describe('chiave del tracciato', () => {
  it('dipende da tutti i punti, non solo da numero ed estremi', () => {
    const a = ring(900, 1).map((p) => ({ ...p, t: 0 }));
    const b = a.map((p, i) => (i === 450 ? { ...p, lat: p.lat + 0.0003 } : p));
    expect(a.length).toBe(b.length);
    expect(a[0]).toEqual(b[0]);
    expect(a[899]).toEqual(b[899]);
    expect(trackKey(a)).not.toBe(trackKey(b));
    expect(trackKey(a.map((p, i) => (i === 10 ? { ...p, t: 1 } : p)))).not.toBe(trackKey(a));
  });

  it('stessi contenuti in un nuovo array: stessa chiave; stesso array: valore memorizzato', () => {
    const a = ring(500);
    const copy = a.map((p) => ({ ...p }));
    expect(trackKey(copy)).toBe(trackKey(a));
    expect(trackKey(a)).toBe(trackKey(a));
    expect(trackKey([])).toBe(trackKey([]));
    expect(trackKey([{ lat: 45, lng: 7, t: 1.7e12 }])).not.toBe(trackKey([{ lat: 45, lng: 7, t: 1.7e12 + 4294967296 }]));
  });
});

describe('giri e adattamento', () => {
  it('lapEnds segue la stessa regola di countLaps', () => {
    for (const laps of [2, 3, 5]) {
      const t = ring(300 * laps, laps);
      const ends = lapEnds(t);
      expect(ends).toHaveLength(countLaps(t));
      for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
    }
    expect(lapEnds(ring(2, 1))).toEqual([]);
  });

  it('edgesFit: scarta la regione iniziale (il Paese intero), accetta l’adattamento e le viste molto ravvicinate', () => {
    const box = trackBox(ring(400, 1))!;
    expect(edgesFit({ north: 47.1, south: 36.6, east: 18.5, west: 6.6 }, box)).toBe(false);
    expect(edgesFit(EDGES, box)).toBe(true);
    const dot = { minLat: 45.07, maxLat: 45.07, minLng: 7.68, maxLng: 7.68 };
    expect(edgesFit({ north: 45.0712, south: 45.0688, east: 7.6817, west: 7.6783 }, dot)).toBe(true);
  });
});

describe('replay', () => {
  it('la testa parte dal primo punto, arriva all’ultimo, e la lunghezza percorsa non torna mai indietro', () => {
    const g = geo(ring(900));
    const a = sampleRoute(g, 0);
    const z = sampleRoute(g, 1);
    expect([a.x, a.y, a.s]).toEqual([g.xs[0], g.ys[0], 0]);
    expect([z.x, z.y, z.s]).toEqual([g.xs[g.xs.length - 1], g.ys[g.ys.length - 1], g.len]);
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.001) {
      const s = sampleRoute(g, p).s;
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
  });

  it('replay temporale vero: durante una sosta la testa resta ferma', () => {
    const go = ring(200, 1);
    const last = go[go.length - 1];
    // sosta di 200 s nello stesso punto, poi si riparte
    const stop = { ...last, t: last.t + 200 };
    const back = ring(200, 1, stop.t + 1).map((p) => ({ ...p, lat: p.lat + 0.001 }));
    const g = geo([...go, stop, ...back]);
    const T = back[back.length - 1].t - go[0].t;
    const before = sampleRoute(g, (last.t - go[0].t + 20) / T);
    const after = sampleRoute(g, (last.t - go[0].t + 180) / T);
    expect(after.s).toBeCloseTo(before.s, 6);
    expect(after.x).toBeCloseTo(before.x, 6);
  });

  it('tratteggio dei tratti: nulla prima della testa, la parte giusta in corso, tutto dopo', () => {
    const len = 120;
    const start = 300;
    expect(visible(chunkDashOffset(0, start, len), len)).toBe(0);
    expect(visible(chunkDashOffset(start, start, len), len)).toBe(0);
    expect(visible(chunkDashOffset(start + 30, start, len), len)).toBeCloseTo(30, 9);
    expect(visible(chunkDashOffset(start + len, start, len), len)).toBeCloseTo(len, 9);
    expect(visible(chunkDashOffset(10_000, start, len), len)).toBeCloseTo(len, 9);
    // la testa a metà percorso: i tratti mostrano in totale esattamente la lunghezza percorsa
    const g = geo(ring(900));
    const s = g.len * 0.437;
    const shown = g.chunks.reduce((a, c) => a + visible(chunkDashOffset(s, c.start, c.len), c.len), 0);
    expect(shown).toBeCloseTo(s, 6);
  });
});
