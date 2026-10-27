import { themedStyles , color, HIT, M, R, S, type } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, mix } from '@/components/event/colors';
import { OptionChip } from '@/components/event/OptionChip';
import { Reveal } from '@/components/event/Reveal';
import { SectionTitle } from '@/components/event/SectionTitle';
import { ActivityGlyph, AnimatedActivityFigure, type Glyph } from '@/components/SportIcon';
import { Banner, Button, Field, IconButton, useReduceMotion, type IconName } from '@/components/ui';
import { paceFromFields } from '@/lib/paceInput';
import { styleOfSport } from '@/constants/activityColors';

import {
  clampLevel,
  DISTANCE_LIMITS,
  DISTANCE_TICKS,
  fracToKm,
  fracToPace,
  kmToFrac,
  levelHint,
  levelLabel,
  nearestIndex,
  PACE_SCALE,
  paceToFrac,
  parseKm,
  snapKm,
  stepKm,
  stepPace,
  type EventSport,
  type UiLevel,
} from '@shared/eventLevel.ts';

/**
 * Selettori del passo "Dettagli" di una nuova uscita, come nei mockup: distanza (− valore grande +, distanze rapide,
 * scala completa e distanza personalizzata), ritmo (card con la figura che corre al ritmo scelto e scala che si apre)
 * e livello (card con la barra a gradiente e l'indicatore trascinabile).
 * - Le scale si trascinano (il pollice segue il dito, il valore si aggancia) e si toccano: toccare un'etichetta ci salta.
 * - I numeri contano in modo fluido quando cambiano; i colori sono quelli ufficiali dell'attività.
 * - Con "Riduci movimento" niente animazioni: lo stato finale compare subito. Le altezze sono fisse o si aprono
 *   scorrendo (Reveal): nessun salto di layout.
 * Tutta la logica (scale, agganci, stima del livello) è pura e testata in shared/eventLevel.ts.
 */

/* ---------- utilità ---------- */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Versione "fredda" del colore dell'attività: inizio della sfumatura delle scale. */
const coolOf = (solid: string) => mix(solid, '#8A96A3', 0.55);

const decimalsOf = (v: number) => {
  const c = Math.round(v * 100);
  return c % 100 === 0 ? 0 : c % 10 === 0 ? 1 : 2;
};
const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');
const kmText = (km: number) => fmtNum(km, decimalsOf(km));
const clock = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function aboutDuration(sec: number): string {
  const min = Math.max(5, Math.round(sec / 300) * 5);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
const tickFeel = () => void Haptics.selectionAsync().catch(() => undefined);

/** Ultimo valore sempre disponibile ai gestori (che vengono creati una volta sola). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Numero che "conta" fino al nuovo valore (immediato durante il trascinamento o con movimento ridotto). */
function useTween(target: number | null, instant: boolean): number | null {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(target);
  const cur = useRef(target);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const from = cur.current;
    if (target === null || from === null || reduce || instant || from === target) {
      cur.current = target;
      setShown(target);
      return;
    }
    anim.setValue(0);
    const id = anim.addListener(({ value }) => {
      cur.current = from + (target - from) * value;
      setShown(cur.current);
    });
    Animated.timing(anim, { toValue: 1, duration: M.local + 80, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      cur.current = target;
      setShown(target);
    });
    return () => {
      anim.stopAnimation();
      anim.removeListener(id);
    };
  }, [target, reduce, instant, anim]);
  return shown;
}

/** Il numero che conta si ridisegna da solo a ogni fotogramma: il resto del selettore resta fermo. */
function Count({ value, instant, children }: { value: number | null; instant: boolean; children: (n: number | null) => ReactElement }) {
  const n = useTween(value, instant);
  return children(n);
}

/** Ricorda l'ultimo testo non vuoto: mentre un pannello si chiude il suo contenuto non sparisce di colpo. */
function useLastText(text: string): string {
  const [last, setLast] = useState(text);
  useEffect(() => {
    if (text) setLast(text);
  }, [text]);
  return text || last;
}

/* ---------- gesto delle scale ---------- */

type DragHandlers = { onStart?: () => void; onMove: (px: number) => void; onEnd: (px: number) => void; onTap?: (px: number) => void };

/**
 * Trascinamento orizzontale con PanResponder: prende il gesto solo quando il movimento è chiaramente orizzontale
 * (lo scorrimento verticale della pagina resta libero) e da lì non lo cede. Il tocco breve è riconosciuto a parte.
 * Le coordinate sono relative alla rotaia (`railRef`), misurata a ogni tocco (la pagina può essere scorsa nel frattempo).
 */
function useScaleDrag(handlers: DragHandlers) {
  const railRef = useRef<ViewInstance>(null);
  const origin = useRef(0);
  const h = useLatest(handlers);
  const touch = useRef({ x0: 0, y0: 0, at: 0, dragged: false, last: 0 });
  const measure = () =>
    railRef.current?.measureInWindow((pageX) => {
      if (Number.isFinite(pageX)) origin.current = pageX;
    });
  const [pan] = useState(() => {
    const wants = (_e: GestureResponderEvent, g: PanResponderGestureState) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2;
    const at = (e: GestureResponderEvent) => e.nativeEvent.pageX - origin.current;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: wants,
      onMoveShouldSetPanResponder: wants,
      onPanResponderGrant: (e) => {
        touch.current.dragged = true;
        touch.current.last = at(e);
        h.current.onStart?.();
        h.current.onMove(touch.current.last);
      },
      onPanResponderMove: (e) => {
        touch.current.last = at(e);
        h.current.onMove(touch.current.last);
      },
      onPanResponderRelease: () => h.current.onEnd(touch.current.last),
      onPanResponderTerminate: () => h.current.onEnd(touch.current.last),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  });
  const viewHandlers = {
    ...pan.panHandlers,
    onTouchStart: (e: GestureResponderEvent) => {
      measure();
      touch.current = { x0: e.nativeEvent.pageX, y0: e.nativeEvent.pageY, at: Date.now(), dragged: false, last: e.nativeEvent.pageX - origin.current };
    },
    onTouchEnd: (e: GestureResponderEvent) => {
      const s = touch.current;
      if (s.dragged || Date.now() - s.at > 600) return;
      if (Math.abs(e.nativeEvent.pageX - s.x0) > 10 || Math.abs(e.nativeEvent.pageY - s.y0) > 10) return;
      h.current.onTap?.(e.nativeEvent.pageX - origin.current);
    },
  };
  return { railRef, measure, viewHandlers };
}

/* ---------- pulsanti − / + ---------- */

/** Pulsante tondo a icona: un tocco = un passo, tenendo premuto ripete accelerando. */
function StepButton({ icon, label, onStep, disabled, tint }: { icon: IconName; label: string; onStep: () => void; disabled?: boolean; tint: string }) {
  const reduce = useReduceMotion();
  const s = useRef(new Animated.Value(1)).current;
  const step = useLatest(onStep);
  const off = useLatest(!!disabled);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const press = (v: number) => (reduce ? s.setValue(1) : Animated.timing(s, { toValue: v, duration: M.press, easing: Easing.out(Easing.quad), useNativeDriver: true }).start());
  const repeat = (n: number) => {
    if (off.current) return stop();
    step.current();
    timer.current = setTimeout(() => repeat(n + 1), n < 5 ? 150 : n < 18 ? 85 : 45);
  };
  return (
    <Pressable
      onPress={() => step.current()}
      onLongPress={() => repeat(0)}
      delayLongPress={350}
      onPressIn={() => press(0.88)}
      onPressOut={() => {
        stop();
        press(1);
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}>
      <Animated.View style={[st.step, { opacity: disabled ? 0.35 : 1, transform: [{ scale: s }] }]}>
        <Ionicons name={icon} size={26} color={tint} />
      </Animated.View>
    </Pressable>
  );
}

/** Tiene il posto (niente salti di layout) ma nasconde il contenuto a vista e allo screen reader. */
function Hideable({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <View style={{ opacity: hidden ? 0 : 1 }} pointerEvents={hidden ? 'none' : 'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
      {children}
    </View>
  );
}

/* ---------- scala trascinabile (distanza e ritmo) ---------- */

const INSET = 18; // spazio ai lati per il pollice e le etichette estreme
const THUMB = 28;
const RAIL = 8;
const RAIL_Y = 14; // centro verticale della rotaia
const SCALE_H = 54;
const TAP_TOLERANCE = 22; // px: toccando vicino a un'etichetta si salta esattamente alla sua tacca

type Tick = { frac: number; label: string; on: boolean };

function DialScale({ frac, empty, from, to, accent, ticks, magnet = 0, a11y, onDrag, onTap }: {
  frac: number;
  empty: boolean;
  from: string;
  to: string;
  accent: string;
  ticks: Tick[];
  /** Raggio (px) entro cui il trascinamento si aggancia a una tacca. */
  magnet?: number;
  a11y: { label: string; value: string; hint?: string; onStep: (dir: 1 | -1) => void };
  onDrag: (frac: number, tick: number, end: boolean) => void;
  onTap: (frac: number, tick: number) => void;
}) {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const [dragging, setDragging] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const grab = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const fracs = ticks.map((t) => t.frac);
  const toFrac = (px: number) => (w > 0 ? clamp(px, 0, w) / w : 0);
  const near = (f: number, px: number) => (w > 0 && px > 0 ? nearestIndex(fracs, f, px / w) : -1);
  const grow = (v: number) => (reduce ? grab.setValue(0) : Animated.timing(grab, { toValue: v, duration: M.press, useNativeDriver: true }).start());

  const drag = useScaleDrag({
    onStart: () => {
      setDragging(true);
      grow(1);
    },
    onMove: (px) => {
      const f = toFrac(px);
      x.setValue(f * w);
      onDrag(f, near(f, magnet), false);
    },
    onEnd: (px) => {
      const f = toFrac(px);
      onDrag(f, near(f, magnet), true);
      setDragging(false);
      grow(0);
    },
    onTap: (px) => {
      const f = toFrac(px);
      onTap(f, near(f, TAP_TOLERANCE));
    },
  });

  // Fuori dal trascinamento il pollice va (morbido) alla posizione del valore agganciato.
  useEffect(() => {
    if (dragging || w <= 0) return;
    const target = frac * w;
    if (reduce || !placed.current) {
      placed.current = true;
      x.setValue(target);
      return;
    }
    Animated.spring(x, { toValue: target, useNativeDriver: true, speed: 16, bounciness: 5 }).start();
  }, [frac, w, dragging, reduce, x]);

  return (
    <View
      style={{ height: SCALE_H, marginHorizontal: -S.xs }}
      {...drag.viewHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={a11y.label}
      accessibilityValue={{ text: a11y.value }}
      accessibilityHint={a11y.hint}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e: AccessibilityActionEvent) => a11y.onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <View
        ref={drag.railRef}
        pointerEvents="none"
        onLayout={(e: LayoutChangeEvent) => {
          setW(e.nativeEvent.layout.width);
          drag.measure();
        }}
        style={{ position: 'absolute', left: INSET, right: INSET, top: 0, bottom: 0 }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: RAIL_Y - RAIL / 2, height: RAIL, borderRadius: RAIL / 2, overflow: 'hidden', backgroundColor: color.surfaceElevated }}>
          <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { opacity: empty ? 0 : 1 }]} />
          {/* Maschera: copre la parte a destra del pollice, così il gradiente "riempie" fino al valore. */}
          <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: Math.max(w, 1), backgroundColor: color.surfaceElevated, transform: [{ translateX: x }] }} />
        </View>
        {w > 0
          ? ticks.map((t, i) => (
              <View key={i} style={{ position: 'absolute', top: RAIL_Y + 9, left: t.frac * w - 22, width: 44, alignItems: 'center' }}>
                <View style={{ width: 2, height: 6, borderRadius: 1, backgroundColor: t.on ? accent : color.controlBorder }} />
                <Text style={[type.caption, st.tickLabel, { color: t.on ? accent : color.textTertiary, fontWeight: t.on ? '800' : '600' }]} numberOfLines={1}>
                  {t.label}
                </Text>
              </View>
            ))
          : null}
        <Animated.View style={{ position: 'absolute', top: RAIL_Y - THUMB / 2, left: -THUMB / 2, transform: [{ translateX: x }] }}>
          <Animated.View style={[st.thumb, { backgroundColor: empty ? color.surface : color.text, borderColor: empty ? color.controlBorder : accent, transform: [{ scale: grab.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]} />
        </Animated.View>
      </View>
    </View>
  );
}

/* ---------- distanza ---------- */

/** Distanze rapide per tipo: le più comuni tra le tacche della scala (per la corsa quelle del mockup). */
const QUICK_KM: Record<EventSport, readonly number[]> = {
  running: [5, 8, 10, 15, 21],
  walking: [2, 4, 6, 8, 10],
  trail: [5, 10, 15, 21, 30],
  run_walk: [2, 3, 5, 8, 10],
  other: [3, 5, 10, 20, 30],
};

function distanceNote(km: number, sport: EventSport): string {
  if (sport !== 'running') return '';
  if (Math.abs(km - 21.1) <= 0.15) return 'La distanza della mezza maratona';
  if (Math.abs(km - 42.2) <= 0.25) return 'La distanza della maratona';
  return '';
}

function kmProblem(text: string): string {
  const v = Number(text.trim().replace(',', '.'));
  if (Number.isFinite(v) && v >= 0 && v < DISTANCE_LIMITS.min) return 'Almeno 0,5 km';
  if (Number.isFinite(v) && v > DISTANCE_LIMITS.max) return `Al massimo ${DISTANCE_LIMITS.max} km`;
  return 'Scrivi i km, per esempio 7,5';
}

/**
 * Distanza come nel mockup: − e + tondi attorno al valore grande in un riquadro, distanze rapide in pillole
 * (i "…" aprono la scala completa da trascinare) e la riga "Distanza personalizzata" che diventa un campo.
 * Facoltativa: "—" quando non c'è, si toglie con l'icona accanto al titolo.
 */
export function DistanceDial({ sport, value, onChange }: { sport: EventSport; value: number | null; onChange: (km: number | null) => void }) {
  const tint = styleOfSport(sport).solid;
  const ticks = DISTANCE_TICKS[sport];
  const quick = QUICK_KM[sport];
  const [live, setLive] = useState<number | null>(null); // valore mentre si trascina
  const [scaleOpen, setScaleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<TextInputInstance>(null);
  const lastTick = useRef<number | null>(null);
  const shown = live ?? value;
  const pos = shown === null ? 0 : kmToFrac(ticks, shown);
  const bad = editing && text.trim() !== '' && parseKm(text) === null;
  /** Distanza scelta che non è tra le pillole: la mostra la riga "Distanza personalizzata". */
  const customKm = value !== null && !quick.includes(value) ? value : null;

  const valueAt = (f: number, tick: number) => (tick >= 0 ? ticks[tick] : snapKm(fracToKm(ticks, f)));
  const feel = (v: number) => {
    const isTick = ticks.includes(v);
    if (isTick && lastTick.current !== v) tickFeel();
    lastTick.current = isTick ? v : null;
  };
  const commit = (v: number | null) => {
    if (v !== value) onChange(v);
  };
  // Il testo è già applicato mentre si scrive: chiudere il campo (anche toccando scala, pillole, − / + o ×) non cambia più nulla.
  const leaveEdit = () => {
    if (editing) setEditing(false);
  };
  const onDrag = (f: number, tick: number, end: boolean) => {
    const v = valueAt(f, tick);
    leaveEdit();
    if (end) {
      setLive(null);
      lastTick.current = null;
      return commit(v);
    }
    feel(v);
    if (v !== live) setLive(v);
  };
  const onTap = (f: number, tick: number) => {
    const v = valueAt(f, tick);
    leaveEdit();
    feel(v);
    lastTick.current = null;
    commit(v);
  };
  const step = (dir: 1 | -1) => {
    leaveEdit();
    commit(stepKm(value, dir, ticks));
  };
  const pickQuick = (k: number) => {
    leaveEdit();
    if (k !== value) tickFeel();
    commit(k);
  };
  const startEdit = () => {
    setText(value === null ? '' : kmText(value));
    setEditing(true);
  };
  /** Campo svuotato = nessuna distanza; testo valido = applicato subito; testo non valido = resta l'ultimo valore buono. */
  const onType = (t: string) => {
    setText(t);
    if (!t.trim()) return commit(null);
    const v = parseKm(t);
    if (v !== null) commit(v);
  };

  const note = bad ? kmProblem(text) : editing ? 'Scrivi i km, anche con la virgola' : shown !== null ? distanceNote(shown, sport) : '';
  const noteShown = useLastText(note);
  const said = shown === null ? 'Distanza non indicata' : `${kmText(shown)} chilometri`;

  return (
    <View>
      <SectionTitle
        title="Distanza"
        right={
          <Hideable hidden={value === null}>
            <IconButton
              name="close-circle"
              size={20}
              color={color.textTertiary}
              label="Togli la distanza"
              onPress={() => {
                leaveEdit();
                commit(null);
              }}
            />
          </Hideable>
        }
      />
      <View style={st.readout}>
        <StepButton icon="remove" label="Mezzo chilometro in meno" tint={tint} disabled={value === null || value <= DISTANCE_LIMITS.min} onStep={() => step(-1)} />
        <View style={st.valueBox} accessible accessibilityLabel={said}>
          <Count value={shown} instant={live !== null}>
            {(n) => (
              <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit>
                {n === null ? '—' : fmtNum(n, decimalsOf(shown ?? 0))}
              </Text>
            )}
          </Count>
          <Text style={st.unit}>km</Text>
        </View>
        <StepButton icon="add" label="Mezzo chilometro in più" tint={tint} disabled={value !== null && value >= DISTANCE_LIMITS.max} onStep={() => step(1)} />
      </View>

      <View style={st.chips} accessibilityRole="radiogroup" accessibilityLabel="Distanze rapide">
        {quick.map((k) => (
          <OptionChip key={k} grow label={String(k)} on={value === k} tint={tint} accessibilityLabel={`${k} chilometri`} onPress={() => pickQuick(k)} />
        ))}
        <OptionChip
          grow
          icon="ellipsis-horizontal"
          role="button"
          on={scaleOpen}
          expanded={scaleOpen}
          tint={tint}
          accessibilityLabel={scaleOpen ? 'Nascondi la scala delle distanze' : 'Altre distanze'}
          accessibilityHint={scaleOpen ? undefined : 'Mostra la scala completa da trascinare'}
          onPress={() => setScaleOpen((o) => !o)}
        />
      </View>
      <Reveal open={scaleOpen}>
        <View style={st.scaleBox}>
          <DialScale
            frac={pos}
            empty={shown === null}
            from={coolOf(tint)}
            to={tint}
            accent={tint}
            magnet={7}
            ticks={ticks.map((t, i) => ({ frac: i / (ticks.length - 1), label: String(t), on: shown === t }))}
            a11y={{ label: 'Distanza', value: shown === null ? 'non indicata' : `${kmText(shown)} chilometri`, onStep: step }}
            onDrag={onDrag}
            onTap={onTap}
          />
        </View>
      </Reveal>

      {editing ? (
        <View style={[st.customRow, { borderColor: bad ? color.danger : tint }]}>
          <Ionicons name="pencil" size={18} color={tint} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={onType}
            autoFocus
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={() => input.current?.blur()}
            onBlur={leaveEdit}
            maxLength={6}
            selectTextOnFocus
            placeholder="Es. 7,5"
            placeholderTextColor={color.textTertiary}
            accessibilityLabel="Distanza personalizzata in chilometri"
            accessibilityHint={bad ? kmProblem(text) : undefined}
            style={[st.customInput, { color: bad ? color.danger : color.text }]}
          />
          <Text style={[type.subhead, { color: color.textSecondary, fontWeight: '600' }]}>km</Text>
          <IconButton name="checkmark" size={22} color={tint} label="Conferma la distanza" onPress={() => input.current?.blur()} />
        </View>
      ) : (
        <Pressable
          onPress={startEdit}
          accessibilityRole="button"
          accessibilityLabel={customKm !== null ? `Distanza personalizzata: ${kmText(customKm)} chilometri` : 'Distanza personalizzata'}
          accessibilityHint="Scrivi una distanza precisa"
          style={({ pressed }) => [st.customRow, { borderColor: customKm !== null ? tint : 'transparent' }, pressed && { opacity: 0.75 }]}>
          <Ionicons name="pencil" size={18} color={customKm !== null ? tint : color.textSecondary} />
          <Text style={[type.subhead, { flex: 1, color: color.text, fontWeight: '600' }]} numberOfLines={1}>
            Distanza personalizzata
          </Text>
          {customKm !== null ? <Text style={[type.subhead, { color: tint, fontWeight: '800', fontVariant: ['tabular-nums'] }]}>{kmText(customKm)} km</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
        </Pressable>
      )}
      <Reveal open={!!note}>
        <Text style={[st.note, { color: bad ? color.danger : color.textTertiary }]} accessibilityLiveRegion={bad ? 'polite' : 'none'}>
          {noteShown}
        </Text>
      </Reveal>
    </View>
  );
}

/* ---------- ritmo ---------- */

type PacedSport = Exclude<EventSport, 'other'>;

/** Figura del ritmo per tipo: le stesse proporzioni e la stessa geometria di SportIcon. */
const PACE_GLYPH: Record<PacedSport, Glyph> = { running: 'run', walking: 'walk', trail: 'trail', run_walk: 'run_walk' };

/** Figura continua e cadenza interpolata: il tipo cambia senza azzerare il ciclo. */
function PaceRunner({ sport, pace, tint }: { sport: PacedSport; pace: number | null; tint: string }) {
  const focused = useIsFocused();
  return <View style={{ width: 108, height: 88, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={{ position: 'absolute', bottom: 2, width: 48, height: 5, borderRadius: 3, backgroundColor: alpha(tint, 0.18) }} />
    <AnimatedActivityFigure glyph={PACE_GLYPH[sport]} size={76} color={tint} pace={pace} active={focused && pace !== null} />
  </View>;
}

/** Onde morbide dietro la figura, come lo sfondo della card del ritmo nel mockup (decorative). */
function Waves({ tint }: { tint: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 36, height: 70 }}>
      <Svg width="100%" height="100%" viewBox="0 0 300 70" preserveAspectRatio="none">
        <Path d="M0 40 C 50 18 90 58 150 36 S 250 14 300 34 L300 70 L0 70 Z" fill={alpha(tint, 0.1)} />
        <Path d="M0 54 C 60 36 110 70 170 50 S 260 38 300 50 L300 70 L0 70 Z" fill={alpha(tint, 0.08)} />
      </Svg>
    </View>
  );
}

/** Spiegazione dell'animazione, come sotto la scala del mockup (solo quando la figura si muove davvero). */
const STRIDE_NOTE = 'La figura segue il ritmo scelto: una falcata più rilassata o più frequente. È un’illustrazione, non una misura della tua cadenza.';
const MOTION_NOTE: Record<PacedSport, string> = {
  running: STRIDE_NOTE,
  trail: STRIDE_NOTE,
  run_walk: STRIDE_NOTE,
  walking: 'La figura segue il ritmo scelto: passi più rilassati o più frequenti. È un’illustrazione, non una misura della tua cadenza.',
};

/**
 * Ritmo come nel mockup: card con la figura che corre (o cammina) al ritmo scelto, "6:30 min/km" grande e la freccia
 * che apre la scala da trascinare (corsa 3:30-9:00, camminata 7:00-15:00…). Per "Altro" il ritmo non si indica.
 * Come nel mockup la scala si legge con i minuti al chilometro crescenti da sinistra a destra (5:00 · 6:30 · 9:00):
 * a sinistra il passo veloce. Le funzioni condivise misurano 0 = lento, 1 = veloce, quindi qui la posizione si capovolge.
 */
export function PaceDial({ sport, value, km, onChange }: { sport: PacedSport; value: number | null; km: number | null; onChange: (sec: number | null) => void }) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const tint = styleOfSport(sport).solid;
  const scale = PACE_SCALE[sport];
  const [live, setLive] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [inputError, setInputError] = useState('');
  const lastTick = useRef<number | null>(null);
  const turn = useRef(new Animated.Value(0)).current;
  const shown = live ?? value;
  const posOf = (sec: number) => 1 - paceToFrac(sport, sec);
  const pos = shown === null ? 0.5 : posOf(shown);

  useEffect(() => {
    if (reduce) return turn.setValue(open ? 1 : 0);
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: M.local, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, reduce, turn]);

  const draft = (v: number) => { setMinutes(String(Math.floor(v / 60))); setSeconds(String(v % 60).padStart(2, '0')); setLive(v); setInputError(''); };
  const openPicker = () => { if (value !== null) draft(value); else { setMinutes(''); setSeconds(''); setLive(null); } setInputError(''); setOpen(true); };
  const closePicker = () => { setLive(null); setOpen(false); };
  const savePicker = () => { const v = paceFromFields(minutes, seconds); if (v === null) return setInputError('Indica minuti e secondi: da 2:00 a 15:00 min/km, con secondi da 00 a 59.'); commit(v); closePicker(); };
  const valueAt = (f: number, tick: number) => (tick >= 0 ? scale.labels[tick] : fracToPace(sport, 1 - f));
  const feel = (v: number) => {
    const isTick = scale.labels.includes(v);
    if (isTick && lastTick.current !== v) tickFeel();
    lastTick.current = isTick ? v : null;
  };
  const commit = (v: number | null) => {
    if (v !== value) onChange(v);
  };
  const onDrag = (f: number, tick: number, end: boolean) => {
    const v = valueAt(f, tick);
    if (end) {
      lastTick.current = null;
      return draft(v);
    }
    feel(v);
    if (v !== live) draft(v);
  };
  const onTap = (f: number, tick: number) => {
    const v = valueAt(f, tick); feel(v); lastTick.current = null; draft(v);
  };
  const step = (dir: 1 | -1) => draft(stepPace(shown, dir, sport));
  const speed = shown ? `${fmtNum(3600 / shown, 1)} km/h` : '';
  const note = shown === null ? 'Facoltativo: trascina la scala o tocca un valore' : [speed, km ? `${kmText(km)} km in circa ${aboutDuration(km * shown)}` : null].filter(Boolean).join(' · ');
  const said = shown === null ? 'non indicato' : `${clock(shown)} minuti al chilometro`;

  return (
    <View>
      <SectionTitle
        title="Ritmo"
        right={
          <Hideable hidden={value === null}>
            <IconButton name="close-circle" size={20} color={color.textTertiary} label="Togli il ritmo" onPress={() => commit(null)} />
          </Hideable>
        }
      />
      <View style={st.paceCard}>
        <LinearGradient colors={[alpha(tint, 0.26), alpha(tint, 0.06)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Waves tint={tint} />
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={`Ritmo: ${said}`}
          accessibilityHint="Apre il pannello per impostare minuti e secondi al chilometro"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [st.paceHead, pressed && { opacity: 0.8 }]}>
          <PaceRunner sport={sport} pace={shown} tint={tint} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Count value={shown} instant={live !== null}>
              {(n) => (
                <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit>
                  {n === null ? '—' : clock(n)}
                </Text>
              )}
            </Count>
            <Text style={st.unit}>min/km</Text>
            {value === null ? <Text style={[type.caption, { color: color.textSecondary, marginTop: S.xs }]}>Tocca per impostare</Text> : null}
          </View>
          <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
            <Ionicons name="chevron-forward" size={22} color={color.textSecondary} />
          </Animated.View>
        </Pressable>
        <Modal visible={open} transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={closePicker} statusBarTranslucent>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <Pressable style={{ flex: 1, backgroundColor: color.overlay }} onPress={closePicker} accessibilityRole="button" accessibilityLabel="Chiudi il selettore del ritmo" />
            <View accessibilityViewIsModal style={{ maxHeight: '90%', backgroundColor: color.surface, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, paddingBottom: insets.bottom + S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.xl, paddingTop: S.md }}>
                <Text style={[type.title2, { flex: 1, color: color.text }]} accessibilityRole="header">Imposta il ritmo</Text>
                <IconButton name="close" label="Chiudi il selettore del ritmo" onPress={closePicker} filled />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: S.xl, gap: S.lg }}>
          <View style={{ flexDirection: 'row', gap: S.md }}>
            <View style={{ flex: 1 }}><Field label="Minuti" value={minutes} onChangeText={(text) => { const value = text.replace(/\D/g, '').slice(0, 2); setMinutes(value); setLive(paceFromFields(value, seconds)); setInputError(''); }} keyboardType="number-pad" maxLength={2} placeholder="5" /></View>
            <View style={{ flex: 1 }}><Field label="Secondi" value={seconds} onChangeText={(text) => { const value = text.replace(/\D/g, '').slice(0, 2); setSeconds(value); setLive(paceFromFields(minutes, value)); setInputError(''); }} keyboardType="number-pad" maxLength={2} placeholder="30" /></View>
          </View>
          <Text style={[type.footnote, { color: color.textSecondary }]}>Minuti al chilometro. Scrivi il valore esatto oppure trascina la scala.</Text>
          {inputError ? <Banner tone="error" text={inputError} /> : null}
          <View style={{ paddingHorizontal: S.md, paddingBottom: S.md }}>
            <DialScale
              frac={pos}
              empty={shown === null}
              from={coolOf(tint)}
              to={tint}
              accent={tint}
              ticks={scale.labels.map((s) => ({ frac: posOf(s), label: clock(s), on: shown === s }))}
              // A destra i minuti al chilometro aumentano: "aumenta" rende il ritmo più lento, come la scala che si vede.
              a11y={{ label: 'Ritmo', value: said, hint: 'Aumenta per un ritmo più lento, diminuisci per uno più veloce', onStep: (d) => step(d === 1 ? -1 : 1) }}
              onDrag={onDrag}
              onTap={onTap}
            />
            <Text style={[st.note, shown === null ? { color: color.textSecondary } : { color: color.text, fontWeight: '600' }]} numberOfLines={2}>
              {note}
            </Text>
            {!reduce ? <Text style={[st.note, { color: color.textSecondary, paddingTop: S.xs }]}>{MOTION_NOTE[sport]}</Text> : null}
          </View>
              </ScrollView>
              <View style={{ paddingHorizontal: S.xl }}><Button title="Conferma ritmo" onPress={savePicker} /></View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </View>
  );
}

/* ---------- livello ---------- */

/** Colori progressivi dei 5 livelli, dal più facile al più impegnativo (verde → giallo → arancio → magenta, come nel mockup). */
const LEVEL_COLORS = ['#38D39F', '#B5D957', '#F2C14E', '#FF8A5C', '#E86AD6'] as const;
const BAR_H = 10;
const BAR_THUMB = 28;
const BAR_AREA = 48;
/** Titolo + due righe di descrizione: altezza fissa, così il cambio di livello non sposta nulla. */
const LEVEL_TEXT_H = type.title2.lineHeight + 2 * type.footnote.lineHeight;
/** Etichette sotto la barra (come nel mockup): i tre livelli di riferimento. */
const BAR_LABELS: { level: UiLevel; align: 'left' | 'center' | 'right' }[] = [
  { level: 0, align: 'left' },
  { level: 2, align: 'center' },
  { level: 4, align: 'right' },
];

function levelIntro(sport: EventSport): string {
  if (sport === 'other') return 'Per un’attività diversa il livello non si stima da distanza e ritmo: sceglilo tu trascinando l’indicatore.';
  if (sport === 'trail') return 'Sul trail il livello si stima soprattutto dalla distanza: salite e discese rendono il ritmo solo indicativo. Puoi modificarlo trascinando l’indicatore.';
  return 'Il livello è determinato automaticamente in base alla distanza, al ritmo e all’attività. Puoi modificarlo trascinando l’indicatore.';
}

/**
 * Livello come nel mockup: spiegazione, card con la figura dell'attività, nome e descrizione del livello e la barra
 * a gradiente con l'indicatore da trascinare (si aggancia al livello al rilascio), poi la nota sulla stima.
 * Finché l'utente non lo sceglie è la stima automatica; poi resta la sua scelta (si torna alla stima con l'icona).
 */
export function LevelBar({ sport, level, auto, estimate, onChange, onReset }: { sport: EventSport; level: UiLevel; auto: boolean; estimate?: UiLevel; onChange: (l: UiLevel) => void; onReset: () => void }) {
  const reduce = useReduceMotion();
  const focused = useIsFocused();
  const [w, setW] = useState(0);
  const [live, setLiveState] = useState<UiLevel | null>(null);
  // Copia sincrona del livello trascinato: più eventi di movimento possono arrivare prima del nuovo render,
  // e confrontarli con lo stato vecchio ripeterebbe la vibrazione e l'aggiornamento.
  const liveRef = useRef<UiLevel | null>(null);
  const setLive = (l: UiLevel | null) => {
    liveRef.current = l;
    setLiveState(l);
  };
  const x = useRef(new Animated.Value(0)).current;
  const grab = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const shown = live ?? level;
  const tint = LEVEL_COLORS[shown];
  const dragging = live !== null;
  const manual = !auto || dragging;
  const sportStyle = styleOfSport(sport);
  const at = (px: number): UiLevel => (w > 0 ? clampLevel(Math.floor((clamp(px, 0, w - 0.01) / w) * 5)) : level);
  const grow = (v: number) => (reduce ? grab.setValue(0) : Animated.timing(grab, { toValue: v, duration: M.press, useNativeDriver: true }).start());
  const pick = (l: UiLevel) => {
    if (l !== shown) tickFeel();
    onChange(l);
  };

  const drag = useScaleDrag({
    onStart: () => {
      setLive(level);
      grow(1);
    },
    onMove: (px) => {
      x.setValue(clamp(px, 0, w));
      const l = at(px);
      if (l !== (liveRef.current ?? level)) {
        tickFeel();
        setLive(l);
      }
    },
    onEnd: (px) => {
      setLive(null);
      grow(0);
      onChange(at(px));
    },
    onTap: (px) => pick(at(px)),
  });

  // Fuori dal trascinamento l'indicatore scivola al centro del livello (anche quando cambia la stima automatica).
  useEffect(() => {
    if (dragging || w <= 0) return;
    const target = ((level + 0.5) / 5) * w;
    if (reduce || !placed.current) {
      placed.current = true;
      x.setValue(target);
      return;
    }
    Animated.spring(x, { toValue: target, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [level, w, dragging, reduce, x]);

  const autoNote = sport === 'other' ? 'Livello di partenza: per un’attività diversa sceglilo tu.' : 'Questa è una stima iniziale basata sulle tue scelte. Puoi modificarla in qualsiasi momento.';

  return (
    <View style={{ gap: S.md }}>
      <View style={{ gap: S.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: HIT, marginBottom: -S.xs }}>
          <Text style={[type.title2, { color: color.text }]} accessibilityRole="header">
            Livello
          </Text>
          <Ionicons name="information-circle-outline" size={18} color={color.textTertiary} importantForAccessibility="no" accessibilityElementsHidden />
        </View>
        <Text style={[type.footnote, { color: color.textSecondary }]}>{levelIntro(sport)}</Text>
      </View>

      <View style={st.levelCard}>
        <LinearGradient colors={LEVEL_COLORS.map((c) => alpha(c, 0.12)) as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
          {/* Come nel mockup: la figura dell'attività da sola, senza cerchio, nel colore del livello. */}
          <View style={st.levelIcon} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {sportStyle.glyph ? <AnimatedActivityFigure glyph={sportStyle.glyph} size={44} color={tint} level={shown} active={focused} /> : <ActivityGlyph style={sportStyle} size={44} color={tint} />}
          </View>
          <View style={{ flex: 1, minHeight: LEVEL_TEXT_H, justifyContent: 'center' }} accessible accessibilityLabel={`Livello ${levelLabel(shown)}. ${levelHint(shown)}`}>
            <Text style={[type.title2, { color: color.text, fontWeight: '800' }]} numberOfLines={1}>
              {levelLabel(shown)}
            </Text>
            <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={2}>
              {levelHint(shown)}
            </Text>
          </View>
        </View>
        <View
          style={{ height: BAR_AREA, justifyContent: 'center' }}
          {...drag.viewHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Livello dell’uscita"
          accessibilityValue={{ text: `${levelLabel(shown)}, ${shown + 1} di 5` }}
          accessibilityHint={auto ? 'Stima automatica: puoi cambiarla' : 'Scelto da te'}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e: AccessibilityActionEvent) => pick(clampLevel(level + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))}>
          <View
            ref={drag.railRef}
            pointerEvents="none"
            onLayout={(e: LayoutChangeEvent) => {
              setW(e.nativeEvent.layout.width);
              drag.measure();
            }}
            style={{ height: BAR_AREA, justifyContent: 'center' }}>
            <View style={{ height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden' }}>
              <LinearGradient colors={[...LEVEL_COLORS]} locations={[0.1, 0.3, 0.5, 0.7, 0.9]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </View>
            <Animated.View style={{ position: 'absolute', top: (BAR_AREA - BAR_THUMB) / 2, left: -BAR_THUMB / 2, transform: [{ translateX: x }] }}>
              <Animated.View style={[st.thumb, { width: BAR_THUMB, height: BAR_THUMB, borderRadius: BAR_THUMB / 2, borderWidth: 5, borderColor: tint, backgroundColor: color.text, transform: [{ scale: grab.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }]} />
            </Animated.View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: -S.xs }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {BAR_LABELS.map((b) => (
            <Text key={b.level} style={[type.caption, { flex: 1, textAlign: b.align, color: shown === b.level ? color.text : color.textTertiary, fontWeight: shown === b.level ? '800' : '500' }]} numberOfLines={1}>
              {levelLabel(b.level)}
            </Text>
          ))}
        </View>
      </View>

      <View style={st.info}>
        <Ionicons name={manual ? 'hand-left-outline' : 'information-circle'} size={18} color={manual ? tint : color.accent} />
        <Text style={[type.footnote, { flex: 1, color: color.textSecondary }]}>
          {manual ? (
            <>
              <Text style={{ color: color.text, fontWeight: '600' }}>Scelto da te</Text>
              {!dragging && estimate !== undefined && estimate !== level ? ` · la stima sarebbe ${levelLabel(estimate)}` : ''}
            </>
          ) : (
            autoNote
          )}
        </Text>
        {manual ? (
          <Hideable hidden={dragging}>
            <IconButton name="refresh" size={20} color={color.textSecondary} label="Torna alla stima automatica" onPress={onReset} />
          </Hideable>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- stili ---------- */

const st = themedStyles({
  readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.xl, marginTop: S.md },
  valueBox: { width: 148, height: 92, borderRadius: R.card + 2, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.sm },
  // Numeri "eroe" dei selettori: più grandi dei token tipografici, cifre tabellari per non ballare.
  big: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, color: color.text, fontVariant: ['tabular-nums'] },
  unit: { ...type.subhead, color: color.textSecondary, fontWeight: '600' },
  step: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceElevated },
  chips: { flexDirection: 'row', gap: S.xs + 2, marginTop: S.lg },
  scaleBox: { marginTop: S.md, paddingHorizontal: S.sm, paddingTop: S.md, paddingBottom: S.xs, borderRadius: R.card, backgroundColor: color.surface },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 54, marginTop: S.md, paddingLeft: S.lg, paddingRight: S.sm, borderRadius: R.card, borderWidth: 1.5, backgroundColor: color.surface },
  customInput: { flex: 1, ...type.headline, fontWeight: '700', paddingVertical: 0, minHeight: HIT, fontVariant: ['tabular-nums'] },
  note: { ...type.footnote, paddingTop: S.sm, paddingHorizontal: S.xs },
  paceCard: { marginTop: S.md, borderRadius: R.card + 2, overflow: 'hidden', backgroundColor: color.surface },
  paceHead: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 112, paddingLeft: S.sm, paddingRight: S.md, paddingVertical: S.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  tickLabel: { marginTop: 3, fontVariant: ['tabular-nums'] },
  levelCard: { borderRadius: R.card + 2, overflow: 'hidden', backgroundColor: color.surface, padding: S.lg, gap: S.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' },
  levelIcon: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 60, paddingLeft: S.md, paddingRight: S.xs, paddingVertical: S.sm, borderRadius: R.control, backgroundColor: color.surface },
});
