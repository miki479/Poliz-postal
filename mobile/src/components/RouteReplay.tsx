import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, PixelRatio, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withTiming, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { hexPath } from '@/components/TypeBadge';
import { useReduceMotion } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { buildGeometry, chunkDashOffset, edgesClose, edgesCover, edgesFit, edgesOfRegion, edgesProjector, isTimedTrack, lapEnds, sampleRoute, trackBox, trackKey, validEdges, type MapEdges, type RouteChunk, type RoutePos, type RouteTables } from '@/lib/routeGeometry';
import { countLaps } from '@shared/track.ts';
import type { TrackMark } from '@shared/trackMarks.ts';
import type { TrackPoint } from '@shared/types.ts';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const GOLD = '#F2B84B';
const START = '#4FD1A5';
const FINISH = '#FF5C6C';
/**
 * Traccia di base tenue: le sue proprietà non cambiano MAI. Su iOS ogni modifica di una polilinea (anche solo il colore)
 * la ricostruisce e la mappa la ridisegna in modo asincrono: un cambio di colore a fine disegno farebbe lampeggiare la linea.
 * A fine disegno si aggiunge invece una seconda polilinea piena, sopra.
 */
const BASE = 'rgba(255,255,255,0.18)';
const LINE_W = 5;
const HALO_W = 13;
const HALO_OPACITY = 0.26;
const HEAD = 18;
/** Margine dei riquadri vettoriali: metà dell'alone + arrotondamenti. */
const MARGIN = Math.ceil(HALO_W / 2) + 2;
/** La linea parte poco dopo che la mappa si è posata: un eventuale ritocco della regione resta invisibile. */
const LEAD_MS = 220;
const LOOP_PAUSE_MS = 1200;
/**
 * A disegno finito il livello vettoriale resta pieno per questo tempo, così la polilinea nativa piena appena aggiunta
 * (che su iOS la mappa disegna qualche fotogramma dopo) è già sotto quando il livello si dissolve: nessun vuoto.
 */
const HANDOFF_MS = 260;
const FADE_OUT_MS = 350;
/** Bordi visibili letti direttamente se l'evento di fine movimento tarda. */
const PROBE_MS = 350;
/** Senza regione entro questo tempo dalla mappa pronta: polilinea piena, senza animazione (mai schermo vuoto). */
const REGION_WAIT_MS = 1000;
/** Mappa mai pronta: la si mostra comunque, con la polilinea piena. */
const MAP_WAIT_MS = 4000;
/** Significato del centro della regione di react-native-maps (vedi routeGeometry.RegionCenter). */
const CENTER = Platform.OS === 'android' ? 'latitude' : 'mercator';
/**
 * Su iOS il tocco di un marker arriva anche alla mappa, circa 300 ms dopo (il riconoscitore del tocco singolo aspetta
 * che fallisca il doppio tocco): in questo intervallo il tocco sulla mappa non chiude la scheda appena aperta.
 */
const PIN_TAP_MS = 700;
/** Margini dell'adattamento al percorso (in basso cresce se ci sono i marker). */
const FIT_TOP = 70;
const FIT_SIDE = 50;
const ORIGIN: RoutePos = { s: 0, x: 0, y: 0 };
const NO_MARKS: TrackMark[] = [];
const NO_ENDS: number[] = [];

type Props = {
  track: TrackPoint[];
  style?: StyleProp<ViewStyle>;
  loop?: boolean;
  seconds?: number;
  paused?: boolean;
  marks?: TrackMark[];
  tint?: string;
  /** Interfaccia completa (dettaglio attività): controllo della vista in alto a destra e scheda del record mostrata a fine disegno. */
  chrome?: boolean;
  /** Spazio occupato in alto da un'intestazione trasparente: etichette e controlli scendono sotto. */
  insetTop?: number;
  /** Tocco sulla scheda di un marker con un riconoscimento (es. il record): apre il dettaglio. */
  onOpenMark?: (m: TrackMark) => void;
};

/** Testi della scheda in basso: per un record su porzione, valore e passo medio della porzione (dal tempo reale). */
function cardText(m: TrackMark): { title: string; detail: string } {
  if (m.kind !== 'record') return { title: m.title, detail: m.detail };
  const title = `Km ${m.label} – Record personale`;
  const km = Number(m.label);
  const v = /^(\d+):(\d{2})(?::(\d{2}))?/.exec(m.detail);
  if (!v || !(km > 0)) return { title, detail: m.detail };
  const sec = v[3] !== undefined ? Number(v[1]) * 3600 + Number(v[2]) * 60 + Number(v[3]) : Number(v[1]) * 60 + Number(v[2]);
  const pace = Math.round(sec / km);
  return { title, detail: `${v[0]} · ${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}/km` };
}

/**
 * Replay del percorso registrato.
 * - Dati e animazione separati: la polilinea nativa è solo la traccia di base, creata una volta. La parte percorsa è
 *   un livello vettoriale (react-native-svg) sopra la mappa, costruito UNA volta da tutti i punti (routeGeometry) e
 *   proiettato con la regione visibile; si ricalcola solo se cambiano regione o dimensioni.
 * - Animazione sul thread UI (Reanimated): un solo valore di progresso 0→1, lineare; tratteggio e punto di testa lo
 *   seguono. Nessun aggiornamento di stato React per frame. Punti con tempi crescenti (GPS dell'app): replay TEMPORALE
 *   accelerato (×N dichiarato); altrimenti rivelazione uniforme sulla lunghezza, senza velocità simulate.
 * - Il disegno parte UNA volta per tracciato (nuovo tracciato = nuovo montaggio), non per un re-render del genitore.
 *   `paused` sospende e riprende dal punto raggiunto; `loop` lo ripete, con una sosta.
 * - A disegno finito si aggiunge la polilinea nativa piena (quella di base non viene toccata), compaiono i marker
 *   (partenza, arrivo, km, record: dettagli al tocco) e il livello vettoriale, dopo una breve attesa, si dissolve.
 * - Adattamento e lettura dei bordi solo con mappa pronta E dimensioni note.
 * - Se la regione non arriva entro ~1 s, polilinea piena senza animazione. Con "Riduci movimento" il percorso compare
 *   intero, senza animazione né punto di testa.
 */
export function RouteReplay(props: Props) {
  return <Replay key={trackKey(props.track)} {...props} />;
}

function Replay({ track: incoming, style, loop = false, seconds, paused = false, marks, tint = color.storyInk, chrome = false, insetTop = 0, onOpenMark }: Props) {
  const reduceSys = useReducedMotion();
  const still = useReduceMotion() || reduceSys;
  // Il tracciato del montaggio: un nuovo array identico dal genitore non ricalcola nulla (la chiave è nel wrapper).
  const [track] = useState(incoming);
  const pins = useKeyed(marks ?? NO_MARKS, marksSig(marks));

  const tk = useMemo(() => trackKey(track), [track]);
  const coords = useMemo(() => track.map((p) => ({ latitude: p.lat, longitude: p.lng })), [track]);
  const laps = useMemo(() => countLaps(track), [track]);
  const box = useMemo(() => trackBox(track), [track]);
  const timed = useMemo(() => isTimedTrack(track), [track]);
  const realSec = timed ? track[track.length - 1].t - track[0].t : 0;
  // Durata ≥ 1 s: con `seconds` 0 o negativo l'etichetta "Replay ×N" non diventa infinita.
  const total = Math.max(1, seconds ?? Math.min(16, Math.max(6, laps * 3.5)));
  const speed = timed && realSec > 0 ? Math.max(1, Math.round(realSec / total)) : null;
  const padBottom = pins.length ? 110 : 70;
  const edgePadding = useMemo(() => ({ top: FIT_TOP, bottom: padBottom, left: FIT_SIDE, right: FIT_SIDE }), [padBottom]);
  const lapIdx = useMemo(() => (laps > 1 ? lapEnds(track) : NO_ENDS), [laps, track]);

  const map = useRef<MapView>(null);
  const alive = useRef(true);
  const mapOk = useRef(false);
  const fitted = useRef(false);
  const seq = useRef(0);
  const doneOnce = useRef(false);
  /** Giro di disegno già avviato (vale `cycle`): un nuovo giro parte da 0 senza rileggere il progresso dal thread UI. */
  const started = useRef(-1);
  const loopRef = useRef(loop);
  const stillRef = useRef(still);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  const pinAt = useRef(0);
  const probe = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const again = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [edges, setEdges] = useState<MapEdges | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [finished, setFinished] = useState(false);
  const [layerGone, setLayerGone] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [selected, setSelected] = useState<TrackMark | null>(null);
  /** Vista satellite (solo interfaccia: cambia lo sfondo, mai la traccia né l'animazione). */
  const [satellite, setSatellite] = useState(false);
  const autoCard = useRef(false);

  const progress = useSharedValue(0);
  const layer = useSharedValue(1);
  const fade = useSharedValue(0);

  const staticMode = still || fallback || track.length < 2;
  const px = PixelRatio.get();
  // Geometria: tutti i punti, proiettati con i bordi visibili. Cambia solo con regione o dimensioni (in cache).
  const g = useMemo(() => {
    if (staticMode || !size || !edges) return null;
    const key = `${tk}|${size.w}x${size.h}@${px}|${edges.north},${edges.south},${edges.east},${edges.west}`;
    return buildGeometry(key, track, edgesProjector(edges, size.w, size.h), { margin: MARGIN, view: size, px });
  }, [staticMode, size, edges, tk, track, px]);
  // Percorso più corto di 2 px sullo schermo (es. punti tutti uguali): niente da animare.
  const drawable = !!g && g.len >= 2;
  // Solo le tabelle vanno al thread UI (non i path).
  const tables = useMemo<RouteTables | null>(() => (g && drawable ? { input: g.input, frac: g.frac, xs: g.xs, ys: g.ys, len: g.len } : null), [g, drawable]);
  // Fine di ogni giro, in px lungo il path disegnato (passaggi veri dalla partenza).
  const ends = useMemo(() => (g && drawable && lapIdx.length ? lapIdx.map((i) => g.cum[i]) : NO_ENDS), [g, drawable, lapIdx]);
  const showFull = staticMode || finished || (!!g && !drawable);
  const ready = !!tables && !staticMode;

  const pos = useDerivedValue<RoutePos>(() => (tables ? sampleRoute(tables, progress.get()) : ORIGIN));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  useEffect(() => {
    loopRef.current = loop;
    stillRef.current = still;
  }, [loop, still]);

  // Pulizia allo smontaggio: animazioni ferme, timer annullati.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(probe.current);
      clearTimeout(again.current);
      cancelAnimation(progress);
      cancelAnimation(layer);
      cancelAnimation(fade);
    };
  }, [progress, layer, fade]);

  // Disegno: parte quando la geometria è pronta; "paused" lo sospende e lo riprende dal punto raggiunto.
  useEffect(() => {
    if (!ready || paused || doneOnce.current) return;
    // Nuovo giro: si parte da 0. Una lettura dal thread JS potrebbe ancora restituire 1 (l'azzeramento del loop è
    // asincrono) e bloccare il loop. Ripresa dopo una pausa: si legge il punto raggiunto.
    const fresh = started.current !== cycle;
    started.current = cycle;
    const from = fresh ? 0 : progress.get();
    if (from >= 1) return; // sosta tra un giro e l'altro del loop
    const dropLayer = () => {
      if (alive.current) setLayerGone(true);
    };
    const onDone = () => {
      if (!alive.current) return;
      const keep = loopRef.current;
      if (!keep) doneOnce.current = true;
      setFinished(true);
      cancelAnimation(layer);
      // La polilinea nativa piena compare sotto il livello vettoriale, poi questo si dissolve (e, senza loop, si smonta).
      layer.set(
        withDelay(
          HANDOFF_MS,
          withTiming(0, { duration: FADE_OUT_MS }, (fin) => {
            'worklet';
            if (fin && !keep) scheduleOnRN(dropLayer);
          }),
        ),
      );
      if (!keep) return;
      again.current = setTimeout(() => {
        if (!alive.current) return;
        if (!loopRef.current) {
          // Loop disattivato durante la sosta: il disegno resta finito.
          doneOnce.current = true;
          setLayerGone(true);
          return;
        }
        // Prima il progresso, poi il livello: nessun fotogramma con il percorso intero già visibile.
        progress.set(0);
        cancelAnimation(layer);
        layer.set(1);
        setSelected(null);
        setFinished(false);
        setCycle((c) => c + 1);
      }, LOOP_PAUSE_MS);
    };
    const run = withTiming(1, { duration: Math.max(16, (1 - from) * total * 1000), easing: Easing.linear }, (fin) => {
      'worklet';
      if (fin) scheduleOnRN(onDone);
    });
    if (fresh) progress.set(0);
    progress.set(from > 0 ? run : withDelay(LEAD_MS, run));
    return () => cancelAnimation(progress);
  }, [ready, paused, total, cycle, progress, layer]);

  // Mai schermo vuoto: senza regione utilizzabile entro ~1 s, percorso pieno senza animazione (di nuovo inquadrato,
  // nel caso il primo adattamento non sia andato a buon fine).
  useEffect(() => {
    if (staticMode || g || !mapReady) return;
    const id = setTimeout(() => {
      // Mai adattare una vista non misurata (su Android l'adattamento a dimensioni nulle non è ammesso).
      if (coords.length && sizeRef.current) map.current?.fitToCoordinates(coords, { edgePadding, animated: false });
      setFallback(true);
    }, REGION_WAIT_MS);
    return () => clearTimeout(id);
  }, [staticMode, g, mapReady, coords, edgePadding]);

  // Mappa che non diventa mai pronta: la si mostra comunque.
  useEffect(() => {
    const id = setTimeout(() => {
      if (mapOk.current) return;
      fade.set(stillRef.current ? 1 : withTiming(1, { duration: 300 }));
      setFallback(true);
    }, MAP_WAIT_MS);
    return () => clearTimeout(id);
  }, [fade]);

  const accept = (e: MapEdges) => {
    // Bordi utili solo con le dimensioni della vista: senza, la proiezione non ha senso e la verifica qui sotto salterebbe.
    const s = sizeRef.current;
    if (!box || !s || !validEdges(e) || !edgesCover(e, box)) return;
    // Solo bordi dopo l'adattamento: la regione iniziale (es. il Paese intero su iOS) contiene il tracciato ma non lo inquadra.
    if (!edgesFit(e, box, minFill(s, padBottom))) return;
    setEdges((cur) => (cur && edgesClose(cur, e) ? cur : e));
  };

  const fit = () => {
    if (coords.length && sizeRef.current) map.current?.fitToCoordinates(coords, { edgePadding, animated: false });
  };

  // Bordi esatti dalla mappa (indipendenti dal significato del centro della regione): confermano o correggono.
  const readBounds = () => {
    const m = map.current;
    if (!m) return;
    const n = seq.current;
    m.getMapBoundaries().then(
      (b) => {
        if (alive.current && n === seq.current) accept({ north: b.northEast.latitude, south: b.southWest.latitude, east: b.northEast.longitude, west: b.southWest.longitude });
      },
      () => {},
    );
  };

  const onRegionChangeComplete = (r: Region) => {
    if (!fitted.current || staticMode || layerGone) return;
    seq.current += 1;
    accept(edgesOfRegion(r, CENTER));
    readBounds();
  };

  /** Rilettura dei bordi poco dopo un adattamento, se l'evento di fine movimento tarda. */
  const probeSoon = () => {
    clearTimeout(probe.current);
    probe.current = setTimeout(readBounds, PROBE_MS);
  };

  /** Primo adattamento: serve la mappa pronta E la vista misurata (chi arriva per secondo lo avvia). */
  const startFit = () => {
    if (fitted.current || !mapOk.current || !sizeRef.current) return;
    fitted.current = true;
    fit();
    probeSoon();
  };

  const onMapReady = () => {
    const repeat = mapOk.current;
    mapOk.current = true;
    setMapReady(true);
    fade.set(still ? 1 : withTiming(1, { duration: 450 }));
    // Su Android la mappa può tornare "pronta" dopo essere stata staccata e riattaccata: si riadatta e si rilegge.
    if (repeat && fitted.current) {
      fit();
      probeSoon();
    } else startFit();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!(w > 0 && h > 0)) return;
    const prev = sizeRef.current;
    if (prev && prev.w === w && prev.h === h) return;
    sizeRef.current = { w, h };
    setSize({ w, h });
    if (!fitted.current) {
      startFit();
      return;
    }
    // Vista ridimensionata dopo l'adattamento: i bordi vecchi non valgono più con la nuova dimensione. Si riadatta,
    // si rileggono i bordi e intanto il livello vettoriale aspetta (la polilinea di base resta visibile).
    seq.current += 1;
    setEdges(null);
    fit();
    probeSoon();
  };

  const onPin = useCallback((m: TrackMark) => {
    pinAt.current = Date.now();
    setSelected(m);
  }, []);

  const onMapPress = () => {
    if (Date.now() - pinAt.current > PIN_TAP_MS) setSelected(null);
  };

  // Interfaccia completa: a disegno finito compare da sola la scheda del record più importante (una volta sola).
  useEffect(() => {
    if (!chrome || !showFull || autoCard.current) return;
    autoCard.current = true;
    const rec = pins.find((m) => m.kind === 'record');
    if (rec) setSelected(rec);
  }, [chrome, showFull, pins]);

  const openStart = () => {
    const s = track[0];
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${s.lat},${s.lng}&q=Partenza` : `geo:${s.lat},${s.lng}?q=${s.lat},${s.lng}(Partenza)`;
    Linking.openURL(url).catch(() => {});
  };

  const card = selected ? cardText(selected) : null;
  const canOpen = !!selected?.awardId && !!onOpenMark;
  const tagsTop = (chrome ? insetTop : 0) + S.md;

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: color.surface }, style]}>
      <Animated.View style={[styles.fill, fadeStyle]} onLayout={onLayout}>
        <MapView
          ref={map}
          style={styles.fill}
          userInterfaceStyle="dark"
          mapType={satellite ? 'hybrid' : 'mutedStandard'}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          moveOnMarkerPress={false}
          showsPointsOfInterests={false}
          onPress={onMapPress}
          accessibilityLabel="Mappa del percorso registrato"
          onMapReady={onMapReady}
          onRegionChangeComplete={onRegionChangeComplete}>
          {/* Base: coordinate create una volta, proprietà mai cambiate. La piena si aggiunge sopra a disegno finito. */}
          <Polyline coordinates={coords} strokeColor={BASE} strokeWidth={LINE_W} lineCap="round" lineJoin="round" zIndex={1} />
          {showFull ? <Polyline coordinates={coords} strokeColor={tint} strokeWidth={LINE_W} lineCap="round" lineJoin="round" zIndex={2} /> : null}
          {showFull ? pins.map((m) => <Pin key={m.id} mark={m} onPress={onPin} active={selected?.id === m.id} />) : null}
        </MapView>
        {g && tables && !staticMode && !layerGone ? <DrawLayer chunks={g.chunks} pos={pos} progress={progress} layer={layer} tint={tint} /> : null}
      </Animated.View>
      {chrome ? (
        <View style={[styles.tagsLeft, { top: tagsTop }]} pointerEvents="none">
          {laps > 1 ? <LapTag laps={laps} ends={ends} pos={pos} done={showFull} /> : null}
          {!showFull ? <Tag text={speed ? `Replay ×${speed}` : 'Tracciato'} /> : null}
        </View>
      ) : (
        <View style={[styles.tags, { top: tagsTop }]} pointerEvents="none">
          {laps > 1 ? <LapTag laps={laps} ends={ends} pos={pos} done={showFull} /> : <View />}
          {!showFull ? <Tag text={speed ? `Replay ×${speed}` : 'Tracciato'} /> : null}
        </View>
      )}
      {chrome && track.length ? (
        <View style={[styles.controls, { top: insetTop + S.sm }]}>
          <MapControl name={satellite ? 'map' : 'layers'} label={satellite ? 'Mostra la mappa scura' : 'Mostra la vista satellitare'} onPress={() => setSatellite((v) => !v)} on={satellite} />
          <MapControl name="navigate" label="Apri il punto di partenza nell’app Mappe" onPress={openStart} />
        </View>
      ) : null}
      {selected && card ? (
        <Pressable
          onPress={() => (canOpen ? onOpenMark!(selected) : setSelected(null))}
          accessibilityRole="button"
          accessibilityLabel={`${card.title}. ${card.detail}. ${canOpen ? 'Tocca per i dettagli' : 'Tocca per chiudere'}`}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
          <MarkIcon mark={selected} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.headline, { color: color.storyInk }]} numberOfLines={1}>
              {card.title}
            </Text>
            <Text style={[type.footnote, { color: color.storyInkSecondary, fontVariant: ['tabular-nums'] }]} numberOfLines={2}>
              {card.detail}
            </Text>
          </View>
          <Ionicons name={canOpen ? 'chevron-forward' : 'close'} size={18} color={color.storyInkSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pulsante tondo sopra la mappa (solo interfaccia: vista e collegamento all'app Mappe). */
function MapControl({ name, label, onPress, on }: { name: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} hitSlop={4} style={({ pressed }) => [styles.control, on && { backgroundColor: color.accent }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={name} size={20} color={on ? color.onAccent : color.storyInk} />
    </Pressable>
  );
}

/** Icona della scheda in basso: trofeo per il record, gli stessi segni dei marker per gli altri punti. */
function MarkIcon({ mark }: { mark: TrackMark }) {
  const box = { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } as const;
  if (mark.kind === 'record')
    return (
      <View style={[box, { backgroundColor: 'rgba(242,184,75,0.18)' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="trophy" size={22} color={GOLD} />
      </View>
    );
  if (mark.kind === 'start')
    return (
      <View style={[box, { backgroundColor: 'rgba(79,209,165,0.16)' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: START, borderWidth: 3, borderColor: color.storyInk }} />
      </View>
    );
  if (mark.kind === 'finish')
    return (
      <View style={[box, { backgroundColor: 'rgba(255,92,108,0.16)' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="flag" size={18} color={FINISH} />
      </View>
    );
  return (
    <View style={[box, { backgroundColor: color.storyGlass }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[type.headline, { color: color.storyInk }]} allowFontScaling={false}>
        {mark.label}
      </Text>
    </View>
  );
}

/** Marker del record: esagono (stessa forma dei riconoscimenti) con la stella. */
const REC_HEX = 34;
const REC_HEX_D = hexPath(REC_HEX);

/**
 * Livello vettoriale della parte percorsa: un riquadro SVG per tratto (solo quello in corso si ridisegna) e il punto di
 * testa, una vista spostata sul thread UI. Decorativo e trasparente ai tocchi.
 */
const DrawLayer = memo(function DrawLayer({ chunks, pos, progress, layer, tint }: { chunks: RouteChunk[]; pos: DerivedValue<RoutePos>; progress: SharedValue<number>; layer: SharedValue<number>; tint: string }) {
  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.get() }));
  const headStyle = useAnimatedStyle(() => {
    const p = pos.get();
    const t = progress.get();
    return { opacity: t > 0 ? Math.min(1, t * 60) : 0, transform: [{ translateX: p.x - HEAD / 2 }, { translateY: p.y - HEAD / 2 }] };
  });
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, layerStyle]}>
      {chunks.map((c, i) => (
        <Chunk key={i} chunk={c} pos={pos} tint={tint} />
      ))}
      <Animated.View style={[styles.head, { borderColor: tint }, headStyle]} />
    </Animated.View>
  );
});

/**
 * Un tratto: alone e linea con lo stesso tratteggio. Lo scostamento cambia solo mentre la testa è nel tratto (Reanimated
 * non invia proprietà uguali alle precedenti), così i tratti finiti o non ancora raggiunti non si ridisegnano.
 * L'alone ha estremi netti: i tratti si accostano senza sovrapporre la trasparenza alle giunzioni.
 */
const Chunk = memo(function Chunk({ chunk, pos, tint }: { chunk: RouteChunk; pos: DerivedValue<RoutePos>; tint: string }) {
  const { start, len } = chunk;
  const haloProps = useAnimatedProps(() => ({ strokeDashoffset: chunkDashOffset(pos.get().s, start, len) }));
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: chunkDashOffset(pos.get().s, start, len) }));
  const dash = useMemo(() => [len + 2, len + 6], [len]);
  return (
    <Svg width={chunk.w} height={chunk.h} style={{ position: 'absolute', left: chunk.x, top: chunk.y }}>
      <AnimatedPath d={chunk.d} fill="none" stroke={tint} strokeOpacity={HALO_OPACITY} strokeWidth={HALO_W} strokeLinecap="butt" strokeLinejoin="round" strokeDasharray={dash} animatedProps={haloProps} />
      <AnimatedPath d={chunk.d} fill="none" stroke={tint} strokeWidth={LINE_W} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} animatedProps={lineProps} />
    </Svg>
  );
});

/**
 * "Giro N di M": il giro cambia quando la testa passa davvero dalla partenza (`ends`, px lungo il path), non a frazioni
 * uguali della lunghezza. Aggiornato solo quando cambia il giro (pochi aggiornamenti per replay, non per frame).
 */
function LapTag({ laps, ends, pos, done }: { laps: number; ends: number[]; pos: DerivedValue<RoutePos>; done: boolean }) {
  const [lap, setLap] = useState(1);
  useAnimatedReaction(
    () => {
      const s = pos.get().s;
      let k = 0;
      while (k < ends.length && s >= ends[k]) k++;
      return Math.min(laps, k + 1);
    },
    (v, prev) => {
      if (v !== prev) scheduleOnRN(setLap, v);
    },
  );
  return <Tag text={`Giro ${done ? laps : lap} di ${laps}`} />;
}

/** Marker con simboli distinti: partenza (cerchio verde), arrivo (cerchio rosso), chilometro ("N km"), record (esagono con stella e km). */
const Pin = memo(function Pin({ mark, onPress, active }: { mark: TrackMark; onPress: (m: TrackMark) => void; active: boolean }) {
  // La vista del marker viene "fotografata" dalla mappa: si lascia aggiornare un attimo, poi si ferma (niente ridisegni continui).
  const [live, setLive] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLive(false), 600);
    return () => clearTimeout(id);
  }, [active]);
  useEffect(() => setLive(true), [active]);
  const size = 26;
  // Il record ha l'esagono centrato sul punto e l'etichetta dei km a destra: l'ancora resta sul centro dell'esagono.
  const recW = REC_HEX + 6 + 48;
  return (
    <Marker
      coordinate={{ latitude: mark.lat, longitude: mark.lng }}
      anchor={mark.kind === 'record' ? { x: REC_HEX / 2 / recW, y: 0.5 } : { x: 0.5, y: 0.5 }}
      tracksViewChanges={live}
      onPress={() => onPress(mark)}
      zIndex={mark.kind === 'record' ? 4 : mark.kind === 'split' ? 1 : 3}
      accessibilityLabel={`${mark.title}. ${mark.detail}`}>
      {mark.kind === 'start' ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: START, borderWidth: 4, borderColor: color.storyInk, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.storyInk }} />
        </View>
      ) : mark.kind === 'finish' ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: FINISH, borderWidth: 3, borderColor: color.storyInk, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 8, height: 8, backgroundColor: color.storyInk, transform: [{ rotate: '45deg' }] }} />
        </View>
      ) : mark.kind === 'record' ? (
        <View style={{ width: recW, height: REC_HEX, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: REC_HEX, height: REC_HEX, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={REC_HEX} height={REC_HEX} style={StyleSheet.absoluteFill}>
              <Path d={REC_HEX_D} fill={color.brand} stroke={color.storyInk} strokeWidth={active ? 3 : 2} />
            </Svg>
            <Ionicons name="star" size={15} color={color.storyInk} />
          </View>
          <View style={styles.kmChip}>
            <Text style={styles.kmText} allowFontScaling={false}>
              {mark.label} km
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.kmChip, active && { backgroundColor: color.accent }]}>
          <Text style={[styles.kmText, active && { color: color.onAccent }]} allowFontScaling={false}>
            {mark.label} km
          </Text>
        </View>
      )}
    </Marker>
  );
});

function Tag({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: color.overlay, paddingHorizontal: S.md, paddingVertical: S.xs, borderRadius: R.chip }}>
      <Text style={[type.caption, { color: color.storyInk, fontWeight: '700' }]}>{text}</Text>
    </View>
  );
}

/**
 * Riempimento minimo atteso dopo l'adattamento: metà dello spazio lasciato dai margini nella direzione più stretta
 * (l'adattamento fa toccare i margini almeno in una direzione).
 */
function minFill(s: { w: number; h: number }, padBottom: number): number {
  return Math.max(0.02, 0.5 * Math.min((s.w - 2 * FIT_SIDE) / s.w, (s.h - FIT_TOP - padBottom) / s.h));
}

/** Firma dei marker: stessi contenuti = stesso array, i marker nativi non si aggiornano a ogni render del genitore. */
function marksSig(marks?: TrackMark[]): string {
  if (!marks || !marks.length) return '';
  return marks.map((m) => `${m.id}|${m.kind}|${m.lat}|${m.lng}|${m.label}|${m.title}|${m.detail}`).join('~');
}

/** Lo stesso valore finché la chiave non cambia (aggiornamento durante il render, schema ufficiale di React). */
function useKeyed<T>(value: T, key: string): T {
  const [snap, setSnap] = useState({ key, value });
  if (snap.key !== key) {
    setSnap({ key, value });
    return value;
  }
  return snap.value;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { position: 'absolute', left: 0, top: 0, width: HEAD, height: HEAD, borderRadius: HEAD / 2, backgroundColor: color.accent, borderWidth: 3 },
  tags: { position: 'absolute', top: S.md, left: S.md, right: S.md, flexDirection: 'row', justifyContent: 'space-between' },
  card: { position: 'absolute', left: S.md, right: S.md, bottom: S.md, backgroundColor: 'rgba(14,18,22,0.92)', borderRadius: R.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: S.md, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: S.md },
  tagsLeft: { position: 'absolute', left: S.md, flexDirection: 'row', gap: S.sm },
  controls: { position: 'absolute', right: S.md, gap: S.sm },
  control: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,18,22,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  kmChip: { height: 24, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(14,18,22,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  kmText: { fontSize: 11, fontWeight: '800', color: color.storyInk },
});
