import { useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { color } from '@/constants/theme';

/**
 * Bagliore ambientale: macchie di colore viola e turchese che si dissolvono nel fondo, dietro la parte alta
 * della schermata. Statico (nessuna animazione continua, nessun consumo di batteria) e sempre sotto al testo,
 * che resta sul fondo scuro con il suo contrasto.
 */
export function AmbientGlow({ height = 480, variant = 'default' }: { height?: number; variant?: 'default' | 'brand' | 'accent' }) {
  const { width } = useWindowDimensions();
  const a = variant === 'accent' ? color.accent : color.brand;
  const b = variant === 'brand' ? color.brandStrong : color.accent;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="ambA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={a} stopOpacity={0.38} />
            <Stop offset="0.55" stopColor={a} stopOpacity={0.12} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={b} stopOpacity={0.24} />
            <Stop offset="0.6" stopColor={b} stopOpacity={0.07} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width * 0.1} cy={height * 0.08} rx={width * 0.75} ry={height * 0.55} fill="url(#ambA)" />
        <Ellipse cx={width * 0.95} cy={height * 0.32} rx={width * 0.6} ry={height * 0.45} fill="url(#ambB)" />
      </Svg>
    </View>
  );
}
