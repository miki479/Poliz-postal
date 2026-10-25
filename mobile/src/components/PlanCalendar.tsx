import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, useWindowDimensions, View } from 'react-native';

import { ActivityMark } from '@/components/ActivityMark';
import { useReduceMotion } from '@/components/ui';
import { styleOfKind, type ActivityStyle } from '@/constants/activityColors';
import { color, R, S, type } from '@/constants/theme';
import { addDaysIso, fmtDuration, WEEKDAYS_SHORT } from '@/lib/format';
import type { SessionInput } from '@shared/types.ts';

/* ---------- dettagli luminosi dell'ingresso ----------
 * Solo decorazione, sopra l'ingresso esistente (che resta identico): ogni giorno con appuntamenti ha UN valore
 * animato in più, lineare, che parte quando il suo appuntamento sta toccando la cella. Da quel valore derivano,
 * con interpolazioni a finestre, bagliore sul bordo d'arrivo, scintille, filo di luce sul bordo, riflesso e punti.
 * Tutto su driver nativo, senza tocchi (pointerEvents none), nascosto agli screen reader, assente con "Riduci movimento".
 * Posizioni, ritardi e quantità vengono da un generatore deterministico sulla data: stessi effetti a ogni render,
 * diversi da un giorno all'altro. Finito l'ingresso gli elementi vengono smontati.
 */

/** Ritardo dell'appuntamento `i` come nell'ingresso (380 + i·70) e momento in cui partono i dettagli. */
const ENTRY_DELAY = 380;
const ENTRY_STEP = 70;
/** L'appuntamento (650 ms, back 1.6) tocca la sua posizione a ~250 ms, oscilla fino a ~385 ms e si ferma a 650 ms. */
const FX_LEAD = 190;
const FX_MS = 720;
/** Spazio occupato fuori dalla cella: gutter della schermata (2×20), colonna del giorno (44) e spazio (12). */
const CELL_INSET = 96;

const WHITE = color.storyInk;
const CLEAR = `${color.storyInk}00`;

/** Generatore pseudo-casuale deterministico (FNV-1a + mulberry32): stesso seme, stessa sequenza. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) {
    h ^= seed.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Finestra temporale in millisecondi (relativi all'avvio dei dettagli) → interpolazione bloccata ai bordi. */
const at = (ms: number) => Math.min(1, Math.max(0, ms / FX_MS));
function seg(fx: Animated.Value, ms: number[], out: number[]): Animated.AnimatedInterpolation<number> {
  return fx.interpolate({ inputRange: ms.map(at), outputRange: out, extrapolate: 'clamp' });
}
/** Lato su cui ancorare un elemento: quello d'arrivo dell'appuntamento. */
const onSide = (fromLeft: boolean, n: number) => (fromLeft ? { right: n } : { left: n });

interface Spark { y: number; inset: number; size: number; at: number; life: number; dx: number; dy: number; spin: number }
interface Glint { edge: 'top' | 'bottom'; x: number; w: number; at: number; drift: number }
interface Dot { x: number; y: number; size: number; at: number; life: number; tinted: boolean }

/** Dettagli della cella di un giorno (bordo d'arrivo, scintille, fili di luce). */
function planDay(date: string) {
  const r = seeded(`day|${date}`);
  const glow = between(r, 0.55, 0.9);
  const roll = r();
  const sparkCount = roll < 0.35 ? 0 : roll < 0.65 ? 1 : roll < 0.9 ? 2 : 3; // scintille solo ogni tanto
  const sparks: Spark[] = Array.from({ length: sparkCount }, () => ({
    y: between(r, 0.18, 0.82),
    inset: between(r, -3, 9),
    size: between(r, 6, 10),
    at: between(r, 40, 130),
    life: between(r, 260, 360),
    dx: between(r, 5, 13),
    dy: between(r, -11, 11),
    spin: between(r, 40, 110),
  }));
  const glintCount = r() < 0.4 ? 0 : r() < 0.75 ? 1 : 2;
  const glints: Glint[] = Array.from({ length: glintCount }, (_, k) => ({
    edge: (k === 0 ? r() < 0.6 : r() < 0.4) ? 'top' : 'bottom',
    x: between(r, 0.12, 0.62),
    w: between(r, 36, 70),
    at: between(r, 150, 290),
    drift: between(r, 14, 30),
  }));
  return { glow, sparks, glints };
}

/** Dettagli che viaggiano con l'appuntamento (riflesso e punti luminosi). */
function planCard(date: string, k: number) {
  const r = seeded(`card|${date}|${k}`);
  const dots: Dot[] = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
    x: between(r, 0.08, 0.92),
    y: between(r, 0.15, 0.85),
    size: between(r, 2, 3.5),
    at: between(r, 90, 470),
    life: between(r, 130, 200),
    tinted: r() < 0.5,
  }));
  return { sheenW: between(r, 44, 66), sheenTilt: between(r, 14, 24), sheenPeak: between(r, 0.16, 0.26), sheenAt: between(r, 120, 160), dots };
}

/** Riflesso e punti luminosi: dentro l'appuntamento, quindi seguono la sua "goccia" e il rimbalzo. */
function CardFx({ fx, date, k, fromLeft, width, st }: { fx: Animated.Value; date: string; k: number; fromLeft: boolean; width: number; st: ActivityStyle }) {
  const p = planCard(date, k);
  const far = width + 30;
  const near = -p.sheenW - 30;
  const end = p.sheenAt + 500;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          position: 'absolute',
          top: -16,
          bottom: -16,
          left: 0,
          width: p.sheenW,
          opacity: seg(fx, [p.sheenAt, p.sheenAt + 80, end - 120, end], [0, p.sheenPeak, p.sheenPeak, 0]),
          // stesso verso dell'arrivo: la luce "accompagna" l'appuntamento mentre si assesta
          transform: [{ translateX: seg(fx, [p.sheenAt, end], fromLeft ? [near, far] : [far, near]) }, { rotate: `${fromLeft ? p.sheenTilt : -p.sheenTilt}deg` }],
        }}>
        <LinearGradient colors={[CLEAR, WHITE, CLEAR]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
      {p.dots.map((d, n) => (
        <Animated.View
          key={n}
          style={{
            position: 'absolute',
            left: `${d.x * 100}%`,
            top: `${d.y * 100}%`,
            width: d.size,
            height: d.size,
            borderRadius: d.size,
            backgroundColor: d.tinted ? (st.blend?.[n % 2] ?? st.solid) : WHITE,
            opacity: seg(fx, [d.at, d.at + d.life * 0.3, d.at + d.life], [0, 0.95, 0]),
            transform: [{ scale: seg(fx, [d.at, d.at + d.life * 0.3, d.at + d.life], [0.4, 1.25, 0.5]) }],
          }}
        />
      ))}
    </View>
  );
}

/** Bagliore sul bordo d'arrivo, fili di luce sui bordi e scintille: sopra la cella, fermi rispetto a essa. */
function DayFx({ fx, date, fromLeft, st }: { fx: Animated.Value; date: string; fromLeft: boolean; st: ActivityStyle }) {
  const p = planDay(date);
  const out = fromLeft ? 1 : -1; // verso l'esterno del bordo che l'appuntamento raggiunge per primo
  const solid = st.blend?.[fromLeft ? 1 : 0] ?? st.solid;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* elementi che restano dentro la forma arrotondata della cella */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: R.control, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, ...onSide(fromLeft, 0), width: 26, opacity: seg(fx, [30, 100, 440], [0, p.glow * 0.7, 0]) }}>
          <LinearGradient colors={fromLeft ? [`${solid}00`, `${solid}66`] : [`${solid}66`, `${solid}00`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', top: '16%', bottom: '16%', ...onSide(fromLeft, 0), width: 3, borderRadius: 2, backgroundColor: solid, opacity: seg(fx, [30, 90, 420], [0, p.glow, 0]), transform: [{ scaleY: seg(fx, [30, 160], [0.35, 1]) }] }} />
        {p.glints.map((g, n) => (
          <Animated.View
            key={n}
            style={{
              position: 'absolute',
              ...(g.edge === 'top' ? { top: 0 } : { bottom: 0 }),
              left: `${g.x * 100}%`,
              width: g.w,
              height: 1.5,
              opacity: seg(fx, [g.at, g.at + 70, g.at + 280], [0, 0.8, 0]),
              transform: [{ translateX: seg(fx, [g.at, g.at + 280], [0, g.drift * out]) }],
            }}>
            <LinearGradient colors={[CLEAR, WHITE, CLEAR]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
          </Animated.View>
        ))}
      </View>
      {/* scintille: nascono sul bordo d'arrivo e volano un poco verso l'esterno */}
      {p.sparks.map((s, n) => {
        const win = [s.at, s.at + s.life * 0.25, s.at + s.life];
        return (
          <Animated.View
            key={n}
            style={{
              position: 'absolute',
              top: `${s.y * 100}%`,
              marginTop: -s.size / 2,
              ...onSide(fromLeft, s.inset - s.size / 2),
              width: s.size,
              height: s.size,
              opacity: seg(fx, win, [0, 1, 0]),
              transform: [
                { translateX: seg(fx, [s.at, s.at + s.life], [0, s.dx * out]) },
                { translateY: seg(fx, [s.at, s.at + s.life], [0, s.dy]) },
                { scale: seg(fx, win, [0.2, 1, 0.3]) },
                { rotate: fx.interpolate({ inputRange: [at(s.at), at(s.at + s.life)], outputRange: ['0deg', `${s.spin * out}deg`], extrapolate: 'clamp' }) },
              ],
            }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: s.size / 2 - 0.75, height: 1.5, borderRadius: 1, backgroundColor: WHITE }} />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: s.size / 2 - 0.75, width: 1.5, borderRadius: 1, backgroundColor: WHITE }} />
            <View style={{ position: 'absolute', left: s.size / 2 - 1.5, top: s.size / 2 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: solid }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Settimana del piano con ingresso animato:
 *  1) il calendario sale dal basso;
 *  2) ogni appuntamento arriva dal lato (sinistra per i giorni a inizio settimana, destra per gli ultimi) fino alla propria cella;
 *  3) entra con una piccola "goccia" (scala elastica) e si assesta con un rimbalzo controllato;
 *  4) mentre tocca la cella e si assesta: bagliore sul bordo, qualche scintilla, un riflesso e punti luminosi (vedi sopra).
 * Le celle hanno posizione e altezza fisse: nessun salto di layout. Mostra le sedute reali generate dal piano.
 * Con "Riduci movimento" compare tutto subito, senza animazioni né effetti.
 */
export function PlanCalendar({ weekStart, sessions }: { weekStart: string; sessions: SessionInput[] }) {
  const reduce = useReduceMotion();
  const { width: screenW } = useWindowDimensions();
  const rise = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const byDay = (d: string) => sessions.filter((s) => s.date === d);
  const items = days.map((d) => byDay(d));
  const vals = useRef(days.map(() => new Animated.Value(reduce ? 1 : 0))).current;
  const fx = useRef(days.map(() => new Animated.Value(0))).current;
  const [fxOn, setFxOn] = useState(true);
  const showFx = fxOn && !reduce;
  const cardW = Math.max(120, screenW - CELL_INSET);

  useEffect(() => {
    if (reduce) {
      rise.setValue(1);
      vals.forEach((v) => v.setValue(1));
      return;
    }
    Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Appuntamenti in sequenza breve (70 ms l'uno): l'intero calendario compare in meno di un secondo.
    const anims = vals.map((v, i) => Animated.timing(v, { toValue: 1, duration: 650, delay: 380 + i * 70, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }));
    Animated.parallel(anims).start();
  }, [reduce, rise, vals]);

  // Dettagli luminosi: un'animazione separata e parallela, che non tocca quella d'ingresso; a fine corsa si smontano.
  useEffect(() => {
    // "Riduci movimento" attivato a metà: i dettagli non ripartono più (senza ingresso resterebbero luci a metà corsa)
    if (reduce) {
      setFxOn(false);
      return;
    }
    const run = Animated.parallel(fx.map((v, i) => Animated.timing(v, { toValue: 1, duration: FX_MS, delay: ENTRY_DELAY + i * ENTRY_STEP + FX_LEAD, easing: Easing.linear, useNativeDriver: true })));
    run.start(({ finished }) => {
      if (finished) setFxOn(false);
    });
    return () => run.stop();
  }, [reduce, fx]);

  return (
    <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }] }} accessibilityLabel="Calendario della prima settimana">
      <View style={{ gap: S.sm }}>
        {days.map((d, i) => {
          const list = items[i];
          const fromLeft = i < 4; // primi giorni dal lato sinistro, ultimi da destra
          const v = vals[i];
          return (
            <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 }}>
              <View style={{ width: 44 }}>
                <Text style={[type.caption, { color: color.textSecondary }]}>{WEEKDAYS_SHORT[i]}</Text>
                <Text style={[type.headline, { color: color.text }]}>{d.slice(8)}</Text>
              </View>
              {/* contenitore della cella: stessa larghezza e altezza di prima, fa da riferimento ai dettagli luminosi */}
              <View style={{ flex: 1 }}>
                <View style={{ minHeight: 52, borderRadius: R.control, backgroundColor: color.surface, justifyContent: 'center', overflow: 'hidden' }}>
                  {list.length ? (
                    list.map((s, k) => {
                      const st = styleOfKind(s.kind, s.title);
                      return (
                        <Animated.View
                          key={k}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: S.md,
                            padding: S.sm,
                            borderRadius: R.control,
                            overflow: 'hidden', // tiene il riflesso dentro l'appuntamento
                            backgroundColor: st.tint,
                            opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                            transform: [
                              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [fromLeft ? -260 : 260, 0] }) },
                              // "blob": si schiaccia in larghezza mentre arriva, poi si assesta
                              { scaleX: v.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: [0.6, 1.12, 0.97, 1] }) },
                              { scaleY: v.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: [1.25, 0.92, 1.03, 1] }) },
                            ],
                          }}>
                          <ActivityMark style={st} size={34} />
                          <View style={{ flex: 1 }}>
                            <Text style={[type.headline, { color: color.text }]}>{s.title || st.label}</Text>
                            <Text style={[type.footnote, { color: st.solid }]}>
                              {st.label} · {fmtDuration(s.durationMin)}
                            </Text>
                          </View>
                          {showFx ? <CardFx fx={fx[i]} date={d} k={k} fromLeft={fromLeft} width={cardW} st={st} /> : null}
                        </Animated.View>
                      );
                    })
                  ) : (
                    <Text style={[type.footnote, { color: color.textTertiary, paddingHorizontal: S.md }]}>Riposo</Text>
                  )}
                </View>
                {showFx && list.length ? <DayFx fx={fx[i]} date={d} fromLeft={fromLeft} st={styleOfKind(list[0].kind, list[0].title)} /> : null}
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}
