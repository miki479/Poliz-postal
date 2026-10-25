import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { color } from '@/constants/theme';
import type { LatLng } from '@shared/types.ts';

/** Miniatura statica di un tracciato GPS reale (nessuna mappa: leggera da mostrare in elenco). */
export function RouteThumb({ points, size = 72, stroke = color.storyInk, style }: { points: LatLng[]; size?: number; stroke?: string; style?: StyleProp<ViewStyle> }) {
  if (points.length < 2) return null;
  const lat0 = points[0].lat;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = size * 0.12;
  const sc = (size - pad * 2) / span;
  const ox = (size - (maxX - minX) * sc) / 2;
  const oy = (size - (maxY - minY) * sc) / 2;
  const step = Math.max(1, Math.floor(points.length / 160));
  const pts: string[] = [];
  for (let i = 0; i < points.length; i += step) pts.push(`${(ox + (xs[i] - minX) * sc).toFixed(1)},${(oy + (ys[i] - minY) * sc).toFixed(1)}`);
  const last = points.length - 1;
  const end = { x: ox + (xs[last] - minX) * sc, y: oy + (ys[last] - minY) * sc };
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={end.x} cy={end.y} r={3.5} fill={color.accent} />
      </Svg>
    </View>
  );
}
