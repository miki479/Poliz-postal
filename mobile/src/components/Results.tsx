import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { BadgeHex, hexLabelText } from '@/components/BadgeHex';
import { useReduceMotion } from '@/components/ui';
import { awardSentence, awardSubtitle, awardTitle, kindOf, kmMark, toneOfAward, type AwardTone } from '@/constants/achievements';
import { color, M, R, S, type } from '@/constants/theme';
import { fmtDate } from '@/lib/format';
import { markSeen, seenSet } from '@/lib/seen';
import type { Award } from '@shared/records.ts';

/** Movimento ridotto: impostazione letta dal sistema all'avvio (subito) o aggiornata dall'app. */
function useStill(): boolean {
  const sys = useReducedMotion();
  const app = useReduceMotion();
  return sys || app;
}

/* ---------- numero che sale (solo valori reali, già formattati) ---------- */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface CountPlan {
  /** 0 = numero con eventuale virgola, 1 = m:ss (o mm:ss), 2 = h:mm:ss */
  kind: 0 | 1 | 2;
  to: number;
  dec: number;
  pad: number;
  suffix: string;
}

/**
 * Come contare fino al testo FINALE (es. "10,5 km", "24:13", "5:12/km", "1:02:09", "45 min").
 * Il conteggio parte da 0 e termina esattamente sul testo reale; testi non numerici restano fermi.
 */
export function countPlan(text: string): CountPlan | null {
  let m = /^(\d+):(\d{2}):(\d{2})(\D.*)?$/.exec(text);
  if (m) {
    const to = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return to > 1 ? { kind: 2, to, dec: 0, pad: 0, suffix: m[4] ?? '' } : null;
  }
  m = /^(\d+):(\d{2})(\D.*)?$/.exec(text);
  if (m) {
    const to = Number(m[1]) * 60 + Number(m[2]);
    return to > 1 ? { kind: 1, to, dec: 0, pad: m[1].length, suffix: m[3] ?? '' } : null;
  }
  m = /^(\d+)(?:,(\d+))?(\D.*)?$/.exec(text);
  if (m && !/^\.\d/.test(m[3] ?? '')) {
    const to = Number(`${m[1]}.${m[2] ?? 0}`);
    return to >= 2 ? { kind: 0, to, dec: m[2]?.length ?? 0, pad: 0, suffix: m[3] ?? '' } : null;
  }
  return null;
}

function fmtCount(v: number, kind: number, dec: number, pad: number): string {
  'worklet';
  if (kind === 0) return dec > 0 ? v.toFixed(dec).replace('.', ',') : String(Math.floor(v));
  const t = Math.max(0, Math.floor(v));
  const s = t % 60;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (kind === 2) {
    const h = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    return `${h}:${mm < 10 ? `0${mm}` : mm}:${ss}`;
  }
  let mins = String(Math.floor(t / 60));
  while (mins.length < pad) mins = `0${mins}`;
  return `${mins}:${ss}`;
}

const FONT_KEYS = ['fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'letterSpacing', 'color', 'fontVariant'] as const;

/**
 * Testo numerico che sale da 0 al valore REALE (sul thread UI, nessun setState per frame).
 * Lo spazio è riservato dal testo finale (invisibile durante il conteggio): niente salti di layout;
 * a conteggio finito resta il testo normale. Con movimento ridotto, o `play` falso, mostra subito il valore.
 */
export function CountText({ text, style, delay = 0, duration = 900, play = true, align = 'left', scale = true, a11y = true }: { text: string; style?: StyleProp<TextStyle>; delay?: number; duration?: number; play?: boolean; align?: 'left' | 'center' | 'right'; scale?: boolean; a11y?: boolean }) {
  const still = useStill();
  const plan = useMemo(() => countPlan(text), [text]);
  const go = !!plan && play && !still;
  const p = useSharedValue(go ? 0 : 1);

  useEffect(() => {
    if (!go) {
      cancelAnimation(p);
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
    return () => cancelAnimation(p);
  }, [go, text, delay, duration, p]);

  const kind = plan?.kind ?? 0;
  const to = plan?.to ?? 0;
  const dec = plan?.dec ?? 0;
  const pad = plan?.pad ?? 0;
  const suffix = plan?.suffix ?? '';
  const inputProps = useAnimatedProps(() => {
    const v = p.get();
    const s = v >= 1 ? text : `${fmtCount(to * v, kind, dec, pad)}${suffix}`;
    return { text: s, defaultValue: s } as unknown as TextInputProps;
  });
  const finalStyle = useAnimatedStyle(() => ({ opacity: p.get() >= 1 ? 1 : 0 }));
  const liveStyle = useAnimatedStyle(() => ({ opacity: p.get() >= 1 ? 0 : 1 }));

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (!go) {
    return (
      <Text style={[style, { textAlign: align }]} allowFontScaling={scale} accessible={a11y} importantForAccessibility={a11y ? 'auto' : 'no'}>
        {text}
      </Text>
    );
  }
  const font: TextStyle = {};
  for (const k of FONT_KEYS) if (flat[k] !== undefined) (font as Record<string, unknown>)[k] = flat[k];
  const start = `${fmtCount(0, kind, dec, pad)}${suffix}`;
  return (
    <View accessible={a11y} accessibilityLabel={a11y ? text : undefined} importantForAccessibility={a11y ? 'yes' : 'no-hide-descendants'}>
      <Animated.Text style={[style, { textAlign: align }, finalStyle]} allowFontScaling={scale} accessibilityElementsHidden importantForAccessibility="no">
        {text}
      </Animated.Text>
      <AnimatedTextInput
        editable={false}
        pointerEvents="none"
        caretHidden
        contextMenuHidden
        scrollEnabled={false}
        allowFontScaling={scale}
        accessibilityElementsHidden
        importantForAccessibility="no"
        underlineColorAndroid="transparent"
        defaultValue={start}
        animatedProps={inputProps}
        style={[font, st.liveInput, { textAlign: align }, liveStyle]}
      />
    </View>
  );
}

/* ---------- icona del riconoscimento ---------- */

/**
 * Icona di un riconoscimento: badge ESAGONALE con il simbolo e il colore del suo tipo (constants/achievements.ts).
 * Per i riconoscimenti misurati in km (record di distanza, tempi sui km) i km reali compaiono in una piccola etichetta
 * sul bordo inferiore. `countDelay`: quei km salgono da 0 al valore reale (prima visione).
 */
export function AwardMark({ a, size = 56, scale, countDelay }: { a: Pick<Award, 'tone' | 'mark' | 'unit' | 'category' | 'name'>; size?: number; scale?: RNAnimated.Value; countDelay?: number }) {
  const kind = kindOf(a);
  const km = kmMark(a);
  const text = km ? `${km} km` : null;
  const label = text && countDelay !== undefined ? <CountText text={text} style={hexLabelText(size)} delay={countDelay} duration={1000} align="center" scale={false} a11y={false} /> : text ?? undefined;
  const measure = km ? `, ${km} km` : a.mark && a.unit ? `, ${a.mark} ${a.unit}` : '';
  return (
    <RNAnimated.View style={[{ width: size, height: size }, scale ? { transform: [{ scale }] } : null]} accessible accessibilityLabel={`${a.name}${measure}`}>
      <BadgeHex kind={kind} size={size} label={label} />
    </RNAnimated.View>
  );
}

/** "Risultati": le icone dei riconoscimenti dell'attività (al massimo tre) e il loro numero. */
export function ResultsMetric({ awards, onPress }: { awards: Award[]; onPress?: () => void }) {
  if (!awards.length) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Risultati: ${awards.length}. Apri l'elenco`} style={{ alignItems: 'flex-end', gap: 2 }}>
      <Text style={[type.caption, { color: color.textSecondary }]}>Risultati</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {awards.slice(0, 3).map((a, i) => (
          <View key={a.id} style={{ marginLeft: i ? -8 : 0 }}>
            <AwardMark a={a} size={26} />
          </View>
        ))}
        <Text style={[type.title2, { color: color.text, marginLeft: S.xs }]}>{awards.length}</Text>
      </View>
    </Pressable>
  );
}

/* ---------- sequenza di festa (prima visione di una conquista) ---------- */

/** Variante della festa: record → esplosione con raggi; primo passo → fioritura; il resto → onde. */
export type AwardFxVariant = 'burst' | 'bloom' | 'ripple';
export const fxVariantOf = (a: Pick<Award, 'record' | 'category'>): AwardFxVariant => (a.record ? 'burst' : a.category === 'first_step' ? 'bloom' : 'ripple');

/** Chiave "festa già vista" per una conquista (lib/seen). */
export const awardFxKey = (id: string) => `awardfx:${id}`;

/** Pseudo-casuale stabile (stesso seme → stessa festa). */
function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function seedOf(s: string): number {
  let h = 5;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 100_003;
  return h;
}

/** Forma organica chiusa (lobi di raggio leggermente diverso) centrata in c. */
function blobPath(c: number, r: number, seed: number, lobes: number): string {
  const pts = Array.from({ length: lobes }, (_, i) => {
    const a = (i / lobes) * Math.PI * 2 + rnd(seed, 40 + i) * 0.3;
    const k = r * (0.8 + rnd(seed, i) * 0.2);
    return [c + Math.cos(a) * k, c + Math.sin(a) * k];
  });
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(pts[lobes - 1], pts[0]);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < lobes; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % lobes]);
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

const clamp01 = (v: number) => {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

const FX_MS = 1700;

/**
 * Strato di festa dietro la medaglia (un solo ciclo, mai in loop): blob organico che si espande e resta come alone,
 * onde che si allargano, piccola esplosione di particelle e, per i record, raggi. Un unico valore guida tutto.
 * Senza `play` (o con movimento ridotto) resta solo l'alone fermo.
 */
export function AwardFx({ tone, variant, size, delay = 0, play, seedKey = '', halo = true }: { tone: AwardTone; variant: AwardFxVariant; size: number; delay?: number; play: boolean; seedKey?: string; /** false: a festa finita non resta l'alone. */ halo?: boolean }) {
  const still = useStill();
  const go = play && !still;
  const p = useSharedValue(go ? 0 : 1);
  const seed = seedOf(seedKey || tone.solid);
  const gid = `fx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (!go) {
      cancelAnimation(p);
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(delay, withTiming(1, { duration: FX_MS, easing: Easing.linear })));
    return () => cancelAnimation(p);
  }, [go, delay, p]);

  const box = size * 3;
  const blob = size * (variant === 'bloom' ? 1.9 : 1.65);
  const d = useMemo(() => blobPath(blob / 2, blob / 2, seed, variant === 'bloom' ? 9 : 7), [blob, seed, variant]);
  const turn = (rnd(seed, 3) - 0.5) * 40;
  const blobStyle = useAnimatedStyle(() => {
    const v = p.get();
    // espansione con un piccolo "respiro": cresce oltre, rientra, si assesta (forma che ondeggia)
    const s = v < 0.14 ? 0.2 + (v / 0.14) * 1.15 : v < 0.34 ? 1.35 - ((v - 0.14) / 0.2) * 0.4 : 0.95 + Math.min(1, (v - 0.34) / 0.3) * 0.05;
    const wob = Math.sin(v * Math.PI * 3) * 0.07 * (1 - v);
    const rest = halo ? 0.6 - clamp01((v - 0.12) / 0.6) * 0.28 : 0.6 * (1 - clamp01((v - 0.12) / 0.75));
    return {
      opacity: v <= 0 ? 0 : v < 0.12 ? (v / 0.12) * 0.6 : rest,
      transform: [{ rotate: `${turn * v}deg` }, { scaleX: s * (1 + wob) }, { scaleY: s * (1 - wob) }],
    };
  });

  const nParts = variant === 'burst' ? 10 : variant === 'bloom' ? 8 : 6;
  const parts = Array.from({ length: nParts }, (_, i) => ({
    angle: (i / nParts) * Math.PI * 2 + rnd(seed, 10 + i) * 0.5,
    dist: size * (variant === 'bloom' ? 0.75 : 0.95) + rnd(seed, 20 + i) * size * 0.45,
    dot: 3 + Math.round(rnd(seed, 30 + i) * 3),
    tint: i % 3 === 0 ? color.storyInk : tone.solid,
  }));

  if (!go && !halo) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: (size - box) / 2, top: (size - box) / 2, width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: blob, height: blob }, blobStyle]}>
        <Svg width={blob} height={blob}>
          <Defs>
            <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tone.solid} stopOpacity={0.95} />
              <Stop offset="0.55" stopColor={tone.solid} stopOpacity={0.45} />
              <Stop offset="1" stopColor={tone.solid} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={d} fill={`url(#${gid})`} />
        </Svg>
      </Animated.View>
      {go && variant !== 'bloom' ? <FxRing p={p} tint={tone.solid} size={size} at={0.06} /> : null}
      {go && variant !== 'burst' ? <FxRing p={p} tint={tone.solid} size={size} at={0.24} /> : null}
      {go && variant === 'burst' ? Array.from({ length: 8 }, (_, i) => <FxRay key={i} p={p} tint={i % 2 ? color.storyInk : tone.solid} size={size} angle={(i / 8) * 360 + turn} />) : null}
      {go ? parts.map((q, i) => <FxParticle key={i} p={p} {...q} at={variant === 'bloom' ? 0.16 : 0.1} />) : null}
    </View>
  );
}

function FxRing({ p, tint, size, at }: { p: SharedValue<number>; tint: string; size: number; at: number }) {
  const s = useAnimatedStyle(() => {
    const q = clamp01((p.get() - at) / 0.42);
    return { opacity: q <= 0 ? 0 : (1 - q) * 0.75, transform: [{ scale: 0.6 + (1 - (1 - q) * (1 - q)) * 1.9 }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: tint }, s]} />;
}

function FxRay({ p, tint, size, angle }: { p: SharedValue<number>; tint: string; size: number; angle: number }) {
  const len = size * 0.42;
  const s = useAnimatedStyle(() => {
    const q = clamp01((p.get() - 0.05) / 0.45);
    const e = 1 - (1 - q) * (1 - q);
    return { opacity: q <= 0 ? 0 : (1 - q) * 0.9, transform: [{ rotate: `${angle}deg` }, { translateY: -(size * 0.55 + e * size * 0.5) }, { scaleY: 0.25 + Math.sin(q * Math.PI) * 0.75 }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: 3, height: len, borderRadius: 2, backgroundColor: tint }, s]} />;
}

function FxParticle({ p, angle, dist, dot, tint, at }: { p: SharedValue<number>; angle: number; dist: number; dot: number; tint: string; at: number }) {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const s = useAnimatedStyle(() => {
    const q = clamp01((p.get() - at) / 0.6);
    const e = 1 - (1 - q) * (1 - q) * (1 - q);
    return { opacity: q <= 0 ? 0 : 1 - q, transform: [{ translateX: cx * dist * e }, { translateY: cy * dist * e }, { scale: 1 - q * 0.5 }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: dot, height: dot, borderRadius: dot / 2, backgroundColor: tint }, s]} />;
}

/** Ingresso della medaglia con un rimbalzo controllato (molla smorzata, una sola oscillazione visibile). */
export function AwardPop({ children, play, delay = 0, from = 0.3 }: { children: ReactNode; play: boolean; delay?: number; from?: number }) {
  const still = useStill();
  const go = play && !still;
  const v = useSharedValue(go ? 0 : 1);
  useEffect(() => {
    if (!go) {
      cancelAnimation(v);
      v.set(1);
      return;
    }
    v.set(0);
    v.set(withDelay(delay, withSpring(1, { damping: 9, stiffness: 170, mass: 0.8 })));
    return () => cancelAnimation(v);
  }, [go, delay, v]);
  const s = useAnimatedStyle(() => {
    const x = v.get();
    return { opacity: Math.min(1, x * 3), transform: [{ scale: from + (1 - from) * x }, { rotate: `${(1 - x) * -14}deg` }] };
  });
  return <Animated.View style={s}>{children}</Animated.View>;
}

/** Riflesso luminoso che attraversa il contenitore una volta (il contenitore deve avere overflow nascosto). */
export function Sheen({ play, delay = 0, travel = 420, band = 64 }: { play: boolean; delay?: number; travel?: number; band?: number }) {
  const still = useStill();
  const go = play && !still;
  const v = useSharedValue(0);
  useEffect(() => {
    if (!go) {
      cancelAnimation(v);
      v.set(0);
      return;
    }
    v.set(0);
    v.set(withDelay(delay, withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) })));
    return () => cancelAnimation(v);
  }, [go, delay, v]);
  const s = useAnimatedStyle(() => {
    const x = v.get();
    return { opacity: x <= 0 || x >= 1 ? 0 : Math.min(1, x * 5, (1 - x) * 5) * 0.55, transform: [{ translateX: -band * 1.5 + x * (travel + band * 2.5) }, { rotate: '18deg' }] };
  });
  if (!go) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -30, bottom: -30, left: 0, width: band }, s]}>
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.38)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

/**
 * Comparsa di un elemento: dissolvenza con piccolo spostamento (dx laterale, dy verticale), opzionalmente a molla.
 * Solo trasformazioni e opacità: lo spazio è occupato da subito, nessun salto di layout. Fermo con movimento ridotto.
 */
export function Rise({ children, play = true, delay = 0, dx = 0, dy = 10, duration = 460, spring = false, style }: { children: ReactNode; play?: boolean; delay?: number; dx?: number; dy?: number; duration?: number; spring?: boolean; style?: StyleProp<ViewStyle> }) {
  const still = useStill();
  const go = play && !still;
  const v = useSharedValue(go ? 0 : 1);
  useEffect(() => {
    if (!go) {
      cancelAnimation(v);
      v.set(1);
      return;
    }
    v.set(0);
    v.set(withDelay(delay, spring ? withSpring(1, { damping: 17, stiffness: 130, mass: 0.9 }) : withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
    return () => cancelAnimation(v);
  }, [go, delay, duration, spring, v]);
  const s = useAnimatedStyle(() => {
    const x = v.get();
    return { opacity: clamp01(x * 1.6), transform: [{ translateX: dx * (1 - x) }, { translateY: dy * (1 - x) }] };
  });
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/* ---------- banner del riconoscimento principale ---------- */

/**
 * Banner del riconoscimento principale.
 * Prima visione (`celebrate` e festa mai vista su questo telefono, chiave awardfx:<id>): il risultato entra di lato,
 * la medaglia si espande con un blob organico, onda e particelle, rimbalza, il numero sale fino al valore reale,
 * un riflesso attraversa il banner e compaiono nome e motivo. Le visioni successive sono una comparsa semplice.
 * Con il movimento ridotto non anima mai.
 * La scelta (festa o comparsa semplice) si fa una sola volta per riconoscimento: quando la schermata ricarica i dati e
 * `celebrate` diventa false (ora è "visto") il banner non si dissolve e non ricompare, e una festa in corso non si tronca.
 */
export function AwardBanner(props: { a: Award; celebrate: boolean; onPress: () => void; onShare?: () => void }) {
  return <BannerBody key={props.a.id} {...props} />;
}

function BannerBody({ a, celebrate, onPress, onShare }: { a: Award; celebrate: boolean; onPress: () => void; onShare?: () => void }) {
  const still = useStill();
  const stillNow = useRef(still);
  stillNow.current = still;
  const tone = toneOfAward(a);
  // null = sto controllando se la festa è già stata vista (un istante: il banner occupa già il suo spazio)
  const [fx, setFx] = useState<boolean | null>(celebrate && !still ? null : false);

  useEffect(() => {
    if (fx !== null) return;
    let alive = true;
    void seenSet().then((s) => {
      if (!alive) return;
      // con il movimento ridotto attivato nel frattempo la festa non si vedrebbe: non la si consuma
      const fresh = !stillNow.current && !s.has(awardFxKey(a.id));
      setFx(fresh);
      if (fresh) void markSeen(awardFxKey(a.id));
    });
    return () => {
      alive = false;
    };
  }, [fx, a.id]);

  const full = fx === true;
  const enter = useSharedValue(still ? 1 : 0);
  const entered = useRef(false);
  useEffect(() => {
    if (fx === null) return;
    if (still) {
      cancelAnimation(enter);
      enter.set(1);
      entered.current = true;
      return;
    }
    // Una sola entrata: se l'effetto si ripete (cambio di dipendenze) riprende da dove era, mai da capo.
    const from = entered.current ? Math.min(1, Math.max(0, enter.get())) : 0;
    entered.current = true;
    if (from >= 1) return;
    enter.set(from);
    enter.set(withTiming(1, { duration: (full ? 480 : M.sheet) * (1 - from), easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(enter);
  }, [fx, full, still, enter]);
  const enterStyle = useAnimatedStyle(() => {
    const x = enter.get();
    return { opacity: x, transform: [{ translateX: full ? -32 * (1 - x) : 0 }] };
  });

  // Come nel mockup: fascia tinta del colore del tipo, badge grande, titolo, frase e freccia.
  // Il pulsante Condividi è accanto (non dentro) all'area che apre il dettaglio: entrambi raggiungibili con VoiceOver/TalkBack.
  return (
    <Animated.View style={enterStyle}>
      <LinearGradient colors={[`${tone.solid}4D`, `${tone.solid}14`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: R.card, borderWidth: 1, borderColor: `${tone.solid}59`, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
        <Sheen play={full} delay={820} />
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${a.record ? 'Record personale' : 'Traguardo'}: ${awardTitle(a)}. ${awardSentence(a)} ${a.value}${a.previous ? `, prima ${a.previous}` : ''}${a.improvement ? `, ${a.improvement}` : ''}. Tocca per i dettagli.`}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, paddingLeft: S.md, paddingRight: onShare ? S.xs : S.md }, pressed && { opacity: 0.8 }]}
        >
          <View style={{ width: 68, height: 68 }}>
            <AwardFx tone={tone} variant={fxVariantOf(a)} size={68} delay={200} play={full} seedKey={a.id} />
            <AwardPop play={full} delay={170}>
              <AwardMark a={a} size={68} countDelay={full ? 360 : undefined} />
            </AwardPop>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Rise play={full} delay={500} dy={8}>
              <Text style={[type.headline, { color: color.text, fontWeight: '700' }]}>{awardTitle(a)}</Text>
            </Rise>
            <Rise play={full} delay={620} dy={8}>
              <Text style={[type.footnote, { color: color.storyInkSecondary }]}>{awardSentence(a)}</Text>
            </Rise>
          </View>
          <Ionicons name="chevron-forward" size={18} color={tone.light} />
        </Pressable>
        {onShare ? (
          <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Condividi il risultato" hitSlop={10} style={({ pressed }) => ({ padding: S.xs, marginRight: S.md, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="share-outline" size={20} color={color.text} />
          </Pressable>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

/**
 * Riga di un riconoscimento: badge esagonale, titolo, "valore · sport" e (con `date`) il giorno della conquista.
 * `card`: dentro una superficie arrotondata, come negli elenchi del mockup.
 */
export function AwardRow({ a, onPress, date, card }: { a: Award; onPress: () => void; date?: boolean; card?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${awardTitle(a)}. ${a.value}${a.improvement ? `, ${a.improvement}` : ''}${a.record ? ', record personale' : ''}${date ? `, ${fmtDate(a.date)}` : ''}. Tocca per i dettagli`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingVertical: S.xs }, card && { backgroundColor: color.surface, borderRadius: R.card, paddingVertical: S.md, paddingHorizontal: S.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }, pressed && { opacity: 0.6 }]}
    >
      <AwardMark a={a} size={card ? 54 : 48} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.headline, { color: color.text, fontWeight: '700' }]} numberOfLines={1}>
          {awardTitle(a)}
        </Text>
        <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={1}>
          {awardSubtitle(a)}
        </Text>
        {date ? <Text style={[type.caption, { color: color.textTertiary }]}>{fmtDate(a.date)}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  liveInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 0, margin: 0, borderWidth: 0, includeFontPadding: false, textAlignVertical: 'center', backgroundColor: 'transparent' },
});
