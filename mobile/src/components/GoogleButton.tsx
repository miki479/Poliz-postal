import { ActivityIndicator, Pressable, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '@/constants/theme';

/** Accesso tramite pagina HTTPS del server, compatibile con Expo Go. */
export function GoogleButton({ onPress, busy, disabled }: { onPress(): void; busy: boolean; disabled: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel="Continua con Google" accessibilityState={{ disabled, busy }}
    style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 16, borderRadius: 12, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: pressed || disabled ? 0.6 : 1 })}>
    {busy ? <ActivityIndicator color={color.text} /> : <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path fill="#4285F4" d="M43.6 20.5H24v7.6h11.3c-.5 2.6-2 4.8-4.2 6.3v5.2h6.8c4-3.6 6.3-9 6.3-15.6 0-1.2-.2-2.4-.4-3.5z" />
      <Path fill="#34A853" d="M24 44c5.7 0 10.5-1.9 14-5.1l-6.8-5.2c-1.9 1.3-4.3 2.1-7.2 2.1-5.5 0-10.1-3.7-11.8-8.6h-7v5.4C8.7 39.4 15.8 44 24 44z" />
      <Path fill="#FBBC05" d="M12.2 27.2c-.4-1.2-.6-2.5-.6-3.8s.2-2.6.6-3.8v-5.4h-7A20 20 0 0 0 3.1 23.4c0 3.2.8 6.3 2.1 9.2z" />
      <Path fill="#EA4335" d="M24 11c3.1 0 5.9 1.1 8.1 3.2l6.1-6.1C34.5 4.7 29.7 2.8 24 2.8c-8.2 0-15.3 4.6-18.8 11.4l7 5.4C13.9 14.7 18.5 11 24 11z" />
    </Svg>}
    <Text style={{ color: color.text, fontSize: 16, fontWeight: '600' }}>Continua con Google</Text>
  </Pressable>;
}
