import { themedStyles , color, C, GUTTER, HIT, M, R, S, themeMode, type } from '@/constants/theme';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientGlow } from '@/components/Ambient';
import { RunnerRefresh } from '@/components/RunnerRefresh';
import * as Haptics from 'expo-haptics';
import { ScrollProvider, useCountUp, useScrollEmitter } from '@/components/Motion';
import { AvatarCircle } from '@/components/AvatarCircle';

import type { UserPublic } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
import { useReduceMotion } from '@/lib/useReduceMotion';
export { useReduceMotion } from '@/lib/useReduceMotion';
export type IconName = keyof typeof Ionicons.glyphMap;

/* ---------- accessibilità e movimento ---------- */

export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setOn);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/** Pressable con feedback discreto (scala 0,97 in 120 ms, nessun rimbalzo). */
export function PressableScale({ style, children, disabled, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReduceMotion();
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) => (reduce ? s.setValue(1) : Animated.timing(s, { toValue: v, duration: M.press, easing: Easing.out(Easing.quad), useNativeDriver: true }).start());
  return (
    <Pressable disabled={disabled} onPressIn={() => to(0.97)} onPressOut={() => to(1)} {...rest}>
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ---------- caricamento dati ---------- */

/** Carica dati a ogni ingresso nella schermata; restituisce stato e `reload`. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError('');
    } catch (e) {
      setError(humanError(e, 'Errore.'));
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => void reload(), [reload, ...deps]));
  return { data, error, loading, reload, setData };
}

/* ---------- struttura ---------- */

export function Screen({ autoScrollY, children, onRefresh, scroll = true, pad = true, bottomPad, style, footer, glow, header, floatingFooter = false }: { autoScrollY?: number; children: ReactNode; onRefresh?: () => Promise<void> | void; scroll?: boolean; pad?: boolean; bottomPad?: number; style?: StyleProp<ViewStyle>; footer?: ReactNode; glow?: 'default' | 'brand' | 'accent'; header?: ReactNode; floatingFooter?:boolean }) {
  const insets = useSafeAreaInsets();
  const em = useScrollEmitter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Scroll automatico iniziale (es. dopo la creazione del piano): porta lo sguardo sul contenuto, una volta sola.
  useEffect(() => {
    if (!autoScrollY) return;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y: autoScrollY, animated: true }), 900);
    return () => clearTimeout(id);
  }, [autoScrollY]);
  const content: StyleProp<ViewStyle> = [{ paddingHorizontal: pad ? GUTTER : 0, paddingTop: pad ? S.lg : 0, paddingBottom: (bottomPad ?? S.xxl) + (footer ? 88 : 0) + insets.bottom, gap: S.xxl }, style];
  const body = !scroll ? (
    <View style={[{ flex: 1 }, content]}>{children}</View>
  ) : (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={content}
      onScroll={em.emit}
      scrollEventThrottle={120}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            refreshing={refreshing}
            onRefresh={async () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRefreshing(true);
              const t0 = Date.now();
              try { await onRefresh(); } finally {
                // il corridore resta almeno un attimo: l'aggiornamento si deve vedere
                setTimeout(() => setRefreshing(false), Math.max(0, 700 - (Date.now() - t0)));
              }
            }}
          />
        ) : undefined
      }>
      {children}
    </ScrollView>
  );
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {themeMode() === 'dark' ? <LinearGradient pointerEvents="none" colors={['#14130F', 'rgba(11,10,8,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 520 }} /> : null}
      {glow ? <AmbientGlow variant={glow} /> : null}
      {header}
      <ScrollProvider value={em.value}>{body}</ScrollProvider>
      {onRefresh ? <RunnerRefresh active={refreshing} top={insets.top + S.sm} /> : null}
      {footer ? <FooterBar floating={floatingFooter}>{footer}</FooterBar> : null}
    </View>
  );
}

/** Barra inferiore con l'azione principale; il contenuto sopra ha già il padding per non esserne coperto. */
export function FooterBar({ children, floating=false }: { children: ReactNode; floating?:boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: insets.bottom + S.md, backgroundColor: floating?'transparent':color.bg, borderTopWidth: floating?0:StyleSheet.hairlineWidth, borderTopColor: color.separator, gap: S.sm }}>{children}</View>;
}

/** Schermata di una tab: titolo grande, sottotitolo facoltativo, poche azioni a icona. */
export function TabScreen({ title, subtitle, left, right, children, onRefresh, glow = 'default' }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; children: ReactNode; onRefresh?: () => Promise<void> | void; glow?: 'default' | 'brand' | 'accent' }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen onRefresh={onRefresh} bottomPad={96} glow={glow} style={{ paddingTop: insets.top + S.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: HIT }}>
        {left}
        <View style={{ flex: 1 }}>
          <Text style={[t.title1, { fontSize: 38, lineHeight: 38, letterSpacing: 0.8 }]} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={t.muted}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View> : null}
      </View>
      {children}
    </Screen>
  );
}

export function Section({ title, action, onAction, children, gap = S.md }: { title?: string; action?: string; onAction?: () => void; children: ReactNode; gap?: number }) {
  return (
    <View style={{ gap }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
          <Text style={t.h2} accessibilityRole="header">
            {title}
          </Text>
          {action && onAction ? <LinkText title={action} onPress={onAction} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Superficie unica per card e riquadri: sfumatura molto lieve dall'alto-sinistra (più chiara) al fondo, bordo luce sottile.
 * Usata ovunque al posto di colori di fondo fissi, così tutte le card hanno la stessa profondità.
 * `tone`: 'brand' e 'accent' danno una tinta di categoria (viola o turchese) per i pochi momenti distintivi.
 */
export function Panel({ children, style, tone = 'default' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'brand' | 'accent' }) {
  // Vetro: in scuro un velo bianco al 4–6% e un filo bianco all'8–9%, niente ombre pesanti; in chiaro le superfici piene.
  const glass = themeMode() === 'dark';
  const strong = tone === 'accent';
  const colors: [string, string] = tone === 'brand' ? [color.brandTint, glass ? 'rgba(255,255,255,0.03)' : color.surface] : glass ? ['rgba(255,255,255,0.065)', 'rgba(255,255,255,0.035)'] : [color.surfaceElevated, color.surface];
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: R.card, borderWidth: 1, borderColor: glass ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)', ...(strong ? { borderLeftWidth: 3, borderLeftColor: color.accent } : null) }, style]}>
      {children}
    </LinearGradient>
  );
}

export function Card({ children, style, onPress, accessibilityLabel, elevated }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; elevated?: boolean }) {
  const inner = [{ padding: S.lg, gap: S.sm }, elevated && { backgroundColor: color.surfaceElevated }, style];
  if (onPress)
    return (
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Panel style={inner}>{children}</Panel>
      </PressableScale>
    );
  return <Panel style={inner}>{children}</Panel>;
}

export function Row({ children, style, gap = S.md, accessible, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; accessible?: boolean; accessibilityLabel?: string }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} accessible={accessible} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.separator, marginLeft: inset }} />;
}

/* ---------- testo ---------- */

export const t = themedStyles({
  h1: { ...type.display, color: color.text },
  h2: { ...type.title2, color: color.text },
  title1: { ...type.title1, color: color.text },
  title: { ...type.headline, color: color.text },
  body: { ...type.body, color: color.text },
  muted: { ...type.subhead, color: color.textSecondary },
  small: { ...type.footnote, color: color.textTertiary },
  caption: { ...type.caption, color: color.textTertiary },
  accent: { ...type.footnote, fontWeight: '600', color: color.accent },
  num: { ...type.metric, color: color.text },
});

export const Muted = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[t.muted, style]}>{children}</Text>;

/** Valore + unità: l'unità resta leggibile ma subordinata. */
export function Metric({ value, unit, label, size = 'md', align = 'left' }: { value: string; unit?: string; label: string; size?: 'md' | 'sm'; align?: 'left' | 'center' }) {
  // Il numero sale da zero la prima volta che entra nello schermo (solo valori numerici semplici).
  const c = useCountUp(value);
  return (
    <View ref={c.ref} onLayout={c.onLayout} style={{ flex: 1, alignItems: align === 'center' ? 'center' : 'flex-start' }} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <Text style={[size === 'md' ? type.metric : type.metricSmall, { color: color.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {c.shown}
        {unit ? <Text style={[type.footnote, { color: color.textSecondary, fontWeight: '600' }]}> {unit}</Text> : null}
      </Text>
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

/* ---------- azioni ---------- */

/**
 * Azione:
 *  - primary  → l'unica azione principale della schermata (pieno turchese, con icona)
 *  - soft/ghost → riga con freccia
 *  - danger   → riga rossa
 *  - small    → link testuale
 */
/** Miscela due colori #RRGGBB (t=0 → a, t=1 → b): serve per le sfumature dei pulsanti. */
function mixHex(a: string, b: string, t: number): string {
  const n = (h: string) => { const x = h.replace('#', ''); const v = parseInt(x.length === 3 ? x.split('').map((c) => c + c).join('') : x.slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  if (!/^#[0-9a-f]{3,8}$/i.test(a) || !/^#[0-9a-f]{3,8}$/i.test(b)) return a;
  const p = n(a), q = n(b);
  return `#${p.map((c, i) => Math.round(c + (q[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function Button({ title, onPress, busy, variant = 'primary', small, disabled, style, iconName, accessibilityHint }: { title: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'ghost' | 'danger' | 'soft' | 'brand'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: ReactNode; iconName?: IconName; accessibilityHint?: string }) {
  if (small) return <LinkText title={title} onPress={onPress} danger={variant === 'danger'} disabled={busy || disabled} style={style} />;
  const off = busy || disabled;
  if (variant === 'primary' || variant === 'brand') {
    const bg = variant === 'brand' ? color.brandStrong : color.accent;
    const fg = variant === 'brand' ? color.storyInk : color.onAccent;
    return (
      <PressableScale onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off, busy: !!busy }} accessibilityHint={accessibilityHint} style={[{ borderRadius: R.pill, shadowColor: bg, shadowOpacity: off ? 0 : 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: off ? 0 : 6 }, off && { opacity: 0.55 }, style]}>
        <View style={[st.primary, { backgroundColor: off ? mixHex(bg, color.bg, 0.55) : bg }]}>
          {busy ? <ActivityIndicator color={fg} /> : iconName ? <Ionicons name={iconName} size={20} color={fg} /> : null}
          <Text style={[type.title2, { color: fg, fontSize: 20, letterSpacing: 1.2, textTransform: 'uppercase' }]}>{title}</Text>
        </View>
      </PressableScale>
    );
  }
  const fg = variant === 'danger' ? color.danger : color.text;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off, busy: !!busy }} style={({ pressed }) => [st.row, variant === 'soft' && { backgroundColor: color.surface, paddingHorizontal: S.lg, borderRadius: R.control }, pressed && { opacity: 0.65 }, off && { opacity: 0.5 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : iconName ? <Ionicons name={iconName} size={20} color={variant === 'danger' ? color.danger : color.textSecondary} /> : null}
      <Text style={[type.callout, { flex: 1, color: fg }]}>{title}</Text>
      {variant !== 'danger' ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null}
    </Pressable>
  );
}

export function LinkText({ title, onPress, danger, disabled, style }: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={12} accessibilityRole="button" style={({ pressed }) => [{ minHeight: HIT, justifyContent: 'center', opacity: pressed || disabled ? 0.55 : 1 }, style]}>
      <Text style={[type.subhead, { fontWeight: '600', color: danger ? color.danger : color.accent }]}>{title}</Text>
    </Pressable>
  );
}

/** Pulsante a sola icona: 44×44, etichetta obbligatoria per lo screen reader. */
export function IconButton({ name, onPress, color: fg = color.text, size = 22, badge, label, filled, disabled }: { name: IconName; onPress: () => void; color?: string; size?: number; badge?: number; label: string; filled?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} non lette` : label} hitSlop={4} style={({ pressed }) => [{ width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? color.surfaceElevated : 'transparent' }, pressed && { opacity: 0.6 }, disabled && { opacity: 0.4 }]}>
      <Ionicons name={name} size={size} color={fg} />
      {badge ? (
        <View style={{ position: 'absolute', top: 6, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: color.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: color.bg }}>
          <Text style={{ color: color.onAccent, fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Banner contestuale: icona, titolo, sottotitolo. Uno solo per sezione. */
export function BannerCard({ title, subtitle, iconName, onPress, tint = color.accent, wide }: { title: string; subtitle?: string; iconName: IconName; onPress: () => void; tint?: string; wide?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle ?? ''}`} style={{ width: wide ? undefined : 230 }}>
      <Panel style={{ padding: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
      <View style={{ width: HIT, height: HIT, borderRadius: R.control, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={iconName} size={22} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={t.title}>{title}</Text>
        {subtitle ? <Text style={t.muted}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Panel>
    </PressableScale>
  );
}

/* ---------- campi ---------- */

export function Field({ label, hint, error, optional, secureToggle, ...rest }: TextInputProps & { label: string; hint?: string; error?: string; optional?: boolean; secureToggle?: boolean }) {
  const [hidden, setHidden] = useState(!!secureToggle);
  return (
    <View style={{ gap: S.xs + 2 }}>
      <Text style={st.label} nativeID={`l-${label}`}>
        {label}
        {optional ? <Text style={{ color: color.textTertiary, fontWeight: '400' }}> · facoltativo</Text> : null}
      </Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor={color.textTertiary}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          {...rest}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          style={[st.input, rest.multiline && { minHeight: 96, paddingTop: S.md, textAlignVertical: 'top' }, secureToggle && { paddingRight: HIT + S.xs }, error ? { borderColor: color.danger } : null, rest.style]}
        />
        {secureToggle ? (
          <View style={{ position: 'absolute', right: 0 }}>
            <IconButton name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={color.textSecondary} label={hidden ? 'Mostra password' : 'Nascondi password'} onPress={() => setHidden(!hidden)} />
          </View>
        ) : null}
      </View>
      {error ? (
        <Row gap={6}>
          <Ionicons name="alert-circle" size={14} color={color.danger} />
          <Text style={[type.footnote, { color: color.danger, flex: 1 }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </Row>
      ) : hint ? (
        <Text style={t.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder, onSubmit }: { value: string; onChangeText: (v: string) => void; placeholder: string; onSubmit?: () => void }) {
  return (
    <View style={[st.input, { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md }]}>
      <Ionicons name="search" size={18} color={color.textSecondary} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={color.textTertiary} returnKeyType="search" onSubmitEditing={onSubmit} accessibilityLabel={placeholder} style={{ flex: 1, color: color.text, ...type.body, paddingVertical: 0 }} />
      {value ? <IconButton name="close-circle" size={18} color={color.textTertiary} label="Cancella ricerca" onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

/* ---------- indicatori ---------- */

export function Chip({ label, tone = 'default', iconName }: { label: string; tone?: 'default' | 'accent' | 'success' | 'danger' | 'warn' | 'brand'; iconName?: IconName }) {
  const bg = { default: color.surfaceElevated, accent: color.accentTint, success: color.successTint, danger: color.dangerTint, warn: color.warningTint, brand: color.brandTint }[tone];
  const fg = { default: color.textSecondary, accent: color.accent, success: color.success, danger: color.danger, warn: color.warning, brand: color.brandText }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: R.chip, paddingHorizontal: S.sm, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {iconName ? <Ionicons name={iconName} size={12} color={fg} /> : null}
      <Text style={[type.caption, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

/** Scelta singola o multipla a "pillole" (solo dentro filtri e moduli). */
export function Pills<V extends string | number>({ options, value, onChange, multi, scroll }: { options: { value: V; label: string }[]; value: V | V[] | null; onChange: (v: any) => void; multi?: boolean; scroll?: boolean }) {
  const isOn = (v: V) => (Array.isArray(value) ? value.includes(v) : value === v);
  const toggle = (v: V) => {
    if (!multi) return onChange(v);
    const cur = (value as V[]) ?? [];
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const body = options.map((o) => {
    const on = isOn(o.value);
    return (
      <Pressable key={String(o.value)} onPress={() => toggle(o.value)} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={multi ? { checked: on } : { selected: on }} style={[st.pill, on && st.pillOn]}>
        {on ? <Ionicons name="checkmark" size={14} color={color.accent} /> : null}
        <Text style={[type.subhead, { color: on ? color.accent : color.textSecondary, fontWeight: '600' }]}>{o.label}</Text>
      </Pressable>
    );
  });
  if (scroll)
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {body}
      </ScrollView>
    );
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>{body}</View>;
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: color.surface, borderRadius: R.control, padding: 3 }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[{ flex: 1, minHeight: 38, borderRadius: R.control - 3, alignItems: 'center', justifyContent: 'center' }, on && { backgroundColor: color.surfaceElevated }]}>
            <Text style={[type.subhead, { color: on ? color.text : color.textSecondary, fontWeight: on ? '700' : '500' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: HIT }}>
      <View style={{ flex: 1 }}>
        <Text style={t.body}>{label}</Text>
        {hint ? <Text style={t.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: color.accent, false: color.surfaceElevated }} />
    </View>
  );
}

export { DateField } from './DateField';

/* ---------- persone ---------- */

/** Avatar circolare con cornice coerente per persone, profili e partecipanti. */
export function Avatar({ name, hue, size = 40, uri, frame = 'none', ring = color.accent }: { name: string; hue: number; size?: number; uri?: string | null; frame?: 'none' | 'ring' | 'double'; ring?: string }) {
  return <AvatarCircle name={name} hue={hue} size={size} uri={uri} frame={frame} ring={ring} />;
}

/** Pila di avatar reali; mostra "+N" solo se esistono altre persone. */
export function AvatarStack({ people, total, size = 26 }: { people: UserPublic[]; total?: number; size?: number }) {
  const shown = people.slice(0, 4);
  const more = (total ?? people.length) - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={`${total ?? people.length} partecipanti: ${people.slice(0, 3).map((p) => p.displayName).join(', ')}`}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -size * 0.28 : 0, width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, borderWidth: 2, borderColor: color.surface, overflow: 'hidden' }}>
          <Avatar name={p.displayName} hue={p.hue} uri={p.avatar} size={size} />
        </View>
      ))}
      {more > 0 ? <Text style={[t.small, { marginLeft: S.xs }]}>+{more}</Text> : null}
    </View>
  );
}

/* ---------- stati ---------- */

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.metricSmall, { color: color.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

export function ListItem({ title, subtitle, right, onPress, left, accessibilityLabel }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; left?: ReactNode; accessibilityLabel?: string }) {
  const body = (
    <Row>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={t.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={t.muted}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null)}
    </Row>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [{ minHeight: 52, justifyContent: 'center', paddingVertical: S.sm }, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={{ minHeight: 52, justifyContent: 'center', paddingVertical: S.sm }}>{body}</View>
  );
}

/** Avviso: icona + testo (il colore non è mai l'unico indicatore). */
export function Banner({ text, tone = 'info', action, onAction }: { text: string; tone?: 'info' | 'warn' | 'error' | 'success'; action?: string; onAction?: () => void }) {
  const col = { info: color.accent, warn: color.warning, error: color.danger, success: color.success }[tone];
  const icon: IconName = { info: 'information-circle', warn: 'warning', error: 'alert-circle', success: 'checkmark-circle' }[tone] as IconName;
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: R.control, padding: S.md, flexDirection: 'row', gap: S.sm, alignItems: 'flex-start' }} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <Ionicons name={icon} size={18} color={col} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, { color: color.textSecondary }]}>{text}</Text>
        {action && onAction ? <LinkText title={action} onPress={onAction} /> : null}
      </View>
    </View>
  );
}

export function Loading({ label = 'Caricamento' }: { label?: string }) {
  return (
    <View style={{ padding: S.xxxl, alignItems: 'center' }} accessibilityLabel={label}>
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

/** Segnaposto mostrato SOLO durante un caricamento reale. */
/** Sagoma di un componento in caricamento, con un lampo di luce che la attraversa (fermo con "Riduci movimento"). */
export function Skeleton({ height = 72, radius = R.card, width, circle }: { height?: number; radius?: number; width?: number | `${number}%`; circle?: boolean }) {
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const a = Animated.loop(Animated.sequence([Animated.timing(x, { toValue: 1, duration: 1100, useNativeDriver: true }), Animated.delay(250)]));
    a.start();
    return () => a.stop();
  }, [reduce, x]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel="Caricamento" style={{ height, width: circle ? height : width, borderRadius: circle ? height / 2 : radius, backgroundColor: color.surface, overflow: 'hidden' }}>
      {!reduce && w > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: w * 0.55, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.6, w * 1.05] }) }, { skewX: '-18deg' }] }}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.09)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Stato vuoto: un solo passo utile. */
export function Empty({ title, text, action, iconName = 'leaf-outline' }: { title: string; text?: string; action?: ReactNode; iconName?: IconName }) {
  return (
    <View style={st.empty}>
      <Ionicons name={iconName} size={28} color={color.textTertiary} />
      <Text style={[t.title, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[t.muted, { textAlign: 'center' }]}>{text}</Text> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: S.sm }}>{action}</View> : null}
    </View>
  );
}

/** Gestione uniforme di caricamento/errore per i dati di una schermata. */
export function Async<T>({ state, children, skeleton }: { state: { data: T | null; error: string; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; skeleton?: ReactNode }) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.loading) return <>{skeleton ?? <Loading />}</>;
  return <Empty iconName="cloud-offline-outline" title="Non riesco a caricare" text={state.error} action={<Button variant="soft" title="Riprova" iconName="refresh" onPress={state.reload} />} />;
}

/** Bottom sheet accessibile: chiusura con icona, tocco fuori o gesto di sistema. */
export function Sheet({ visible, onClose, title, children, footer, avoidKeyboard = false }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; avoidKeyboard?: boolean }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    y.setValue(reduce ? 0 : 1);
    Animated.timing(y, { toValue: 0, duration: reduce ? 0 : M.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, reduce, y]);
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
        <KeyboardAvoidingView enabled={avoidKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={{ flex: 1, backgroundColor: color.overlay }} onPress={onClose} accessibilityLabel="Chiudi" accessibilityRole="button" />
      <Animated.View accessibilityViewIsModal style={{ maxHeight: '86%', backgroundColor: color.surface, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, paddingBottom: insets.bottom + S.md, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 480] }) }] }}>
        <View style={{ alignItems: 'center', paddingTop: S.sm }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.controlBorder }} />
        </View>
        <Row style={{ paddingHorizontal: GUTTER, paddingTop: S.sm }}>
          <Text style={[t.h2, { flex: 1 }]} accessibilityRole="header">
            {title}
          </Text>
          <IconButton name="close" label="Chiudi" onPress={onClose} filled />
        </Row>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingVertical: S.lg, gap: S.xl }}>{children}</ScrollView>
        {footer ? <View style={{ paddingHorizontal: GUTTER, gap: S.sm }}>{footer}</View> : null}
      </Animated.View>
        </KeyboardAvoidingView>
    </Modal>
  );
}

export const st = themedStyles({
  primary: { minHeight: 52, borderRadius: R.control, paddingHorizontal: S.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: S.md },
  label: { ...type.footnote, color: C.text, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: R.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder, color: color.text, paddingHorizontal: S.lg, ...type.body },
  card: { backgroundColor: color.surface, borderRadius: R.card, padding: S.lg, gap: S.sm },
  pill: { minHeight: 38, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: color.controlBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  pillOn: { backgroundColor: color.accentTint, borderColor: color.accent },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxxl, paddingHorizontal: S.xl },
});
