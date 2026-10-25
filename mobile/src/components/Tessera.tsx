import { useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Rect } from 'react-native-svg';

import { color } from '@/constants/theme';

/**
 * "Tessera Runngo": silhouette originale dell'avatar, un pass sportivo.
 * Quadrato morbido leggermente verticale con un piccolo taglio diagonale in basso a destra.
 * - Sotto i 36 px il taglio e la cornice spariscono (variante a quadrato morbido): restano leggibili volto o iniziali.
 * - La cornice è disegnata FUORI dall'immagine (non la copre); il target touch resta del contenitore.
 * - L'id del clipPath è unico per istanza (useId), quindi nessun conflitto tra avatar ripetuti.
 */
export function tesseraPath(x: number, y: number, w: number, h: number, r: number, cut: number): string {
  if (cut <= 0) return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - cut} L${x + w - cut},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}

export const TESSERA_RATIO = 1.08;

export function Tessera({ name, hue, size, uri, frame = 'none', ring = color.accent }: { name: string; hue: number; size: number; uri?: string | null; frame?: 'none' | 'ring' | 'double'; ring?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const small = size < 36;
  const f = small ? 'none' : frame;
  const gap = f === 'none' ? 0 : f === 'ring' ? Math.max(3, size * 0.05) : Math.max(5, size * 0.08);
  const W = size + gap * 2;
  const H = size * TESSERA_RATIO + gap * 2;
  const r = size * 0.26;
  const cut = small ? 0 : size * 0.17;
  const inner = tesseraPath(gap, gap, size, size * TESSERA_RATIO, r, cut);
  const outer = (o: number) => tesseraPath(o, o, W - o * 2, H - o * 2, r + gap - o, cut ? cut + (gap - o) * 0.6 : 0);
  return (
    <View style={{ width: W, height: H }} accessible accessibilityRole="image" accessibilityLabel={uri ? `Foto di ${name}` : `${name}`}>
      <Svg width={W} height={H}>
        <Defs>
          <ClipPath id={`t${id}`}>
            <Path d={inner} />
          </ClipPath>
        </Defs>
        {f !== 'none' ? <Path d={outer(1)} fill="none" stroke={ring} strokeWidth={2} /> : null}
        {f === 'double' ? <Path d={outer(gap * 0.55)} fill="none" stroke={ring} strokeOpacity={0.55} strokeWidth={1} /> : null}
        {uri ? (
          <>
            <Rect x={gap} y={gap} width={size} height={size * TESSERA_RATIO} fill={color.surfaceElevated} clipPath={`url(#t${id})`} />
            <SvgImage href={{ uri }} x={gap} y={gap} width={size} height={size * TESSERA_RATIO} preserveAspectRatio="xMidYMid slice" clipPath={`url(#t${id})`} />
          </>
        ) : (
          <Path d={inner} fill={`hsl(${hue}, 42%, 32%)`} />
        )}
      </Svg>
      {!uri ? (
        <View style={{ position: 'absolute', left: gap, top: gap, width: size, height: size * TESSERA_RATIO, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text style={{ color: color.text, fontWeight: '800', fontSize: size * 0.4 }} allowFontScaling={false}>
            {(name.trim()[0] ?? '?').toUpperCase()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
