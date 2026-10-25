import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '@/components/ui';
import { color, type } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { useAutoStravaSync } from '@/lib/stravaSync';

export const unstable_settings = { initialRouteName: '(auth)/benvenuto' };

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.bg, border: color.separator, primary: color.accent, text: color.text } };

function Routes() {
  const { me } = useSession();
  const needsSetup = !!me?.setup && !me.setup.completedAt;
  useAutoStravaSync(!!me && !needsSetup);
  if (me === undefined) return <Loading label="Apro Runngo…" />;
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
      <Stack.Protected guard={!!me && needsSetup}>
        <Stack.Screen name="inizia" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!me && !needsSetup}>
        {/* Keep every app route inside this guard: implicit routes otherwise bypass setup. */}
        <Stack.Screen name="allenamento/index" />
        <Stack.Screen name="allenamento/log/[id]" />
        <Stack.Screen name="allenamento/piano" />
        <Stack.Screen name="allenamento/sessione/[id]" />
        <Stack.Screen name="allenamento/sessione-form" />
        <Stack.Screen name="attivita-form" />
        <Stack.Screen name="club/[id]" />
        <Stack.Screen name="club/entra" />
        <Stack.Screen name="club/form" />
        <Stack.Screen name="coach" />
        <Stack.Screen name="evento/[id]" />
        <Stack.Screen name="evento/form" />
        <Stack.Screen name="fama" />
        <Stack.Screen name="impostazioni" />
        <Stack.Screen name="integrazioni" />
        <Stack.Screen name="notifiche" />
        <Stack.Screen name="obiettivi" />
        <Stack.Screen name="percorsi/[id]" />
        <Stack.Screen name="percorsi/form" />
        <Stack.Screen name="percorsi/index" />
        <Stack.Screen name="profilo-modifica" />
        <Stack.Screen name="record" />
        <Stack.Screen name="riconoscimenti/[id]" />
        <Stack.Screen name="riconoscimenti/collezione" />
        <Stack.Screen name="riconoscimenti/index" />
        <Stack.Screen name="sfide/[id]" />
        <Stack.Screen name="sfide/entra" />
        <Stack.Screen name="sfide/form" />
        <Stack.Screen name="sfide/index" />
        <Stack.Screen name="statistiche" />
        <Stack.Screen name="traguardi" />
        <Stack.Screen name="utente/[id]" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="registra" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="allenamento/storie/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="(auth)/benvenuto" options={{ headerShown: false }} />
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
