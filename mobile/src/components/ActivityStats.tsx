import { Ionicons } from '@expo/vector-icons';
import { useEffect, useId, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';

import { AnimatedBar, ScrollProvider, useScrollEmitter } from '@/components/Motion';
import { IconButton, Panel, useReduceMotion } from '@/components/ui';
import { color, HIT, S, type } from '@/constants/theme';
import { ext } from '@/lib/api';
import { fmtClock, fmtDate, fmtPace, kmParts } from '@/lib/format';
import { styleOfLog } from '@/lib/storyPalette';
import { elevationOf, splits } from '@shared/track.ts';
import type { ActivityStreams, WorkoutLog } from '@shared/types.ts';
import { fileMeasurements } from '@shared/fileMeasurements.ts';
import { HeartZones } from '@/components/HeartZones';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const max = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const min = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const num1 = (v: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v);

const HR = color.danger;
const ALT = color.success;

function useStill(): boolean {
  return useReduceMotion();
}

/* ---------- grafico con assi (solo valori reali della fonte) ---------- */

/** Al massimo `n` punti: media per gruppi consecutivi (la forma resta, i picchi veri sono già nei valori mostrati sopra). */
function bucket(xs: number[], ys: number[], n: number): { xs: number[]; ys: number[] } {
  const len = Math.min(xs.length, ys.length);
  if (len <= n) return { xs: xs.slice(0, len), ys: ys.slice(0, len) };
  const ox: number[] = [];
  const oy: number[] = [];
  const size = len / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * size);
    const b = Math.max(a + 1, Math.floor((i + 1) * size));
    let sx = 0;
    let sy = 0;
    for (let k = a; k < b; k++) {
      sx += xs[k];
      sy += ys[k];
    }
    ox.push(sx / (b - a));
    oy.push(sy / (b - a));
  }
  return { xs: ox, ys: oy };
}

function niceStep(raw: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= raw) ?? Math.ceil(raw / 1000) * 1000;
}

const AXIS_W = 34;
const PAD = 6;

/**
 * Andamento su distanza: area sfumata, linea con alone, tre valori sull'asse verticale e cinque distanze in basso.
 * Si disegna da sinistra a destra una volta (sul thread UI); con movimento ridotto compare intero.
 */
function TrendChart({ xs, ys, tint, height = 112, minSpan, label }: { xs: number[]; ys: number[]; tint: string; height?: number; minSpan: number; label: string }) {
  const still = useStill();
  const gid = `tc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [w, setW] = useState(0);
  const p = useSharedValue(still ? 1 : 0);
  const plotW = Math.max(0, w - AXIS_W);
  const ready = plotW > 0;

  useEffect(() => {
    if (!ready) return;
    if (still) {
      cancelAnimation(p);
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(p);
  }, [ready, still, p]);
  const clipProps = useAnimatedProps(() => ({ width: Math.max(0, p.get() * plotW) }));

  const g = useMemo(() => {
    const d = bucket(xs, ys, 160);
    if (d.xs.length < 2) return null;
    let lo = min(d.ys);
    let hi = max(d.ys);
    if (hi - lo < minSpan) {
      const c = (hi + lo) / 2;
      lo = c - minSpan / 2;
      hi = c + minSpan / 2;
    }
    const step = niceStep((hi - lo) / 2);
    const y0 = Math.floor(lo / step) * step;
    const y1 = Math.max(y0 + step, Math.ceil(hi / step) * step);
    const x0 = d.xs[0];
    const x1 = d.xs[d.xs.length - 1];
    return { d, y0, y1, x0, x1 };
  }, [xs, ys, minSpan]);

  const paths = useMemo(() => {
    if (!g || !ready) return null;
    const sx = (v: number) => (g.x1 > g.x0 ? ((v - g.x0) / (g.x1 - g.x0)) * plotW : 0);
    const sy = (v: number) => PAD + (1 - (v - g.y0) / (g.y1 - g.y0)) * (height - PAD * 2);
    let line = '';
    g.d.xs.forEach((x, i) => {
      line += `${i ? ' L' : 'M'}${sx(x).toFixed(1)},${sy(g.d.ys[i]).toFixed(1)}`;
    });
    return { line, area: `${line} L${plotW.toFixed(1)},${height} L0,${height} Z` };
  }, [g, ready, plotW, height]);

  if (!g) return null;
  const mid = (g.y0 + g.y1) / 2;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => g.x0 + (g.x1 - g.x0) * f);
  return (
    <View accessible accessibilityLabel={label} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}>
      <View style={{ flexDirection: 'row', height }}>
        <View style={{ width: AXIS_W, justifyContent: 'space-between', paddingVertical: PAD - 6 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {[g.y1, mid, g.y0].map((v, i) => (
            <Text key={i} style={[type.caption, { color: color.textTertiary, fontVariant: ['tabular-nums'] }]} allowFontScaling={false}>
              {Math.round(v)}
            </Text>
          ))}
        </View>
        {paths ? (
          <Svg width={plotW} height={height}>
            <Defs>
              <LinearGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
                <Stop offset="1" stopColor={tint} stopOpacity={0} />
              </LinearGradient>
              <ClipPath id={`${gid}c`}>
                <AnimatedRect x={0} y={0} height={height} animatedProps={clipProps} />
              </ClipPath>
            </Defs>
            {[PAD, height / 2, height - PAD].map((y, i) => (
              <Line key={i} x1={0} x2={plotW} y1={y} y2={y} stroke={color.separator} strokeWidth={1} strokeDasharray="3 5" />
            ))}
            <G clipPath={`url(#${gid}c)`}>
              <Path d={paths.area} fill={`url(#${gid}f)`} />
              <Path d={paths.line} stroke={tint} strokeOpacity={0.22} strokeWidth={6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Path d={paths.line} stroke={tint} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </G>
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: AXIS_W, marginTop: S.xs }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {xTicks.map((v, i) => (
          <Text key={i} style={[type.caption, { color: color.textTertiary, fontVariant: ['tabular-nums'] }]} allowFontScaling={false}>
            {i === xTicks.length - 1 ? `${num1(v)} km` : num1(v)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* ---------- pezzi ---------- */

function Tile({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <Panel style={{ flex: 1, paddingVertical: S.md, paddingHorizontal: S.sm, alignItems: 'center', gap: 2 }}>
      <View accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`} style={{ alignItems: 'center', gap: 2 }}>
        <Text style={[type.metricSmall, { color: color.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
          {unit ? <Text style={[type.footnote, { color: color.textSecondary, fontWeight: '600' }]}> {unit}</Text> : null}
        </Text>
        <Text style={[type.caption, { color: color.textSecondary }]}>{label}</Text>
      </View>
    </Panel>
  );
}

function Card({ icon, tint, title, children, style }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; children: React.ReactNode; style?: object }) {
  return (
    <Panel style={[{ padding: S.lg, gap: S.md }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <Ionicons name={icon} size={16} color={tint} />
        <Text style={[type.headline, { color: color.text }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </Panel>
  );
}

function Value({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label}: ${value} ${unit}`}>
      <Text style={[type.title2, { color: color.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        <Text style={[type.footnote, { color: color.textSecondary, fontWeight: '600' }]}> {unit}</Text>
      </Text>
      <Text style={[type.caption, { color: color.textSecondary }]}>{label}</Text>
    </View>
  );
}

/**
 * Statistiche complete e reali dell'attività. Si mostra solo ciò che la fonte ha davvero fornito:
 *  - app: distanza, tempo e passo; altitudine GPS (se il telefono la dà); passaggi per km se la traccia ha i tempi.
 *    Nessun cardiofrequenzimetro è collegato all'app.
 *  - Strava: riepilogo (cuore, dislivello, cadenza…) e, a richiesta, le serie per i grafici.
 * Un dato mancante non diventa uno zero né un valore predefinito: il riquadro semplicemente non c'è.
 */
export type ActivityStatsData = Pick<WorkoutLog, 'id' | 'startedAt' | 'distanceKm' | 'paceSecPerKm'> & Partial<Pick<WorkoutLog, 'metrics' | 'origin' | 'fileSamples' | 'fileSummary' | 'track' | 'gpsQuality' | 'distanceSource'>> & { durationSec: number | null };

export function ActivityStats({ log, refreshKey = 0 }: { log: ActivityStatsData; /** Cambiandolo si richiedono di nuovo le serie a Strava. */ refreshKey?: number }) {
  const m = log.metrics ?? null;
  const file = useMemo(() => log.origin === 'file' ? fileMeasurements(log.fileSamples ?? [], log.fileSummary) : null, [log.origin, log.fileSamples, log.fileSummary]);
  const fromStrava = log.origin === 'strava';
  const [streams, setStreams] = useState<ActivityStreams | null>(null);
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStreams(null);
    setAsked(false);
    if (!fromStrava) return;
    let alive = true;
    setFailed(false);
    void ext.strava.streams(log.id).then(
      (r) => {
        if (!alive) return;
        setStreams(r.streams);
        setAsked(true);
      },
      () => {
        if (!alive) return;
        setAsked(true);
        setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [log.id, fromStrava, refreshKey]);

  const gpsElev = useMemo(() => (log.track ? elevationOf(log.track) : null), [log.track]);
  const sp = useMemo(() => (log.track && log.track.length > 1 && !log.gpsQuality?.gaps ? splits(log.track) : []), [log.track, log.gpsQuality?.gaps]);

  const hrSeries = streams?.hr ?? file?.heart.ys ?? null;
  const dist = streams?.distKm ?? file?.heart.xs ?? null;
  const alt: { xs: number[]; ys: number[] } | null = file?.altitude ?? (streams?.alt && dist ? { xs: dist, ys: streams.alt } : gpsElev && gpsElev.profile.length > 4 ? { xs: gpsElev.profile.map((x) => x.distKm), ys: gpsElev.profile.map((x) => x.alt) } : null);
  const cadSeries = streams?.cadence ?? null;
  const gain = file?.gain ?? streams?.elevGainM ?? m?.elevGainM ?? gpsElev?.gainM ?? null;
  const loss = file?.loss ?? streams?.elevLossM ?? gpsElev?.lossM ?? null;
  const hrAvg = file?.hrAvg ?? m?.hrAvg ?? (hrSeries && hrSeries.length ? Math.round(hrSeries.reduce((a, b) => a + b, 0) / hrSeries.length) : null);
  const hrMax = file?.hrMax ?? (hrSeries && hrSeries.length ? max(hrSeries) : m?.hrMax ?? null);
  const cadAvg = file?.cadAvg ?? m?.cadenceSpm ?? (cadSeries && cadSeries.length ? Math.round(cadSeries.reduce((a, b) => a + b, 0) / cadSeries.length) : null);
  const cadMax = file?.cadMax ?? (cadSeries && cadSeries.length ? max(cadSeries) : null);
  const moving = m?.movingSec ?? null;
  const elapsed = m?.elapsedSec ?? null;

  const timeRows = !!moving && !!elapsed && elapsed - moving >= 30;
  const hasHeart = hrAvg !== null || hrMax !== null;
  const hasElev = gain !== null;
  const hasCad = cadAvg !== null || cadMax !== null;
  const hasMisc = m?.maxSpeedKmh != null || m?.calories != null || m?.avgWatts != null;
  const fastest = sp.length ? Math.min(...sp.map((y) => y.paceSecPerKm)) : 0;

  return (
    <View style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {log.distanceKm != null ? <Tile value={kmParts(log.distanceKm)[0]} unit="km" label={log.distanceSource === 'manual' ? 'Distanza dichiarata' : 'Distanza'} /> : null}
        {log.durationSec != null ? <Tile value={fmtClock(log.durationSec)} label="Durata" /> : null}
        {log.paceSecPerKm ? <Tile value={fmtPace(log.paceSecPerKm).replace('/km', '')} unit="/km" label="Passo medio" /> : null}
      </View>

      {hasHeart ? (
        <Card icon="heart" tint={HR} title="Frequenza cardiaca">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <Ionicons name="heart" size={26} color={HR} />
            {hrAvg !== null ? <Value value={String(hrAvg)} unit="bpm" label="Media" /> : null}
            {hrMax !== null ? <Value value={String(hrMax)} unit="bpm" label="Massima" /> : null}
          </View>
          {hrSeries && dist && hrSeries.length > 4 ? <TrendChart xs={dist} ys={hrSeries} tint={HR} minSpan={20} label={`Andamento della frequenza cardiaca sulla distanza, da ${min(hrSeries)} a ${max(hrSeries)} battiti al minuto`} /> : null}
        </Card>
      ) : null}

      {fromStrava && hasHeart ? <HeartZones /> : null}
      {hasCad || hasElev ? (
        <View style={{ flexDirection: 'row', gap: S.md }}>
          {hasCad ? (
            <Card icon="footsteps" tint={color.accent} title="Cadenza" style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                {cadAvg !== null ? <Value value={String(cadAvg)} unit={file ? '/min' : 'spm'} label="Media" /> : null}
                {cadMax != null ? <Value value={String(cadMax)} unit={file ? '/min' : 'spm'} label="Massima" /> : null}
              </View>
            </Card>
          ) : null}
          {hasElev ? (
            <Card icon="trending-up" tint={color.warning} title="Dislivello" style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <Value value={`+${gain}`} unit="m" label="Salita" />
                {loss !== null ? <Value value={`−${loss}`} unit="m" label="Discesa" /> : null}
              </View>
            </Card>
          ) : null}
        </View>
      ) : null}

      {alt && alt.ys.length > 4 ? (
        <Card icon="triangle" tint={ALT} title="Altimetria">
          <TrendChart xs={alt.xs} ys={alt.ys} tint={ALT} minSpan={10} label={`Profilo altimetrico, tra ${Math.round(min(alt.ys))} e ${Math.round(max(alt.ys))} metri`} />
          {!fromStrava && gpsElev ? <Text style={[type.footnote, { color: color.textTertiary }]}>Stimato dall’altitudine GPS del telefono: può differire dal dislivello reale.</Text> : null}
        </Card>
      ) : null}

      {timeRows ? (
        <Card icon="time-outline" tint={color.textSecondary} title="Tempo">
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Value value={fmtClock(moving!)} unit="" label="In movimento" />
            <Value value={fmtClock(elapsed!)} unit="" label="Totale" />
          </View>
        </Card>
      ) : null}

      {hasMisc ? (
        <Card icon="speedometer-outline" tint={color.textSecondary} title="Altre misure">
          <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' }}>
            {m?.maxSpeedKmh != null ? <Value value={num1(m.maxSpeedKmh)} unit="km/h" label="Velocità max" /> : null}
            {m?.calories != null ? <Value value={String(Math.round(m.calories))} unit="kcal" label="Calorie" /> : null}
            {m?.avgWatts != null ? <Value value={String(Math.round(m.avgWatts))} unit="W" label="Potenza media" /> : null}
          </View>
        </Card>
      ) : null}

      {sp.length ? (
        <Card icon="flag-outline" tint={color.accent} title="Passaggi per chilometro">
          <View style={{ gap: S.xs }}>
            {sp.map((x, i) => (
              <View key={x.km} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 36 }} accessible accessibilityLabel={`${x.distKm < 1 ? `Ultimi ${num1(x.distKm)} km` : `Chilometro ${x.km}`}: passo ${fmtPace(x.paceSecPerKm)}`}>
                <Text style={[type.subhead, { color: color.text, width: 60, fontWeight: '600' }]}>{x.distKm < 1 ? `${num1(x.distKm)} km` : `Km ${x.km}`}</Text>
                <AnimatedBar style={{ flex: 1 }} delay={i * 50} pct={Math.min(1, Math.max(0.12, fastest / x.paceSecPerKm))} />
                <Text style={[type.headline, { width: 56, textAlign: 'right', color: color.text, fontVariant: ['tabular-nums'] }]}>{fmtPace(x.paceSecPerKm).replace('/km', '')}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {file && hasCad ? <Text style={[type.footnote, { color: color.textTertiary }]}>Cadenza come registrata nel file, senza conversioni tra passi e cicli.</Text> : null}
      {!hasHeart && !file ? (
        <Text style={[type.footnote, { color: color.textTertiary }]}>
          {fromStrava ? (!asked ? 'Cerco le misure su Strava…' : failed ? 'Le misure di Strava non sono raggiungibili in questo momento.' : 'Frequenza cardiaca non fornita da Strava per questa attività.') : 'Frequenza cardiaca non disponibile: le registrazioni dell’app non leggono sensori cardiaci.'}
        </Text>
      ) : null}
    </View>
  );
}

/** "Andamento": statistiche complete a tutto schermo, con il ritorno in alto a sinistra. */
export function ActivityStatsModal({ log, visible, onClose }: { log: WorkoutLog; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const still = useStill();
  const em = useScrollEmitter();
  const [k, setK] = useState(0);
  return (
    <Modal visible={visible} animationType={still ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <View style={{ paddingTop: insets.top + S.xs, paddingHorizontal: S.sm, flexDirection: 'row', alignItems: 'center', minHeight: HIT }}>
          <IconButton name="chevron-back" label="Indietro" onPress={onClose} />
          <Text style={[type.headline, { flex: 1, textAlign: 'center', color: color.text }]} numberOfLines={1} accessibilityRole="header">
            {styleOfLog(log).label} · {fmtDate(log.startedAt)}
          </Text>
          {log.origin === 'strava' ? <IconButton name="refresh" label="Aggiorna le misure da Strava" color={color.textSecondary} onPress={() => setK((x) => x + 1)} /> : <View style={{ width: HIT }} />}
        </View>
        <ScrollView onScroll={em.emit} scrollEventThrottle={120} contentContainerStyle={{ paddingHorizontal: S.xl, paddingTop: S.md, paddingBottom: insets.bottom + S.xxl }}>
          <ScrollProvider value={em.value}>{visible ? <ActivityStats log={log} refreshKey={k} /> : null}</ScrollProvider>
        </ScrollView>
      </View>
    </Modal>
  );
}
