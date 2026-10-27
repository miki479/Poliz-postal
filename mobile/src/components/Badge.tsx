import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useReduceMotion, type IconName } from '@/components/ui';
import { color, M, type } from '@/constants/theme';
import { fmtDate } from '@/lib/format';
import type { BadgeCategory, BadgeView } from '@shared/types.ts';

const ICON: Record<BadgeCategory, IconName> = { community: 'people', organize: 'megaphone', distance: 'trail-sign', consistency: 'calendar', club: 'shield-half', goal: 'flag' };
const FAMILY: Record<BadgeCategory, 'brand' | 'accent'> = { community: 'brand', organize: 'brand', club: 'brand', goal: 'brand', distance: 'accent', consistency: 'accent' };

/** Rivelazioni già mostrate in questa sessione: la piccola celebrazione non si ripete a ogni visita. */
const revealed = new Set<string>();

/**
 * Emblema originale di Runngo: disco con glifo e anello esterno che è anche l'indicatore di avanzamento.
 * Ottenuto = disco pieno; da ottenere = disco neutro con arco di progresso (se calcolabile).
 */
export function BadgeEmblem({ b, size = 64 }: { b: BadgeView; size?: number }) {
  const reduce = useReduceMotion();
  const fam = FAMILY[b.category];
  const ring = fam === 'brand' ? color.brand : color.accent;
  const disk = b.earned ? (fam === 'brand' ? color.brandStrong : '#0F3E44') : color.surfaceElevated;
  const glyph = b.earned ? (fam === 'brand' ? color.storyInk : color.accent) : color.textTertiary;
  const stroke = Math.max(3, size * 0.06);
  const r = size / 2 - stroke / 2;
  const circ = 2 * Math.PI * r;
  const p = b.earned ? 1 : b.progress ?? 0;
  const o = useRef(new Animated.Value(b.earned && !reduce && !revealed.has(b.id) ? 0 : 1)).current;
  useEffect(() => {
    if (!b.earned || reduce || revealed.has(b.id)) return;
    revealed.add(b.id);
    Animated.timing(o, { toValue: 1, duration: M.reveal, useNativeDriver: true }).start();
  }, [b.earned, b.id, reduce, o]);
  return (
    <Animated.View style={{ width: size, height: size, opacity: o, transform: [{ scale: o.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.separator} strokeWidth={stroke} fill="none" />
        {p > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={ring} strokeWidth={stroke} fill="none" strokeDasharray={`${circ * p} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
        <Circle cx={size / 2} cy={size / 2} r={r - stroke * 1.6} fill={disk} />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={ICON[b.category]} size={size * 0.36} color={glyph} />
      </View>
    </Animated.View>
  );
}

export function badgeA11y(b: BadgeView): string {
  if (b.earned) return `${b.name}, ottenuto${b.earnedAt ? ` il ${fmtDate(b.earnedAt)}` : ''}. ${b.criterion}`;
  const prog = b.target && b.current !== null ? `, ${b.current} su ${b.target} ${b.unit ?? ''}` : '';
  return `${b.name}, da ottenere${prog}. ${b.criterion}`;
}

export function BadgeCaption({ b }: { b: BadgeView }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={[type.caption, { color: color.text, fontWeight: '700', textAlign: 'center' }]} numberOfLines={2}>
        {b.name}
      </Text>
      <Text style={[type.caption, { color: color.textTertiary, textAlign: 'center' }]} numberOfLines={1}>
        {b.earned ? (b.earnedAt ? fmtDate(b.earnedAt) : 'Ottenuto') : b.target && b.current !== null ? `${b.current}/${b.target} ${b.unit ?? ''}` : 'Da ottenere'}
      </Text>
    </View>
  );
}
