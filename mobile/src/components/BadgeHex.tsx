import { Ionicons } from '@expo/vector-icons';
import { memo, useId, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { BADGE_KINDS, LOCKED_INK, LOCKED_TONE, type BadgeKind, type BadgeSymbol } from '@/constants/achievements';

/**
 * Badge ESAGONALE dei riconoscimenti (identità visiva centralizzata in constants/achievements.ts):
 * esagono a punta in alto con angoli arrotondati, bordo luminoso, corpo sfumato nel colore del tipo, riflesso in alto
 * e simbolo bianco al centro. Non ancora conquistato: stesso disegno in grigio, con un piccolo lucchetto.
 * `label` (facoltativa): piccola etichetta sul bordo inferiore, usata per i km dei record di distanza.
 * È solo grafica: chi lo usa fornisce il testo per i lettori di schermo.
 */

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Esagono a punta in alto, centrato in (cx, cy), raggio r, angoli arrotondati (t = frazione del lato). */
export function hexPath(cx: number, cy: number, r: number, t = 0.17): string {
  const v = Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const lerp = (p: number[], q: number[], k: number) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  let d = '';
  for (let i = 0; i < 6; i++) {
    const cur = v[i];
    const a = lerp(cur, v[(i + 5) % 6], t);
    const b = lerp(cur, v[(i + 1) % 6], t);
    d += `${i ? 'L' : 'M'}${f(a[0])} ${f(a[1])} Q${f(cur[0])} ${f(cur[1])} ${f(b[0])} ${f(b[1])} `;
  }
  return `${d}Z`;
}

/** Simboli disegnati a mano (non esistono tra le icone): montagna e bersaglio, su griglia 24×24. */
function DrawnSymbol({ symbol, ink, deep }: { symbol: BadgeSymbol; ink: string; deep: string }) {
  if (symbol === 'mountain')
    return (
      <>
        <Circle cx={18.2} cy={5.6} r={2} fill={ink} opacity={0.9} />
        <Path d="M11.2 19.5 L15.9 11.2 L21.6 19.5 Z" fill={ink} opacity={0.62} />
        <Path d="M2.4 19.5 L9.6 6.4 L16.8 19.5 Z" fill={ink} />
        <Path d="M9.6 6.4 L7.4 10.4 L8.9 9.6 L9.7 10.7 L10.6 9.6 L11.8 10.4 Z" fill={deep} opacity={0.45} />
        <Path d="M2 19.6 L22 19.6" stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      </>
    );
  return (
    <>
      <Circle cx={12} cy={12} r={8.6} stroke={ink} strokeWidth={2} fill="none" />
      <Circle cx={12} cy={12} r={4.9} stroke={ink} strokeWidth={2} fill="none" />
      <Circle cx={12} cy={12} r={1.8} fill={ink} />
    </>
  );
}

const ION: Partial<Record<BadgeSymbol, keyof typeof Ionicons.glyphMap>> = {
  footsteps: 'footsteps',
  pin: 'location',
  stopwatch: 'stopwatch',
  calendar: 'calendar',
  flame: 'flame',
  dumbbell: 'barbell',
  compass: 'compass',
  star: 'star',
};

function HexBody({ kind, size, locked, label, style }: { kind: BadgeKind; size: number; locked?: boolean; label?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const def = BADGE_KINDS[kind];
  const tone = locked ? LOCKED_TONE : def.tone;
  const ink = locked ? LOCKED_INK : '#FFFFFF';
  const id = `hx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = size / 2;
  const r = size * 0.48;
  const inner = r * 0.84;
  const sym = size * 0.4;
  // la montagna disegnata occupa meno spazio delle icone: un po' più grande per lo stesso peso visivo
  const drawn = def.symbol === 'mountain' ? sym * 1.18 : sym;
  const ion = ION[def.symbol];
  const showLabel = !!label && size >= 36 && !locked;
  const lockSize = Math.max(14, Math.round(size * 0.26));
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone.light} />
            <Stop offset="1" stopColor={tone.deep} />
          </LinearGradient>
          <LinearGradient id={`${id}b`} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={tone.solid} />
            <Stop offset="1" stopColor={tone.deep} />
          </LinearGradient>
          <RadialGradient id={`${id}h`} cx="38%" cy="22%" r="62%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={locked ? 0.08 : 0.34} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {size >= 30 ? <Path d={hexPath(c, c + size * 0.025, r)} fill="#000000" opacity={0.28} /> : null}
        <Path d={hexPath(c, c, r)} fill={`url(#${id}r)`} />
        <Path d={hexPath(c, c, inner, 0.15)} fill={`url(#${id}b)`} />
        <Path d={hexPath(c, c, inner, 0.15)} fill={`url(#${id}h)`} />
        {!ion ? (
          <G transform={`translate(${f(c - drawn / 2)} ${f(c - drawn / 2 - (showLabel ? size * 0.05 : 0))}) scale(${f(drawn / 24)})`}>
            <DrawnSymbol symbol={def.symbol} ink={ink} deep={tone.deep} />
          </G>
        ) : null}
      </Svg>
      {ion ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: showLabel ? size * 0.08 : 0, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={ion} size={sym * 0.92} color={ink} />
        </View>
      ) : null}
      {showLabel ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: size * 0.07, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: Math.max(4, size * 0.07), minHeight: size * 0.2, borderRadius: size * 0.1, justifyContent: 'center', backgroundColor: tone.deep, borderWidth: 1, borderColor: tone.light }}>
            {typeof label === 'string' ? (
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: Math.max(8, size * 0.13), lineHeight: Math.max(10, size * 0.16), fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>
                {label}
              </Text>
            ) : (
              label
            )}
          </View>
        </View>
      ) : null}
      {locked && size >= 36 ? (
        <View style={{ position: 'absolute', left: (size - lockSize) / 2, bottom: size * 0.02, width: lockSize, height: lockSize, borderRadius: lockSize / 2, backgroundColor: LOCKED_TONE.deep, borderWidth: 1, borderColor: LOCKED_TONE.light, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={lockSize * 0.58} color={LOCKED_INK} />
        </View>
      ) : null}
    </View>
  );
}

/** Badge esagonale di un tipo di riconoscimento (memo: compare in griglie ed elenchi). */
export const BadgeHex = memo(HexBody);

/** Stile del testo dell'etichetta (per chi passa un nodo animato al posto della stringa). */
export const hexLabelText = (size: number) => ({ fontSize: Math.max(8, size * 0.13), lineHeight: Math.max(10, size * 0.16), fontWeight: '800' as const, color: '#FFFFFF', fontVariant: ['tabular-nums' as const] });
