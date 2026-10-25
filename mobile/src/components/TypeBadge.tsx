import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { ActivityGlyph } from '@/components/SportIcon';
import type { ActivityStyle } from '@/constants/activityColors';
import { color } from '@/constants/theme';
import { mix } from '@/lib/storyPalette';

/**
 * Segni del TIPO di attività (non dei riconoscimenti): esagono del dettaglio, riquadro degli elenchi, tondo dei racconti.
 * La figura è sempre bianca su un fondo scurito del colore ufficiale (o sulla fusione dei due, per le attività combinate):
 * resta leggibile su tutte le superfici scure. Sono decorativi: il tipo è sempre scritto accanto.
 */

/** Esagono a punta in alto con angoli smussati (`round` = frazione del lato usata per l'arrotondamento). */
export function hexPath(size: number, round = 0.14): string {
  const c = size / 2;
  const pts = [-90, -30, 30, 90, 150, 210].map((a) => [c + c * Math.cos((a * Math.PI) / 180), c + c * Math.sin((a * Math.PI) / 180)]);
  let d = '';
  pts.forEach((p, i) => {
    const prev = pts[(i + 5) % 6];
    const next = pts[(i + 1) % 6];
    const a = [p[0] + (prev[0] - p[0]) * round, p[1] + (prev[1] - p[1]) * round];
    const b = [p[0] + (next[0] - p[0]) * round, p[1] + (next[1] - p[1]) * round];
    d += `${i ? 'L' : 'M'}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  });
  return `${d}Z`;
}

/** I due colori del fondo: il colore ufficiale scurito (bianco sopra ≥ 4.5:1), oppure la fusione per le combinate. */
export function typeColors(s: ActivityStyle): [string, string] {
  const [a, b] = s.blend ?? [s.solid, s.solid];
  return [mix(a, '#0B0F14', 0.32), mix(b, '#0B0F14', 0.55)];
}

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

export function TypeHex({ style: s, size = 56 }: { style: ActivityStyle; size?: number }) {
  const gid = `th${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [a, b] = typeColors(s);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} {...hidden}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </SvgGradient>
        </Defs>
        <Path d={hexPath(size)} fill={`url(#${gid})`} stroke={mix(s.solid, '#FFFFFF', 0.25)} strokeOpacity={0.7} strokeWidth={1.5} />
      </Svg>
      <ActivityGlyph style={s} size={Math.round(size * 0.5)} color={color.storyInk} />
    </View>
  );
}

/** Riquadro arrotondato con la figura (righe "Attività recenti"). */
export function TypeTile({ style: s, size = 44 }: { style: ActivityStyle; size?: number }) {
  return (
    <LinearGradient colors={typeColors(s)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.28, alignItems: 'center', justifyContent: 'center' }} {...hidden}>
      <ActivityGlyph style={s} size={Math.round(size * 0.58)} color={color.storyInk} />
    </LinearGradient>
  );
}

/** Tondo pieno con la figura (tipo nei racconti e nelle card su fondo colorato). */
export function TypeDot({ style: s, size = 28, light = false }: { style: ActivityStyle; size?: number; /** Fondo bianco e figura colorata (su sfondi già colorati). */ light?: boolean }) {
  if (light)
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.storyInk, alignItems: 'center', justifyContent: 'center' }} {...hidden}>
        <ActivityGlyph style={s} size={Math.round(size * 0.62)} color={mix(s.solid, '#0B0F14', 0.35)} />
      </View>
    );
  return (
    <LinearGradient colors={typeColors(s)} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }} {...hidden}>
      <ActivityGlyph style={s} size={Math.round(size * 0.62)} color={color.storyInk} />
    </LinearGradient>
  );
}
