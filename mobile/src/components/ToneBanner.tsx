import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, PressableScale, useReduceMotion, type IconName } from '@/components/ui';
import { color, GUTTER, M, R, S, type } from '@/constants/theme';
import { mix } from '@/lib/storyPalette';

/**
 * Briefing compatti: la card consigliata (grande, con icona, titolo, sottotitolo e "Dimmi di più"), le card colorate
 * più piccole con la freccia e il pannello di approfondimento con icona, titolo, spiegazione e "Chiudi".
 * Le tinte arrivano da chi li usa (colori centralizzati in constants/activityColors): qui si scuriscono soltanto,
 * così il testo bianco resta sempre leggibile (≥ 4,5:1) su ogni tinta.
 */

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const INK = color.storyInk;
const INK2 = color.storyInkSecondary;
const GLASS = color.storyGlass;
const GLASS_LINE = 'rgba(255,255,255,0.22)';

/** Fondo di una card: `strong` per la card in evidenza (più satura), altrimenti una tinta più profonda. */
export function briefFill(tint: string, strong: boolean): [string, string] {
  return strong ? [mix(tint, '#000000', 0.42), mix(tint, color.bg, 0.8)] : [mix(tint, color.bg, 0.52), mix(tint, color.bg, 0.8)];
}

const PARTICLES = [
  { x: 0.1, y: 0.7, s: 4, d: 0 },
  { x: 0.28, y: 0.35, s: 3, d: 500 },
  { x: 0.46, y: 0.8, s: 5, d: 900 },
  { x: 0.64, y: 0.25, s: 3, d: 300 },
  { x: 0.8, y: 0.6, s: 4, d: 1200 },
  { x: 0.92, y: 0.3, s: 3, d: 700 },
];

/** Apertura/chiusura dei banner: altezze e posizioni scorrono invece di saltare; il testo nuovo entra in dissolvenza. */
export const TONE_LAYOUT = LayoutAnimation.create(M.local + 60, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

/**
 * Bagliori: pochi puntini che salgono piano e sfumano. Montati solo sulla card in evidenza e senza "Riduci movimento":
 * alla deselezione spariscono con la card (fermare i loop lasciava i puntini a metà, visibili sulla card chiusa).
 */
function Particles({ tint }: { tint: string }) {
  const vals = useRef(PARTICLES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) => Animated.loop(Animated.sequence([Animated.delay(PARTICLES[i].d), Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true })])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals]);
  return (
    <View pointerEvents="none" style={FILL}>
      {PARTICLES.map((p, i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: p.s, height: p.s, borderRadius: p.s, backgroundColor: tint, opacity: vals[i].interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.7, 0] }), transform: [{ translateY: vals[i].interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }] }} />
      ))}
    </View>
  );
}

/** Tondo "di vetro" con l'icona bianca: grande sulla card in evidenza, piccolo sulle altre. */
export function BriefBubble({ icon, size }: { icon: IconName; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_LINE, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={INK} />
    </View>
  );
}

/** Etichetta della card ("Consigliato"). */
export function BriefChip({ label }: { label: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: R.pill, paddingHorizontal: S.sm, paddingVertical: 2 }}>
      <Text style={[type.caption, { color: INK, fontWeight: '800' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * "Consigliato" sull'angolo in alto a destra della card in evidenza, a cavallo del bordo (come nel mockup).
 * Fondo chiaro della stessa tinta e testo scuro: leggibile sia sopra la card sia sopra lo sfondo della schermata.
 */
function CornerChip({ label, tint }: { label: string; tint: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -9, right: S.lg, backgroundColor: mix(tint, '#FFFFFF', 0.45), borderRadius: R.pill, borderWidth: 1, borderColor: mix(tint, '#FFFFFF', 0.75), paddingHorizontal: S.sm + 2, paddingVertical: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[type.caption, { color: color.onAccent, fontWeight: '800' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Alone della card in evidenza (iOS: ombra colorata; Android non ha ombre colorate e resta piatto). */
const glow = (tint: string) => ({ shadowColor: tint, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } });

/** Freccia in un piccolo tondo, a destra delle card. */
function ArrowDot({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name="chevron-forward" size={16} color={INK} />
    </View>
  );
}

/** Riga "Dimmi di più": pillola a sinistra e freccia a destra, un solo elemento toccabile (≥ 44 pt con l'area estesa). */
function MoreRow({ onPress, label, hint }: { onPress: () => void; label: string; hint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 }, pressed && { opacity: 0.6 }]}>
      <View style={{ height: 28, borderRadius: R.pill, paddingHorizontal: S.md, justifyContent: 'center', backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_LINE }}>
        <Text style={[type.footnote, { color: INK, fontWeight: '700' }]}>Dimmi di più</Text>
      </View>
      <ArrowDot size={30} />
    </Pressable>
  );
}

/**
 * Card di una lettura del piano, in due forme per stare in una schermata senza scorrere:
 * - selezionata: in evidenza (più grande e satura), con icona grande, titolo, cosa cambia nel piano, il testo
 *   della lettura e "Dimmi di più"; leggermente ingrandita, con particelle e un riflesso che la attraversa;
 * - non selezionata: compatta e colorata (icona, titolo, frase breve, freccia), un po' più piccola ma leggibile.
 * Il passaggio tra le due forme è animato (LayoutAnimation), salvo con "Riduci movimento".
 */
export function ToneBanner({ title, icon, tint, text, short, detail, selected, anySelected, recommended, onPress, onMore }: { title: string; icon: IconName; tint: string; text: string; short: string; detail: string; selected: boolean; anySelected: boolean; recommended?: boolean; onPress: () => void; onMore: () => void }) {
  const reduce = useReduceMotion();
  // valori iniziali uguali a quelli finali dell'effetto: al primo disegno nessuna card "si ridimensiona"
  const scale = useRef(new Animated.Value(selected ? 1.02 : anySelected ? 0.98 : 1)).current;
  const dim = useRef(new Animated.Value(selected || !anySelected ? 1 : 0.9)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const cta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = (v: Animated.Value, n: number, ms: number = M.local) => (reduce ? v.setValue(n) : Animated.timing(v, { toValue: n, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start());
    to(scale, selected ? 1.02 : anySelected ? 0.98 : 1);
    to(dim, selected || !anySelected ? 1 : 0.9);
    cta.setValue(0);
    shine.setValue(0);
    if (!selected) return;
    // con movimento ridotto "Dimmi di più" c'è subito (niente fotogramma vuoto)
    if (reduce) {
      cta.setValue(1);
      return;
    }
    // "Dimmi di più" compare dopo un breve ritardo (lo spazio è già riservato: niente salti); il riflesso passa una volta.
    const id = setTimeout(() => to(cta, 1, 260), 650);
    Animated.timing(shine, { toValue: 1, duration: 900, delay: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    return () => clearTimeout(id);
  }, [selected, anySelected, reduce, scale, dim, shine, cta]);

  const choose = () => {
    if (!selected && !reduce) LayoutAnimation.configureNext(TONE_LAYOUT);
    onPress();
  };

  return (
    <Animated.View style={[{ opacity: dim, transform: [{ scale }], borderRadius: R.card }, selected && { backgroundColor: briefFill(tint, true)[1], marginTop: recommended ? S.xs : 0, ...glow(tint) }]}>
      <Pressable
        onPress={choose}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title}${recommended ? ', consigliato' : ''}. ${selected ? `${detail}. ${text}` : short}`}
        // con lo screen reader la card è un unico elemento: "Dimmi di più" resta raggiungibile come azione
        accessibilityActions={selected ? [{ name: 'more', label: 'Dimmi di più' }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'more') onMore();
        }}
        style={{ borderRadius: R.card, overflow: 'hidden', borderWidth: selected ? 1.5 : 1, borderColor: selected ? mix(tint, '#FFFFFF', 0.2) : `${tint}59` }}>
        {/* compatta: 8 + 40 + 8 (+ bordi) ≈ 58 pt; in evidenza: 12 + 44 + 8 + testo + 8 + 30 + 12 */}
        <LinearGradient colors={briefFill(tint, selected)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={selected ? { padding: S.md, gap: S.sm } : { paddingHorizontal: S.md, paddingVertical: S.sm }}>
          {selected && !reduce ? <Particles tint={mix(tint, '#FFFFFF', 0.5)} /> : null}
          {selected ? (
            <>
              {/* icona grande a sinistra, titolo e sottotitolo a destra; "Consigliato" sta sull'angolo (fuori dal ritaglio) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <BriefBubble icon={icon} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.title2, { color: INK }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {/* bianco pieno: sulla tinta in evidenza (più chiara) il bianco attenuato scenderebbe sotto 4,5:1 */}
                  <Text style={[type.footnote, { color: INK }]} numberOfLines={2}>
                    {detail}
                  </Text>
                </View>
              </View>
              <Text style={[type.subhead, { color: INK }]}>{text}</Text>
              <Animated.View style={{ opacity: cta }}>
                <MoreRow onPress={onMore} label={`Dimmi di più su: ${title}`} hint="Il Coach AI spiega perché questa lettura ti somiglia" />
              </Animated.View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <BriefBubble icon={icon} size={32} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs + 2 }}>
                  <Text style={[type.headline, { color: INK, flexShrink: 1 }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {recommended ? <BriefChip label="Consigliato" /> : null}
                </View>
                <Text style={[type.footnote, { color: INK2 }]} numberOfLines={2}>
                  {short}
                </Text>
              </View>
              <ArrowDot />
            </View>
          )}
          {/* riflesso */}
          {selected && !reduce ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -20, bottom: -20, width: 70, opacity: shine.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.55, 0.55, 0] }), transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-100, 420] }) }, { rotate: '18deg' }] }}>
              {/* bianco trasparente, non 'transparent' (nero trasparente): i bordi del riflesso non si incupiscono */}
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
            </Animated.View>
          ) : null}
        </LinearGradient>
      </Pressable>
      {selected && recommended ? <CornerChip label="Consigliato" tint={tint} /> : null}
    </Animated.View>
  );
}

/**
 * Briefing in evidenza fuori dalla scelta delle letture (es. il consiglio del giorno nel piano): stessa forma della
 * card selezionata, senza selezione. `onMore` mostra "Dimmi di più" (pannello di approfondimento).
 */
export function BriefHero({ icon, tint, badge, title, text, onMore, alert }: { icon: IconName; tint: string; badge?: string; title: string; text: string; onMore?: () => void; alert?: boolean }) {
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return enter.setValue(1);
    Animated.timing(enter, { toValue: 1, duration: M.reveal / 2, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, enter]);
  return (
    // entra salendo appena; il badge sta sull'angolo, a cavallo del bordo
    <Animated.View style={{ marginTop: badge ? S.xs : 0, borderRadius: R.card, backgroundColor: briefFill(tint, true)[1], opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }], ...glow(tint) }} accessibilityRole={alert ? 'alert' : undefined}>
      <View style={{ borderRadius: R.card, overflow: 'hidden', borderWidth: 1.5, borderColor: mix(tint, '#FFFFFF', 0.2) }}>
        <LinearGradient colors={briefFill(tint, true)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: S.lg, gap: S.md }}>
          {!reduce ? <Particles tint={mix(tint, '#FFFFFF', 0.5)} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <BriefBubble icon={icon} size={56} />
            <View style={{ flex: 1, gap: S.xs }}>
              <Text style={[type.title2, { color: INK }]} accessibilityRole="header" accessibilityLabel={badge ? `${title}, ${badge}` : title}>
                {title}
              </Text>
              <Text style={[type.subhead, { color: INK }]}>{text}</Text>
            </View>
          </View>
          {onMore ? <MoreRow onPress={onMore} label={`Dimmi di più: ${title}`} /> : null}
        </LinearGradient>
      </View>
      {badge ? <CornerChip label={badge} tint={tint} /> : null}
    </Animated.View>
  );
}

/**
 * Card colorata più piccola, con la freccia: una scelta o un'azione del briefing. Con `badge` segue il mockup
 * (icona ed etichetta in alto, poi titolo e sottotitolo); senza, sta su una riga. `order` scagliona l'ingresso.
 */
export function BriefRow({ icon, tint, title, subtitle, badge, onPress, accessibilityHint, order = 0 }: { icon: IconName; tint: string; title: string; subtitle?: string; badge?: string; onPress: () => void; accessibilityHint?: string; order?: number }) {
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return enter.setValue(1);
    Animated.timing(enter, { toValue: 1, duration: M.local + 80, delay: 80 + order * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, enter, order]);
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={[badge, title, subtitle].filter(Boolean).join('. ')} accessibilityHint={accessibilityHint}>
        <LinearGradient colors={briefFill(tint, false)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: R.card, borderWidth: 1, borderColor: `${tint}59`, minHeight: 58, paddingHorizontal: S.md, paddingVertical: badge ? S.md : S.sm, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          {badge ? null : <BriefBubble icon={icon} size={32} />}
          <View style={{ flex: 1, gap: badge ? S.xs : 0 }}>
            {badge ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                <BriefBubble icon={icon} size={32} />
                <BriefChip label={badge} />
              </View>
            ) : null}
            <Text style={[type.headline, { color: INK }]}>{title}</Text>
            {subtitle ? <Text style={[type.footnote, { color: INK2 }]}>{subtitle}</Text> : null}
          </View>
          <ArrowDot />
        </LinearGradient>
      </PressableScale>
    </Animated.View>
  );
}

/**
 * Pannello "Dimmi di più": a tutto schermo, con icona grande, etichetta facoltativa, titolo, sottotitolo, la spiegazione
 * (children) e "Chiudi". Entra salendo appena e in dissolvenza; con "Riduci movimento" compare e basta.
 */
export function BriefPanel({ visible, onClose, icon, tint, badge, title, subtitle, children }: { visible: boolean; onClose: () => void; icon: IconName; tint: string; badge?: string; title: string; subtitle?: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) {
      enter.setValue(1);
      breath.setValue(0);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: M.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // alone che "respira" piano attorno all'icona, solo mentre il pannello è aperto
    const loop = Animated.loop(Animated.sequence([Animated.timing(breath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(breath, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [visible, reduce, enter, breath]);
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <Animated.View accessibilityViewIsModal style={{ flex: 1, backgroundColor: color.bg, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
        <LinearGradient colors={[mix(tint, color.bg, 0.5), mix(tint, color.bg, 0.86), color.bg]} locations={[0, 0.5, 1]} style={FILL} pointerEvents="none" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: insets.top + S.xs, paddingHorizontal: S.sm }}>
          <IconButton name="arrow-back" label="Torna indietro" color={INK} onPress={onClose} />
          <IconButton name="close" label="Chiudi" color={INK} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: GUTTER + S.sm, paddingTop: S.lg, paddingBottom: S.xl, gap: S.md }}>
          {/* alone attorno all'icona: profondità senza immagini */}
          <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: `${tint}26`, opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] }} />
            <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(tint, '#000000', 0.35), borderWidth: 1, borderColor: GLASS_LINE }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Ionicons name={icon} size={38} color={INK} />
            </View>
          </View>
          {badge ? <BriefChip label={badge} /> : null}
          <Text style={[type.title1, { color: INK, textAlign: 'center' }]} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={[type.subhead, { color: INK2, textAlign: 'center' }]}>{subtitle}</Text> : null}
          <View style={{ alignSelf: 'stretch', gap: S.md, marginTop: S.sm }}>{children}</View>
        </ScrollView>
        <View style={{ paddingHorizontal: GUTTER, paddingTop: S.sm, paddingBottom: insets.bottom + S.md }}>
          <Button title="Chiudi" onPress={onClose} />
        </View>
      </Animated.View>
    </Modal>
  );
}
