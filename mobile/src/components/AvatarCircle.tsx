import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';

import { color } from '@/constants/theme';

/** Un solo cerchio riconoscibile: cornice esterna, foto/iniziale vera ritagliata e nessun cambio di dimensioni. */
export function AvatarCircle({ name, hue, size, uri, frame = 'none', ring = color.accent }: { name: string; hue: number; size: number; uri?: string | null; frame?: 'none' | 'ring' | 'double'; ring?: string }) {
  const border = frame === 'none' ? 1.5 : frame === 'double' ? 4 : 2.5;
  const inner = Math.max(1, size - border * 2);
  return (
    <LinearGradient colors={frame === 'none' ? [color.separator, color.controlBorder] : [ring, color.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, padding: border, flexShrink: 0 }} accessible accessibilityRole="image" accessibilityLabel={uri ? `Foto di ${name}` : name}>
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: `hsl(${Number.isFinite(hue) ? hue : 180}, 42%, 30%)`, borderWidth: frame === 'double' ? 1 : 0, borderColor: color.bg }}>
        {uri ? <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} resizeMode="cover" accessibilityIgnoresInvertColors accessible={false} /> : <Text style={{ color: color.text, fontWeight: '800', fontSize: size * 0.4 }} allowFontScaling={false}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>}
      </View>
    </LinearGradient>
  );
}
