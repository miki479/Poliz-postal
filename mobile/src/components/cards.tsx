import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Animated, Easing, Image, Platform, Pressable, Share, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ActivityGlyph, SportGlyph, type Glyph } from '@/components/SportIcon';
import { RouteThumb } from '@/components/RouteThumb';
import { FIGURE_IMAGE } from '@/constants/figureImages';
import { ACTIVITY_STYLES, styleOfKind, styleOfSport, type ActivityStyle } from '@/constants/activityColors';
import { Avatar, AvatarStack, Chip, Panel, PressableScale, Row, t, useReduceMotion, type IconName } from '@/components/ui';
import { clubTint, eventContext, eventSportStyle, FEATURE_ICONS, PACT_ICONS, pactModes, VISIBILITY_ICONS } from '@/constants/eventStyle';
import { GradientButton } from '@/components/event/GradientButton';
import { color, GUTTER, HIT, M, R, S, type } from '@/constants/theme';
import { dayAgo, eventShareText, fmtClock, fmtDayShort, fmtKm, formatPace, KIND_LABEL, LEVEL_LABEL, relativeFromNow, SPORT_LABEL, whenLabel } from '@/lib/format';
import { SocialBar } from '@/components/SocialBar';
import { useInView } from '@/components/Motion';
import { RouteTrace } from '@/components/RouteTrace';
import type { SocialCounts } from '@shared/social.ts';
import type { ClubView, EventView, FeedItem, SportId, UserPublic, WorkoutLog } from '@shared/types.ts';

const openEvent = (id: string) => router.push({ pathname: '/evento/[id]', params: { id } });

type Tone = 'success' | 'danger' | 'warn' | 'brand';

/** Stato dell'iscrizione (unica fonte per il segno visibile e per lo screen reader). */
function joinStatusOf(e: EventView): { label: string; tone: Tone; icon: IconName } | null {
  if (e.status === 'cancelled') return { label: 'Annullata', tone: 'danger', icon: 'close-circle' };
  if (e.viewer.isOrganizer) return { label: 'Organizzi tu', tone: 'brand', icon: 'megaphone-outline' };
  if (e.viewer.isParticipant) return { label: 'Iscritto', tone: 'success', icon: 'checkmark-circle' };
  // Non "people": nella fila di icone della card "persone" vuol dire club.
  if (e.isFull) return { label: 'Al completo', tone: 'warn', icon: 'remove-circle' };
  return null;
}

const TONE_INK: Record<Tone, string> = { success: color.success, danger: color.danger, warn: color.warning, brand: color.brandText };

/**
 * Stato dell'iscrizione: icona + testo, mai solo colore. `glass` per mostrarlo sopra la scena (testo bianco su vetro scuro,
 * leggibile anche sulla parte più luminosa della sfumatura o sull'immagine del club).
 */
export function JoinStatus({ e, glass }: { e: EventView; glass?: boolean }) {
  const s = joinStatusOf(e);
  if (!s) return null;
  return glass ? <GlassChip text={s.label} icon={s.icon} tint={TONE_INK[s.tone]} /> : <Chip label={s.label} tone={s.tone} iconName={s.icon} />;
}

/* ---------- segni dell'uscita (icone delle caratteristiche) ---------- */

/** Un segno della fila: icona Ionicons o figura dell'attività, etichetta breve (fumetto) e significato per lo screen reader. */
interface Sign {
  key: string;
  icon?: IconName;
  glyph?: ActivityStyle;
  label: string;
  meaning: string;
}

/**
 * Le icone delle caratteristiche, nell'ordine della legenda: visibilità (pubblica / su invito), club che la organizza,
 * tipo di attività, patto di corsa (una figura per impegno), caratteristiche extra reali (percorso, posti limitati).
 * Mai segni per dati assenti. Restituisce anche le frasi equivalenti per l'etichetta complessiva.
 */
function eventSigns(e: EventView): { groups: Sign[][]; said: string[] } {
  const ctx = eventContext(e);
  const groups: Sign[][] = [];
  // Per un'uscita riservata al club l'icona del club è già la visibilità: niente doppione.
  if (ctx.key !== 'club') groups.push([{ key: 'vis', icon: ctx.icon, label: ctx.key === 'public' ? 'Uscita pubblica' : 'Su invito', meaning: ctx.key === 'public' ? 'Uscita pubblica: visibile a tutti' : 'Su invito: solo chi ha il link può vederla' }]);
  if (ctx.clubName || ctx.key === 'club')
    groups.push([{ key: 'club', icon: VISIBILITY_ICONS.club.icon, label: ctx.key === 'club' ? (ctx.clubName ? `Solo per il club ${ctx.clubName}` : 'Riservata al club') : `Organizzata dal club ${ctx.clubName}`, meaning: ctx.key === 'club' ? ctx.meaning : `Organizzata dal club ${ctx.clubName}` }]);
  const st = eventSportStyle(e.sport);
  groups.push([{ key: 'sport', glyph: st, label: st.label, meaning: `Tipo di attività: ${st.label}` }]);

  const modes = pactModes(e.pact);
  const regroup = modes.includes('regroupPoints') && e.pact ? e.pact.regroupPoints.trim() : '';
  if (modes.length)
    groups.push(
      modes.map((m) => {
        const d = PACT_ICONS[m];
        return { key: m, icon: d.icon, label: d.label, meaning: `Patto di corsa, ${d.label.toLowerCase()}: ${m === 'regroupPoints' && regroup ? regroup : d.hint}` };
      }),
    );

  const extra: Sign[] = [];
  // Solo con il percorso davvero consultabile: il server lascia routeId anche quando non lo mostra (vista ridotta).
  if (e.route) {
    const name = e.route.name?.trim();
    extra.push({ key: 'route', icon: FEATURE_ICONS.route.icon, label: FEATURE_ICONS.route.label, meaning: name ? `${FEATURE_ICONS.route.label}: ${name}` : FEATURE_ICONS.route.label });
  }
  // I posti contano solo per un'uscita ancora da fare; "Al completo" senza di te lo dice già lo stato.
  const mine = e.viewer.isOrganizer || e.viewer.isParticipant;
  const max = e.maxParticipants;
  const left = e.spotsLeft;
  if (typeof max === 'number' && typeof left === 'number' && !e.isPast && e.status !== 'cancelled' && (left > 0 || mine)) {
    const d = left > 0 ? FEATURE_ICONS.limitedSpots : FEATURE_ICONS.noSpotsLeft;
    extra.push({ key: 'spots', icon: d.icon, label: left > 0 ? `${d.label}: ${left} ${left === 1 ? 'libero' : 'liberi'}` : d.label, meaning: left > 0 ? `${d.label}: ${left} ${left === 1 ? 'posto libero' : 'posti liberi'} su ${max}` : `${d.label}: occupati tutti i ${max} posti` });
  }
  if (extra.length) groups.push(extra);
  return { groups, said: groups.flat().map((s) => s.meaning) };
}

const SEP_INK = 'rgba(255,255,255,0.3)';
const SignIcon = ({ s, ink, size }: { s: Sign; ink: string; size: number }) => (s.glyph ? <ActivityGlyph style={s.glyph} size={size + 1} color={ink} /> : <Ionicons name={s.icon ?? 'ellipse-outline'} size={size} color={ink} />);

/** Fila di icone separate da sottili linee verticali, come nella legenda "Icone delle caratteristiche". */
function SignRow({ groups, ink, size = 17 }: { groups: Sign[][]; ink: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: S.xs }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {groups.map((g, i) => (
        <Fragment key={g[0].key}>
          {i ? <View style={{ width: StyleSheet.hairlineWidth * 2, height: size - 2, backgroundColor: SEP_INK, marginHorizontal: S.md }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            {g.map((s) => (
              <SignIcon key={s.key} s={s} ink={ink} size={size} />
            ))}
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const TAP = 36;
const TIP_BG = 'rgba(5,7,9,0.94)';
const TIP_MS = 2600;
interface Tip {
  key: string;
  text: string;
  /** Centro orizzontale e bordo superiore dell'icona, nelle coordinate della fila. */
  cx: number;
  top: number;
}

/**
 * Stessa fila, ma ogni icona si può toccare: compare un fumetto con il suo nome (come nella legenda dei mockup),
 * sopra l'icona e senza spostare nulla; sparisce da solo o toccando di nuovo. Con lo screen reader ogni icona
 * si legge da sola con il significato completo.
 */
function SignTips({ groups, ink, size = 19 }: { groups: Sign[][]; ink: string; size?: number }) {
  const reduce = useReduceMotion();
  const [tip, setTip] = useState<Tip | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const groupAt = useRef<Record<string, { x: number; y: number }>>({});
  const iconAt = useRef<Record<string, { x: number; y: number; w: number }>>({});
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!tip) return;
    fade.setValue(reduce ? 1 : 0);
    const a = reduce ? null : Animated.timing(fade, { toValue: 1, duration: M.local, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a?.start();
    const h = setTimeout(() => setTip(null), TIP_MS);
    return () => {
      a?.stop();
      clearTimeout(h);
    };
  }, [tip, reduce, fade]);

  const show = (groupKey: string, s: Sign) => {
    if (tip?.key === s.key) return setTip(null);
    const g = groupAt.current[groupKey] ?? { x: 0, y: 0 };
    const i = iconAt.current[s.key] ?? { x: 0, y: 0, w: TAP };
    setTip({ key: s.key, text: s.label, cx: g.x + i.x + i.w / 2, top: g.y + i.y });
  };

  // Il fumetto si apre verso il lato con più spazio; la punta resta sopra l'icona.
  const leftSide = tip ? tip.cx <= box.w / 2 : true;
  const edge = tip ? Math.max(0, (leftSide ? tip.cx : box.w - tip.cx) - 22) : 0;
  const nib = tip ? (leftSide ? tip.cx : box.w - tip.cx) - edge - 5 : 0;
  return (
    <View onLayout={(ev) => setBox({ w: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginLeft: -(TAP - size) / 2 }}>
      {groups.map((g, i) => (
        <Fragment key={g[0].key}>
          {i ? <View style={{ width: StyleSheet.hairlineWidth * 2, height: size - 2, backgroundColor: SEP_INK, marginHorizontal: S.xs }} /> : null}
          <View
            onLayout={(ev) => {
              groupAt.current[g[0].key] = { x: ev.nativeEvent.layout.x, y: ev.nativeEvent.layout.y };
            }}
            style={{ flexDirection: 'row', alignItems: 'center' }}>
            {g.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => show(g[0].key, s)}
                onLayout={(ev) => {
                  iconAt.current[s.key] = { x: ev.nativeEvent.layout.x, y: ev.nativeEvent.layout.y, w: ev.nativeEvent.layout.width };
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={s.meaning}
                accessibilityHint="Mostra il nome dell’icona"
                style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: TAP / 2, backgroundColor: tip?.key === s.key ? 'rgba(255,255,255,0.16)' : 'transparent', opacity: pressed ? 0.6 : 1 })}>
                <SignIcon s={s} ink={ink} size={size} />
              </Pressable>
            ))}
          </View>
        </Fragment>
      ))}
      {tip ? (
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            { position: 'absolute', bottom: box.h - tip.top + 2, maxWidth: Math.max(180, box.w), opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] },
            leftSide ? { left: edge } : { right: edge },
          ]}>
          <View style={[{ position: 'absolute', bottom: -4, width: 10, height: 10, backgroundColor: TIP_BG, transform: [{ rotate: '45deg' }] }, leftSide ? { left: nib } : { right: nib }]} />
          <View style={{ backgroundColor: TIP_BG, borderRadius: R.chip, paddingHorizontal: S.sm + 2, paddingVertical: 6 }}>
            <Text style={[type.footnote, { color: color.storyInk, fontWeight: '600' }]} numberOfLines={2}>
              {tip.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Icone delle caratteristiche di un'uscita come elemento a sé (dettaglio). Di base un solo annuncio con tutti i significati;
 * con `interactive` ogni icona si tocca e mostra il suo nome in un fumetto.
 */
export function EventSigns({ e, ink = color.storyInk, interactive }: { e: EventView; ink?: string; interactive?: boolean }) {
  const s = eventSigns(e);
  if (interactive) return <SignTips groups={s.groups} ink={ink} />;
  return (
    <View accessible accessibilityLabel={spoken(s.said)}>
      <SignRow groups={s.groups} ink={ink} />
    </View>
  );
}

/** Frasi per lo screen reader: i separatori grafici diventano pause naturali. */
function spoken(parts: Array<string | null | undefined | false>): string {
  return parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) => p.trim().replace(/ · /g, ', '))
    .map((p) => (/[.!?…:]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

/** Ingresso discreto (dissolvenza e piccolo spostamento); con "Riduci movimento" appare subito. */
function Enter({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return v.setValue(1);
    const a = Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    // Smontata la card (o cambiato il ritardo) l'animazione in corso si ferma, senza callback su una vista che non c'è più.
    return () => a.stop();
  }, [reduce, v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

/* ---------- scena: gradiente con la figura dell'attività (al posto delle foto) ---------- */

const NIGHT = '#0A0E12';
const HEX = /^#[0-9a-f]{6}$/i;

/** Miscela due colori esadecimali (w = peso del primo). */
function mix(a: string, b: string, w: number): string {
  if (!HEX.test(a) || !HEX.test(b)) return b;
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * w + y[i] * (1 - w)).toString(16).padStart(2, '0')).join('')}`;
}

/** Orizzonte disegnato: lungomare morbido per corsa e camminata, creste per il trail. */
const HORIZON = {
  flat: 'M0 186 C 70 176 140 184 210 178 S 340 168 400 180 L400 300 L0 300 Z',
  ridge: 'M0 192 L52 158 L96 180 L160 120 L214 168 L268 138 L326 174 L372 150 L400 162 L400 300 L0 300 Z',
} as const;

/** Figura (in controluce) per tipo: la stessa delle icone, mai una persona vera. */
const FIGURE: Partial<Record<NonNullable<ActivityStyle['glyph']>, Glyph>> = { run: 'run', walk: 'walk', trail: 'run', run_walk: 'run_walk' };

/**
 * Sfondo delle card grandi e del dettaglio: sfumatura ricca nei colori ufficiali dell'attività, un bagliore di luce,
 * l'orizzonte e la figura dell'attività in controluce. Con l'immagine del club (se c'è) l'immagine prende il posto della scena.
 * In basso una velatura scura tiene leggibile il testo bianco in ogni caso.
 */
export function EventScene({ sport, image, style, children }: { sport: SportId; image?: string | null; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const st = eventSportStyle(sport);
  const [c1, c2] = st.blend ?? [st.solid, st.solid];
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fig = st.glyph ? FIGURE[st.glyph] : undefined;
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: NIGHT }, style]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient colors={[mix(c1, NIGHT, 0.7), mix(c2, NIGHT, 0.34), NIGHT]} locations={[0, 0.58, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} />
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 300" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id={gid} cx="70%" cy="40%" rx="42%" ry="48%">
                <Stop offset="0" stopColor={mix(c2, '#FFFFFF', 0.55)} stopOpacity={0.95} />
                <Stop offset="0.3" stopColor={c2} stopOpacity={0.6} />
                <Stop offset="1" stopColor={c2} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={400} height={300} fill={`url(#${gid})`} />
            <Path d={st.glyph === 'trail' ? HORIZON.ridge : HORIZON.flat} fill={mix(c1, NIGHT, 0.16)} />
          </Svg>
          {FIGURE_IMAGE[sport] ? (
            <Image source={FIGURE_IMAGE[sport]!.src} resizeMode="contain" tintColor="#FFFFFF" style={{ position: 'absolute', left: '50%', bottom: '38%', height: 104, width: Math.round(104 * FIGURE_IMAGE[sport]!.ratio), opacity: 0.85 }} accessibilityIgnoresInvertColors />
          ) : fig ? (
            <View style={{ position: 'absolute', left: '56%', bottom: '40%', marginBottom: -14 }}>
              <SportGlyph glyph={fig} size={112} color="#05080B" />
            </View>
          ) : (
            <View style={{ position: 'absolute', left: '58%', bottom: '44%', opacity: 0.5 }}>
              <Ionicons name={st.icon} size={92} color="#05080B" />
            </View>
          )}
        </View>
      )}
      <LinearGradient colors={['rgba(5,7,9,0)', 'rgba(5,7,9,0.5)', 'rgba(5,7,9,0.92)']} locations={[0.28, 0.58, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Etichetta su vetro scuro (data e ora, stato) sopra la scena; `tint` colora solo l'icona, il testo resta bianco. */
export function GlassChip({ text, icon, tint = color.storyInk }: { text: string; icon?: IconName; tint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(5,7,9,0.6)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' }}>
      {icon ? <Ionicons name={icon} size={13} color={tint} /> : null}
      <Text style={[type.caption, { color: color.storyInk, fontWeight: '700' }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Passo senza unità ("6:30"): `formatPace` può già finire con "/km" e `fmtPace` lo raddoppia ("6:30/km/km"),
 * quindi qui l'unità si toglie sempre e si rimette una volta sola.
 */
export const paceNum = (sec: number) => formatPace(sec).replace(/\s*\/\s*km$/i, '');
const paceMin = (sec: number) => `Passo ${paceNum(sec)}/km`;
const placeOf = (e: EventView) => (e.restricted ? '' : e.meetingPlace || e.area);

/** Menu "…" della card: azioni brevi, mai più di tre voci (limite degli avvisi Android). */
function eventMenu(e: EventView) {
  const options = ['Condividi', ...(e.viewer.isOrganizer ? ['Modifica'] : []), 'Annulla'];
  const pick = (i: number) => {
    if (options[i] === 'Condividi') void Share.share({ message: eventShareText(e.title, e.startsAt, e.timezone) }).catch(() => {});
    if (options[i] === 'Modifica') router.push({ pathname: '/evento/form', params: { id: e.id } });
  };
  if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: e.title, options, cancelButtonIndex: options.length - 1 }, pick);
  else Alert.alert(e.title, undefined, [...options.slice(0, -1).map((o, i) => ({ text: o, onPress: () => pick(i) })), { text: 'Annulla', style: 'cancel' as const }]);
}

/**
 * Card grande "Uscite di gruppo": scena a tutta card (gradiente con la figura dell'attività o immagine del club),
 * data e ora in alto a sinistra, menu "…" in alto a destra, titolo grande, riga "Ritrovo · km · passo",
 * fila delle icone delle caratteristiche, avatar reali dei partecipanti e il loro numero.
 * La card è un unico pulsante; il menu è un pulsante separato accanto (non annidato).
 */
export function GroupRunCard({ e, index = 0, clubImage }: { e: EventView; index?: number; clubImage?: string | null }) {
  // Proporzioni del mockup (circa 4:3 a tutta larghezza), con un minimo per i telefoni piccoli e un tetto per i tablet.
  const { width } = useWindowDimensions();
  const h = Math.min(320, Math.max(252, Math.round((width - 2 * GUTTER) * 0.75)));
  const st = eventSportStyle(e.sport);
  const when = whenLabel(e.startsAt, e.timezone);
  const place = placeOf(e);
  const line = [place ? `Ritrovo: ${place}` : e.restricted ? 'Ritrovo visibile agli iscritti' : null, e.distanceKm ? fmtKm(e.distanceKm) : null, e.paceSecPerKm ? paceMin(e.paceSecPerKm) : null].filter(Boolean).join(' · ');
  const signs = eventSigns(e);
  const status = joinStatusOf(e);
  const n = e.participantCount;
  const people = `${n} ${n === 1 ? 'partecipante' : 'partecipanti'}`;
  const label = spoken([e.title, `${st.label}, ${when}`, line, ...signs.said, people, status?.label]);
  return (
    <Enter delay={Math.min(index, 6) * 60}>
      <View style={{ borderRadius: R.card + 2, overflow: 'hidden', opacity: e.status === 'cancelled' ? 0.65 : 1 }}>
        <PressableScale onPress={() => openEvent(e.id)} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Apre il dettaglio dell’uscita">
          <EventScene sport={e.sport} image={clubImage} style={{ minHeight: h, borderRadius: R.card + 2 }}>
            <View style={{ flex: 1, minHeight: h, padding: S.lg, justifyContent: 'space-between', gap: S.lg }}>
              <Row gap={6} style={{ flexWrap: 'wrap', paddingRight: HIT }}>
                <GlassChip text={when} />
                {status ? <GlassChip text={status.label} icon={status.icon} tint={TONE_INK[status.tone]} /> : null}
              </Row>
              <View style={{ gap: 6 }}>
                <Text style={[type.title1, { color: color.storyInk, fontSize: 24, lineHeight: 30, fontWeight: '800' }]} numberOfLines={2}>
                  {e.title}
                </Text>
                {line ? (
                  <Text style={[type.subhead, { color: color.storyInkSecondary }]} numberOfLines={1}>
                    {line}
                  </Text>
                ) : null}
                <View style={{ marginTop: S.xs }}>
                  <SignRow groups={signs.groups} ink={color.storyInk} />
                </View>
                <Row style={{ justifyContent: 'space-between', marginTop: S.sm, minHeight: 28 }}>
                  {e.participants?.length ? (
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                      {/* Tre volti come nel mockup: il numero completo è già scritto a destra, niente "+N" doppio. */}
                      <AvatarStack people={e.participants.slice(0, 3)} size={24} />
                    </View>
                  ) : (
                    <View />
                  )}
                  <Row gap={6}>
                    <Text style={[type.footnote, { color: color.storyInk, fontWeight: '600' }]}>{people}</Text>
                    <Ionicons name="people-outline" size={15} color={color.storyInk} />
                  </Row>
                </Row>
              </View>
            </View>
          </EventScene>
        </PressableScale>
        <Pressable
          onPress={() => eventMenu(e)}
          accessibilityRole="button"
          accessibilityLabel={`Altre azioni per ${e.title}`}
          hitSlop={6}
          style={({ pressed }) => ({ position: 'absolute', top: S.md, right: S.md, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,9,0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)', opacity: pressed ? 0.6 : 1 })}>
          <Ionicons name="ellipsis-horizontal" size={18} color={color.storyInk} />
        </Pressable>
      </View>
    </Enter>
  );
}

/**
 * Tessera quadrata della riga compatta (mockup "Uscite nella Home"): l'icona del club se il club ha un'immagine,
 * altrimenti il tipo di attività (colori ufficiali pieni in sfumatura e figura bianca). Con l'immagine del club
 * il tipo resta riconoscibile da un piccolo bollino nel suo colore, nell'angolo.
 */
function ActivityTile({ sport, size = 52, clubImage }: { sport: SportId; size?: number; clubImage?: string | null }) {
  const st = eventSportStyle(sport);
  const [c1, c2] = st.blend ?? [st.solid, st.solid];
  const dot = 22;
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {clubImage ? (
        <>
          <Image source={{ uri: clubImage }} style={{ width: size, height: size, borderRadius: R.control, backgroundColor: NIGHT }} resizeMode="cover" accessibilityIgnoresInvertColors />
          <LinearGradient colors={[mix(c1, NIGHT, 0.86), mix(c2, NIGHT, 0.6)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', right: -5, bottom: -5, width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2, borderColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityGlyph style={st} size={12} color={color.storyInk} />
          </LinearGradient>
        </>
      ) : (
        <LinearGradient colors={[mix(c1, NIGHT, 0.8), mix(c2, NIGHT, 0.48)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: R.control, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' }}>
          <ActivityGlyph style={st} size={size * 0.54} color={color.storyInk} />
        </LinearGradient>
      )}
    </View>
  );
}

/**
 * Riga compatta di un'uscita (Home "I miei club" / "Uscite pubbliche", Esplora, club, profili): icona del club
 * (se ha un'immagine) o del tipo, titolo, tipo e data, luogo, km e passo; in alto a destra lo stato o "Pubblica",
 * in basso a destra quante persone sono iscritte. L'intera riga è l'unico elemento premibile.
 */
export function EventCard({ e, index = 0, clubImage, note }: { e: EventView; index?: number; clubImage?: string | null; note?: string | null }) {
  const st = eventSportStyle(e.sport);
  const ctx = eventContext(e);
  const when = whenLabel(e.startsAt, e.timezone);
  const place = e.restricted ? 'Luogo visibile agli iscritti' : [e.meetingPlace, e.area && e.area !== e.meetingPlace ? e.area : null].filter(Boolean).join(' · ');
  const signs = eventSigns(e);
  const status = joinStatusOf(e);
  const n = e.participantCount;
  const people = `${n} ${n === 1 ? 'iscritto' : 'iscritti'}`;
  const label = spoken([ctx.clubName ? `Club ${ctx.clubName}` : null, e.title, `${st.label}, ${when}`, place, note, e.distanceKm ? fmtKm(e.distanceKm) : null, e.paceSecPerKm ? `passo ${paceNum(e.paceSecPerKm)} al chilometro` : null, LEVEL_LABEL[e.level], ...signs.said, people, status?.label]);
  return (
    <Enter delay={Math.min(index, 6) * 50}>
      <PressableScale onPress={() => openEvent(e.id)} accessibilityRole="button" accessibilityLabel={label} style={{ opacity: e.status === 'cancelled' ? 0.6 : 1 }}>
        <Panel style={{ flexDirection: 'row', gap: S.md, padding: S.md, paddingRight: S.md }}>
          <View style={{ paddingTop: ctx.clubName ? 18 : 2 }}>
            <ActivityTile sport={e.sport} clubImage={clubImage} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            {ctx.clubName ? (
              <Row gap={4}>
                <Ionicons name={VISIBILITY_ICONS.club.icon} size={12} color={ctx.clubInk ?? color.textSecondary} />
                <Text style={[type.caption, { color: ctx.clubInk ?? color.textSecondary, fontWeight: '700', flexShrink: 1 }]} numberOfLines={1}>
                  {ctx.clubName}
                </Text>
              </Row>
            ) : null}
            <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }} gap={S.sm}>
              <Text style={[t.title, { flex: 1, fontWeight: '700' }]} numberOfLines={2}>
                {e.title}
              </Text>
              {/* "Pubblica" come nel mockup: pillola verde con la sola parola (la parola basta, il colore la accompagna). */}
              {status ? <Chip label={status.label} tone={status.tone} iconName={status.icon} /> : e.visibility === 'public' ? <Chip label="Pubblica" tone="success" /> : null}
            </Row>
            <Text style={t.muted} numberOfLines={1}>
              <Text style={{ color: st.solid, fontWeight: '600' }}>{st.label}</Text> · {when}
            </Text>
            {place || note ? (
              <Text style={t.muted} numberOfLines={1}>
                {[place, note].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Row style={{ justifyContent: 'space-between', marginTop: S.xs }}>
              <Row gap={S.md} style={{ flexShrink: 1 }}>
                {e.distanceKm ? (
                  <Row gap={4}>
                    <Ionicons name="footsteps-outline" size={14} color={color.textSecondary} />
                    <Text style={[type.footnote, { color: color.text, fontWeight: '600' }]}>{fmtKm(e.distanceKm)}</Text>
                  </Row>
                ) : null}
                {e.paceSecPerKm ? (
                  <Row gap={4}>
                    <Ionicons name="timer-outline" size={14} color={color.textSecondary} />
                    <Text style={[type.footnote, { color: color.text, fontWeight: '600' }]}>Passo {paceNum(e.paceSecPerKm)}/km</Text>
                  </Row>
                ) : null}
              </Row>
              <Row gap={4}>
                <Ionicons name="people-outline" size={14} color={color.textSecondary} />
                <Text style={[type.footnote, { color: color.textSecondary, fontWeight: '600' }]}>{n}</Text>
              </Row>
            </Row>
          </View>
        </Panel>
      </PressableScale>
    </Enter>
  );
}

/* ---------- club ---------- */

/** Club: identità (iniziale su colore stabile). */
export function ClubMark({ name, size = 44 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: `hsl(${h} 40% 30%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.text, fontWeight: '800', fontSize: size * 0.42 }} allowFontScaling={false}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function ClubCard({ c }: { c: ClubView }) {
  const next = c.upcomingEvents[0];
  return (
    <PressableScale onPress={() => router.push({ pathname: '/club/[id]', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.memberCount} ${c.memberCount === 1 ? 'membro' : 'membri'}`} style={{ flexDirection: 'row', gap: S.md, paddingVertical: S.md, alignItems: 'center' }}>
      {c.imageDataUrl ? <Image source={{ uri: c.imageDataUrl }} style={{ width: 44, height: 44, borderRadius: 13 }} accessibilityIgnoresInvertColors /> : <ClubMark name={c.name} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={t.title} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={t.muted}>{[SPORT_LABEL[c.sport], c.area, `${c.memberCount} ${c.memberCount === 1 ? 'membro' : 'membri'}`].filter(Boolean).join(' · ')}</Text>
        {next ? (
          <Text style={[t.small, { color: color.accent }]} numberOfLines={1}>
            Prossima: {whenLabel(next.startsAt, next.timezone)}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
    </PressableScale>
  );
}

/**
 * Card club completa (mockup "Card club completa"): immagine del club (o scena con la figura del suo sport), segno del club
 * in un anello nel suo colore, nome e località sull'immagine; sotto descrizione, membri e "Club attivo" (solo se ha uscite
 * in programma: è un fatto, non un giudizio). Con `onSelect` aggiunge "Seleziona" (dove si sceglie un club);
 * `selected` mostra la scelta fatta con bordo e segno di spunta.
 */
export function ClubHeroCard({ c, onSelect, selected, headingLevel = !onSelect }: { c: ClubView; onSelect?: () => void; selected?: boolean; headingLevel?: boolean }) {
  const ring = clubTint(c.name);
  const upcoming = c.upcomingEvents.length;
  const members = `${c.memberCount} ${c.memberCount === 1 ? 'membro' : 'membri'}`;
  const sport = eventSportStyle(c.sport);
  return (
    <Panel style={{ padding: S.md, gap: S.md, borderColor: selected ? color.accent : 'rgba(255,255,255,0.05)' }}>
      <EventScene sport={c.sport} image={c.imageDataUrl} style={{ borderRadius: R.card - 2, minHeight: 176 }}>
        <View style={{ flex: 1, minHeight: 176, padding: S.md, justifyContent: 'space-between', gap: S.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: ring, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,9,0.6)' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <ClubMark name={c.name} size={52} />
            </View>
            {selected ? <GlassChip text="Selezionato" icon="checkmark-circle" tint={color.accent} /> : null}
          </Row>
          <View style={{ gap: 2 }} accessible accessibilityLabel={[c.name, c.area, `${sport.label}`].filter(Boolean).join(', ')} accessibilityRole={headingLevel ? 'header' : undefined}>
            <Text style={[type.title1, { color: color.storyInk, fontWeight: '800' }]} numberOfLines={2}>
              {c.name}
            </Text>
            {c.area ? (
              <Row gap={4}>
                <Ionicons name="location-outline" size={14} color={color.storyInkSecondary} />
                <Text style={[type.subhead, { color: color.storyInkSecondary, flexShrink: 1 }]} numberOfLines={1}>
                  {c.area}
                </Text>
              </Row>
            ) : null}
          </View>
        </View>
      </EventScene>
      {c.description ? (
        <Text style={[type.subhead, { color: color.text, paddingHorizontal: S.xs }]} numberOfLines={onSelect ? 2 : undefined}>
          {c.description}
        </Text>
      ) : null}
      <Row gap={S.xl} style={{ flexWrap: 'wrap', paddingHorizontal: S.xs }}>
        <Row gap={6} accessible accessibilityLabel={members}>
          <Ionicons name="people-outline" size={17} color={color.textSecondary} />
          <Text style={t.muted}>{members}</Text>
        </Row>
        {upcoming ? (
          <Row gap={6} accessible accessibilityLabel={`Club attivo: ${upcoming} ${upcoming === 1 ? 'uscita' : 'uscite'} in programma`}>
            <Ionicons name="calendar-clear-outline" size={17} color={color.textSecondary} />
            <Text style={t.muted}>Club attivo</Text>
          </Row>
        ) : null}
      </Row>
      {onSelect ? <GradientButton title={selected ? 'Selezionato' : 'Seleziona'} onPress={onSelect} accessibilityHint={`Sceglie il club ${c.name}`} /> : null}
    </Panel>
  );
}

/* ---------- persone (partecipanti, membri) ---------- */

/**
 * Riga di una persona come nel mockup "Partecipanti": avatar, nome ("Tu" per chi guarda), stato colorato sotto
 * (il colore accompagna sempre la parola, mai da solo) e freccia verso il profilo.
 * `flush` toglie il margine laterale (dentro un foglio che ha già il suo).
 */
export function PersonRow({ p, status, tint = color.textSecondary, isMe, onPress, flush }: { p: UserPublic; status?: string | null; tint?: string; isMe?: boolean; onPress?: () => void; flush?: boolean }) {
  const name = isMe ? 'Tu' : p.displayName;
  const label = [isMe ? `Tu, ${p.displayName}` : p.displayName, status].filter(Boolean).join(', ');
  const body = (
    <>
      <Avatar name={p.displayName} hue={p.hue} uri={p.avatar} size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
          {name}
        </Text>
        {status ? (
          <Text style={[type.footnote, { color: tint, fontWeight: '600' }]} numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={color.textTertiary} /> : null}
    </>
  );
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.sm, paddingHorizontal: flush ? 0 : S.lg };
  if (!onPress)
    return (
      <View style={row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Apre il profilo" style={({ pressed }) => [row, pressed && { backgroundColor: color.surfacePressed }]}>
      {body}
    </Pressable>
  );
}

/* ---------- feed e racconti ---------- */

/** Attività di una persona: chi, quando, cosa, numeri essenziali. */
export function FeedRow({ item }: { item: FeedItem & { social?: SocialCounts } }) {
  const { ref: viewportRef, onLayout: checkViewport, inView } = useInView();
  const [previewWidth, setPreviewWidth] = useState(0);
  const trace = item.kind === 'workout_shared' ? item.workout.track : undefined;
  const who = item.user;
  let title = '';
  let detail = '';
  let icon: keyof typeof Ionicons.glyphMap = 'walk-outline';
  let onPress: (() => void) | undefined;
  let typeStyle: ActivityStyle | null = null;
  if (item.kind === 'event_created') {
    title = item.event.title;
    detail = `Ha organizzato un’uscita · ${fmtDayShort(item.event.startsAt, item.event.timezone)}`;
    icon = 'megaphone-outline';
    onPress = () => openEvent(item.event.id);
  } else if (item.kind === 'event_joined') {
    title = item.event.title;
    detail = 'Si è iscritto a un’uscita';
    icon = 'people-outline';
    onPress = () => openEvent(item.event.id);
  } else if (item.kind === 'run_completed') {
    const a = item.activity;
    title = a.title || SPORT_LABEL[a.sport];
    detail = [a.distanceKm ? fmtKm(a.distanceKm) : null, a.durationMin ? `${a.durationMin} min` : null].filter(Boolean).join(' · ');
    typeStyle = styleOfSport(a.sport);
  } else {
    title = item.workout.title || KIND_LABEL[item.workout.kind];
    detail = [item.workout.distanceKm ? fmtKm(item.workout.distanceKm) : null, `${item.workout.durationMin} min`].filter(Boolean).join(' · ');
    typeStyle = styleOfKind(item.workout.kind, item.workout.title);
  }
  if (item.kind === 'event_joined') typeStyle = ACTIVITY_STYLES.event;
  const body = (
    <Row style={{ alignItems: 'flex-start', paddingVertical: S.md }}>
      <Avatar name={who.displayName} hue={who.hue} uri={who.avatar} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={t.small}>
          <Text style={{ color: color.text, fontWeight: '700' }}>{who.displayName}</Text> · {relativeFromNow(item.at)}
        </Text>
        <Text style={t.title} numberOfLines={2}>
          {title}
        </Text>
        <Row gap={6}>
          {typeStyle ? <ActivityGlyph style={typeStyle} size={15} color={typeStyle.solid} /> : <Ionicons name={icon} size={14} color={color.textSecondary} />}
          <Text style={t.muted}>{typeStyle && item.kind !== 'event_joined' ? `${typeStyle.label} · ${detail}` : detail}</Text>
        </Row>
      </View>
    </Row>
  );
  const main = onPress ? (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${who.displayName}: ${title}. ${detail}`}>
      {body}
    </PressableScale>
  ) : (
    <View accessible accessibilityLabel={`${who.displayName}: ${title}. ${detail}`}>
      {body}
    </View>
  );
  return (
    <View ref={viewportRef} onLayout={(e) => { setPreviewWidth(e.nativeEvent.layout.width); checkViewport(); }}>
      {main}
      {trace && trace.length > 1 ? <LinearGradient colors={[color.accentTint, color.bg, color.brandTint]} style={{ height: 172, borderRadius: R.card, overflow: 'hidden', marginBottom: S.md }}>
        {inView && previewWidth > 0 ? <RouteTrace track={trace} width={previewWidth} height={148} tint={[color.accent, color.brand]} dotEvery={null} /> : null}
        <Text style={[type.caption, { textAlign: 'center', color: color.textSecondary }]}>Percorso condiviso · estremità protette</Text>
      </LinearGradient> : null}
      {item.social ? <View style={{ marginLeft: 52, marginTop: -S.sm }}>
        <SocialBar itemId={item.id} initial={item.social} />
      </View> : null}
    </View>
  );
}

/**
 * Quadrato del racconto: visibile ma già minimizzato, senza testo (il contenuto è nell'etichetta per lo screen reader).
 * Anello sfumato turchese→viola se non ancora visto, neutro dopo la visione.
 */
export function StoryThumb({ log, size = 76, seen = false }: { log: WorkoutLog; size?: number; seen?: boolean }) {
  const track = log.track && log.track.length > 1 ? log.track : null;
  const what = [log.distanceKm ? fmtKm(log.distanceKm) : fmtClock(log.durationSec), dayAgo(log.startedAt)].join(', ');
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/allenamento/storie/[id]', params: { id: log.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Apri il racconto: ${log.title}, ${what}`}
      style={{ width: size, height: size }}>
      <LinearGradient colors={seen ? [color.controlBorder, color.surfaceElevated] : [color.accent, color.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: R.card, padding: 2 }}>
        <LinearGradient colors={[color.brandStrong, '#16123A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: R.card - 2, alignItems: 'center', justifyContent: 'center' }}>
          {track ? <RouteThumb points={track} size={size - 18} /> : <Ionicons name="play" size={size * 0.34} color={color.storyInk} />}
        </LinearGradient>
      </LinearGradient>
    </PressableScale>
  );
}

/** Racconti in fila: solo quadrati, nessun testo. */
export function StoryTile({ log, seen }: { log: WorkoutLog; seen?: boolean }) {
  return <StoryThumb log={log} size={76} seen={seen} />;
}
