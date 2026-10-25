import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { color, R } from '@/constants/theme';

/* ---------- visibilità: le animazioni partono quando l'elemento entra nello schermo ---------- */

type Listener = () => void;
const ScrollCtx = createContext<{ subscribe(fn: Listener): () => void } | null>(null);

/** Da usare nel contenitore di scroll: notifica gli elementi quando la pagina scorre. */
export function useScrollEmitter() {
  const listeners = useRef(new Set<Listener>());
  const value = useRef({ subscribe: (fn: Listener) => (listeners.current.add(fn), () => void listeners.current.delete(fn)) }).current;
  const emit = useCallback(() => listeners.current.forEach((f) => f()), []);
  return { value, emit, Provider: ScrollCtx.Provider };
}

let reduceCache = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceCache = v));
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduceCache = v));

/** true la prima volta che l'elemento è visibile (poi resta true: l'animazione non si ripete). */
export function useInView() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [seen, setSeen] = useState(reduceCache);
  const ctx = useContext(ScrollCtx);
  const check = useCallback(() => {
    ref.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      if (h > 0 && y < Dimensions.get('window').height * 0.92 && y + h > 0) setSeen(true);
    });
  }, []);
  useEffect(() => {
    if (seen) return;
    const t = setTimeout(check, 80);
    const un = ctx?.subscribe(check);
    return () => {
      clearTimeout(t);
      un?.();
    };
  }, [seen, check, ctx]);
  return { ref, onLayout: check, inView: seen, reduce: reduceCache };
}

/** Valore animato 0→1 quando l'elemento entra nello schermo (immediato con "Riduci movimento"). */
function useReveal(duration = 900, delay = 0) {
  const v = useInView();
  const a = useRef(new Animated.Value(v.reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!v.inView) return;
    if (v.reduce) return a.setValue(1);
    Animated.timing(a, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v.inView, v.reduce, a, duration, delay]);
  return { ...v, a };
}

/* ---------- barre ---------- */

/** Barra di progresso che cresce da zero quando diventa visibile. */
export function AnimatedBar({ pct, tint = color.accent, height = 8, delay = 0, style, track = color.surfaceElevated }: { pct: number; tint?: string; height?: number; delay?: number; style?: StyleProp<ViewStyle>; track?: string }) {
  const { ref, onLayout, a } = useReveal(900, delay);
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <View ref={ref} onLayout={onLayout} style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: tint, width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${p * 100}%`] }) }} />
    </View>
  );
}

/** Numero che sale da zero al primo ingresso nello schermo (solo per interi o decimali con virgola). */
export function useCountUp(text: string) {
  const m = /^(\d+)(?:,(\d+))?$/.exec(text);
  const target = m ? Number(`${m[1]}.${m[2] ?? 0}`) : null;
  const decimals = m?.[2]?.length ?? 0;
  const { ref, onLayout, inView, reduce } = useInView();
  const [shown, setShown] = useState(target === null || reduce ? text : decimals ? (0).toFixed(decimals).replace('.', ',') : '0');
  useEffect(() => {
    if (target === null || reduce) return setShown(text);
    if (!inView) return;
    const a = new Animated.Value(0);
    const id = a.addListener(({ value }) => setShown((value * target).toFixed(decimals).replace('.', ',')));
    Animated.timing(a, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => setShown(text));
    return () => a.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, text]);
  return { ref, onLayout, shown };
}

/* ---------- grafico ad area con sfumatura ---------- */

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * Andamento con riempimento sfumato (dal colore al trasparente) e linea con un alone morbido.
 * Si disegna da sinistra a destra quando entra nello schermo. I valori sono quelli reali passati dal chiamante.
 */
export function AreaChart({ values, height = 140, tint = color.accent, label }: { values: number[]; height?: number; tint?: string; label: string }) {
  const [w, setW] = useState(0);
  const { ref, onLayout, a } = useReveal(1100);
  const id = useRef(`ac${Math.random().toString(36).slice(2, 8)}`).current;
  const max = Math.max(1, ...values);
  const pad = 8;
  const pts = values.map((v, i) => ({ x: values.length > 1 ? (i / (values.length - 1)) * w : w / 2, y: pad + (1 - v / max) * (height - pad * 2) }));
  let line = '';
  pts.forEach((p, i) => {
    if (!i) line = `M${p.x},${p.y}`;
    else {
      const q = pts[i - 1];
      const cx = (q.x + p.x) / 2;
      line += ` C${cx},${q.y} ${cx},${p.y} ${p.x},${p.y}`;
    }
  });
  const area = pts.length ? `${line} L${w},${height} L0,${height} Z` : '';
  return (
    <View
      ref={ref}
      onLayout={(e: LayoutChangeEvent) => {
        setW(e.nativeEvent.layout.width);
        onLayout();
      }}
      style={{ height }}
      accessible
      accessibilityLabel={label}>
      {w > 0 && pts.length > 1 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tint} stopOpacity={0.42} />
              <Stop offset="0.65" stopColor={color.brand} stopOpacity={0.12} />
              <Stop offset="1" stopColor={color.bg} stopOpacity={0} />
            </LinearGradient>
            <ClipPath id={`${id}c`}>
              <AnimatedRect x={0} y={0} height={height} width={a.interpolate({ inputRange: [0, 1], outputRange: [0, w] })} />
            </ClipPath>
          </Defs>
          <Path d={area} fill={`url(#${id}f)`} clipPath={`url(#${id}c)`} />
          {/* alone: due tratti larghi e trasparenti sotto la linea */}
          <Path d={line} stroke={tint} strokeOpacity={0.12} strokeWidth={12} fill="none" strokeLinecap="round" clipPath={`url(#${id}c)`} />
          <Path d={line} stroke={tint} strokeOpacity={0.25} strokeWidth={6} fill="none" strokeLinecap="round" clipPath={`url(#${id}c)`} />
          <Path d={line} stroke={tint} strokeWidth={2.5} fill="none" strokeLinecap="round" clipPath={`url(#${id}c)`} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Colonne verticali con riempimento sfumato che salgono da zero. */
export function ColumnChart({ values, labels, height = 120, tint = color.accent, label }: { values: number[]; labels: string[]; height?: number; tint?: string; label: string }) {
  const { ref, onLayout, a } = useReveal(900);
  const max = Math.max(1, ...values);
  return (
    <View ref={ref} onLayout={onLayout} accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: height + 20 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ height, width: '100%', justifyContent: 'flex-end' }}>
            <Animated.View style={{ width: '100%', borderRadius: R.chip, overflow: 'hidden', height: a.interpolate({ inputRange: [0, 1], outputRange: [2, Math.max(2, (v / max) * height)] }) }}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id={`cc${i}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={tint} stopOpacity={1} />
                    <Stop offset="1" stopColor={tint} stopOpacity={0.15} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#cc${i})`} />
              </Svg>
            </Animated.View>
          </View>
          <Animated.Text style={{ color: color.textTertiary, fontSize: 11 }} numberOfLines={1}>
            {labels[i]}
          </Animated.Text>
        </View>
      ))}
    </View>
  );
}

export function ScrollProvider({ value, children }: { value: { subscribe(fn: Listener): () => void }; children: ReactNode }) {
  return <ScrollCtx.Provider value={value}>{children}</ScrollCtx.Provider>;
}
