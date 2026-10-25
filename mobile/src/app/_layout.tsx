import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { color, type } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { useAutoStravaSync } from '@/lib/stravaSync';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.bg, border: color.separator, primary: color.accent, text: color.text } };

function Routes() {
  const { me } = useSession();
  useAutoStravaSync(!!me);
  if (me === undefined) return null;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.accent,
        headerTitleStyle: { color: color.text, fontSize: type.headline.fontSize, fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: color.bg },
      }}>
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="registra" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="allenamento/storie/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </ThemeProvider>
  );
}
