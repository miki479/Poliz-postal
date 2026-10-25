import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { Modal, Pressable, Share, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

import { AwardFx, AwardMark, AwardPop, CountText, fxVariantOf, Rise } from '@/components/Results';
import { Sheet, useReduceMotion } from '@/components/ui';
import { awardSentence, awardShareText, awardTitle, BADGE_KINDS, fmtPct, improvementPct, kindOf, toneOfAward, valueParts } from '@/constants/achievements';
import { color, HIT, R, S, type } from '@/constants/theme';
import { fmtDate } from '@/lib/format';
import { alpha, mix } from '@/lib/storyPalette';
import type { Award } from '@shared/records.ts';

/* ---------- testi (gli stessi del profilo e del dettaglio: constants/achievements.ts) ---------- */

/**
 * Miglioramento rispetto al record precedente ("+14,5%"), calcolato SOLO dai due valori reali del motore; altrimenti il
 * testo del motore, se c'è. null se non c'è un record precedente con cui confrontarsi.
 */
export function awardGain(a: Pick<Award, 'value' | 'previous' | 'improvement'>): string | null {
  if (!a.previous) return null;
  const p = improvementPct(a);
  return p !== null ? fmtPct(p) : a.improvement || null;
}

export function shareAward(a: Award): void {
  void Share.share({ message: awardShareText(a) });
}

/** Fondo della finestra di conquista: blu notte, come nel mockup (la luce intorno alla medaglia ha il colore del badge). */
const NIGHT_TOP = '#143B8A';
const NIGHT_MID = '#0B2460';
const NIGHT_LOW = '#081634';
/** Testo di "Vedi dettagli" sul pulsante bianco (contrasto ≥ 7:1). */
const NIGHT_INK = '#1D4FBF';

/* ---------- finestra di conquista ---------- */

function useStill(): boolean {
  const app = useReduceMotion();
  const system = useReducedMotion();
  return app || system;
}

/** Raggi e bagliore fermi dietro la medaglia (decorativi). */
function Glow({ tint, size }: { tint: string; size: number }) {
  const gid = `cq${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={tint} stopOpacity={0.16} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill={`url(#${gid})`} />
      {Array.from({ length: 16 }, (_, i) => {
        const ang = (i / 16) * Math.PI * 2;
        const r0 = size * 0.24;
        const r1 = size * (i % 2 ? 0.4 : 0.48);
        return <Line key={i} x1={c + Math.cos(ang) * r0} y1={c + Math.sin(ang) * r0} x2={c + Math.cos(ang) * r1} y2={c + Math.sin(ang) * r1} stroke={tint} strokeOpacity={i % 2 ? 0.18 : 0.3} strokeWidth={2} strokeLinecap="round" />;
      })}
    </Svg>
  );
}

/**
 * Finestra della conquista (prima volta): medaglia grande con la festa, titolo, frase, nuovo valore e record precedente
 * con il miglioramento in percentuale, "Vedi dettagli" e "Condividi". Con movimento ridotto è tutto fermo.
 */
export function ConquestModal({ award, onClose, onDetails }: { award: Award | null; onClose: () => void; onDetails: (a: Award) => void }) {
  const insets = useSafeAreaInsets();
  const still = useStill();
  const { width } = useWindowDimensions();
  const a = award;
  const tone = a ? toneOfAward(a) : BADGE_KINDS.steady.tone;
  const badge = Math.min(132, Math.round(width * 0.34));
  const glow = Math.round(badge * 2.3);
  const gain = a ? awardGain(a) : null;
  const [nv, nu] = a ? valueParts(a.value) : ['', ''];
  const [pv, pu] = a?.previous ? valueParts(a.previous) : ['', ''];
  const play = !still;
  return (
    <Modal visible={!!a} transparent animationType={still ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      {a ? (
        <View style={{ flex: 1, backgroundColor: NIGHT_LOW }} accessibilityViewIsModal>
          <LinearGradient colors={[mix(NIGHT_TOP, tone.solid, 0.06), NIGHT_MID, NIGHT_LOW]} locations={[0, 0.55, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ flex: 1, paddingTop: insets.top + S.sm, paddingBottom: insets.bottom + S.lg, paddingHorizontal: S.xl }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" hitSlop={6} style={({ pressed }) => ({ width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: color.storyGlass, opacity: pressed ? 0.6 : 1 })}>
                <Ionicons name="close" size={22} color={color.storyInk} />
              </Pressable>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', gap: S.lg }}>
              <View style={{ height: badge * 1.5, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', width: glow, height: glow, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Glow tint={tone.solid} size={glow} />
                </View>
                <View style={{ width: badge, height: badge }}>
                  <AwardFx tone={tone} variant={fxVariantOf(a)} size={badge} delay={260} play={play} seedKey={a.id} halo={false} />
                  <AwardPop play={play} delay={180}>
                    <AwardMark a={a} size={badge} countDelay={play ? 420 : undefined} />
                  </AwardPop>
                </View>
              </View>

              <Rise play={play} delay={560} dy={12}>
                <Text style={[type.display, { color: color.storyInk, textAlign: 'center' }]} accessibilityRole="header">
                  {awardTitle(a)}
                </Text>
              </Rise>
              <Rise play={play} delay={680} dy={10}>
                <Text style={[type.body, { color: color.storyInkSecondary, textAlign: 'center' }]}>{awardSentence(a)}</Text>
              </Rise>

              {a.previous ? (
                <Rise play={play} delay={800} dy={10}>
                  <View style={{ borderRadius: R.card, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: color.storyGlass, paddingVertical: S.lg, paddingHorizontal: S.md, gap: S.md }}>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={{ flex: 1, alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`Nuovo valore: ${a.value}`}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.xs }}>
                          <CountText text={nv} play={play} delay={900} duration={900} a11y={false} style={[type.title1, { color: color.storyInk, fontVariant: ['tabular-nums'] }]} />
                          {nu ? <Text style={[type.subhead, { color: color.storyInkSecondary, marginBottom: 3 }]}>{nu}</Text> : null}
                        </View>
                        <Text style={[type.footnote, { color: color.storyInkSecondary }]}>Nuovo valore</Text>
                      </View>
                      <View style={{ width: 1, backgroundColor: color.storyGlass }} />
                      <View style={{ flex: 1, alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`Precedente record: ${a.previous}`}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.xs }}>
                          <Text style={[type.title1, { color: color.storyInk, fontVariant: ['tabular-nums'] }]}>{pv}</Text>
                          {pu ? <Text style={[type.subhead, { color: color.storyInkSecondary, marginBottom: 3 }]}>{pu}</Text> : null}
                        </View>
                        <Text style={[type.footnote, { color: color.storyInkSecondary }]}>Precedente record</Text>
                      </View>
                    </View>
                    {gain ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.xs }} accessible accessibilityLabel={`Miglioramento: ${gain}`}>
                        <Ionicons name="caret-up" size={14} color={color.success} />
                        <Text style={[type.subhead, { color: color.success, fontWeight: '700' }]}>{gain}</Text>
                      </View>
                    ) : null}
                  </View>
                </Rise>
              ) : null}
            </View>

            <View style={{ gap: S.md }}>
              <Pressable onPress={() => onDetails(a)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 52, borderRadius: R.pill, backgroundColor: color.storyInk, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Text style={[type.headline, { color: NIGHT_INK }]}>Vedi dettagli</Text>
              </Pressable>
              <Pressable onPress={() => shareAward(a)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 52, borderRadius: R.pill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', gap: S.sm, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Ionicons name="share-social-outline" size={18} color={color.storyInk} />
                <Text style={[type.headline, { color: color.storyInk }]}>Condividi</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

/* ---------- dettaglio del riconoscimento ---------- */

function InfoRow({ icon, label, value, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 40 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={color.textSecondary} />
      <Text style={[type.subhead, { color: color.textSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[type.headline, { color: tint ?? color.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

const dateTime = (iso: string) => `${fmtDate(iso)} · ${new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))}`;

/**
 * Dettaglio di un riconoscimento: medaglia, titolo e frase; categoria; valore, record precedente e miglioramento;
 * data e attività di conquista; "Condividi". Solo i campi che il motore fornisce davvero.
 */
export function AwardDetailSheet({ award, onClose, activity }: { award: Award | null; onClose: () => void; activity?: string }) {
  const a = award;
  const gain = a ? awardGain(a) : null;
  const kind = a ? kindOf(a) : 'steady';
  const tone = BADGE_KINDS[kind].tone;
  const catLabel = a ? (a.record ? 'Record personale' : BADGE_KINDS[kind].label) : '';
  return (
    <Sheet
      visible={!!a}
      onClose={onClose}
      title="Dettaglio riconoscimento"
      footer={
        a ? (
          <Pressable onPress={() => shareAward(a)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 52, borderRadius: R.pill, backgroundColor: color.surfaceElevated, flexDirection: 'row', gap: S.sm, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="share-social-outline" size={18} color={color.text} />
            <Text style={[type.headline, { color: color.text }]}>Condividi</Text>
          </Pressable>
        ) : undefined
      }>
      {a ? (
        <>
          <View style={{ alignItems: 'center', gap: S.md }}>
            <AwardMark a={a} size={104} />
            <Text style={[type.title1, { color: color.text, textAlign: 'center' }]}>{awardTitle(a)}</Text>
            <Text style={[type.subhead, { color: color.textSecondary, textAlign: 'center' }]}>{awardSentence(a)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.card, backgroundColor: alpha(tone.solid, 0.12) }} accessible accessibilityLabel={`Categoria: ${catLabel}`}>
            <AwardMark a={a} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: color.textSecondary }]}>Categoria</Text>
              <Text style={[type.headline, { color: tone.light }]}>{catLabel}</Text>
            </View>
          </View>
          <View>
            <InfoRow icon="flag-outline" label="Valore raggiunto" value={a.value} />
            {a.previous ? <InfoRow icon="time-outline" label="Precedente record" value={a.previous} /> : null}
            {gain ? <InfoRow icon="trending-up" label="Miglioramento" value={gain} tint={color.success} /> : null}
          </View>
          <View>
            <InfoRow icon="calendar-outline" label="Data di conquista" value={dateTime(a.date)} />
            {activity ? <InfoRow icon="walk-outline" label="Attività" value={activity} /> : null}
          </View>
          <Text style={[type.footnote, { color: color.textTertiary }]}>{a.description}</Text>
        </>
      ) : null}
    </Sheet>
  );
}
