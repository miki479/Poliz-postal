import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Appearance } from 'react-native';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { initializeReduceMotion } from '@/lib/reduceMotion';

import { Loading } from '@/components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themeMode, subscribeTheme, setThemeMode, color, type } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { useAutoStravaSync } from '@/lib/stravaSync';

void initializeReduceMotion(AccessibilityInfo);

export const unstable_settings = { initialRouteName: '(auth)/benvenuto' };



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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="attrezzatura" />
        <Stack.Screen name="allenamento/file/[id]" />
        {/* Keep every app route inside this guard: implicit routes otherwise bypass setup. */}
        <Stack.Screen name="allenamento/index" />
        <Stack.Screen name="allenamento/iniziare" />
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
  const mode=useSyncExternalStore(subscribeTheme,themeMode,themeMode);
  useEffect(()=>{if(typeof Appearance.setColorScheme==='function')Appearance.setColorScheme(mode);},[mode]);
  const [appearanceReady,setAppearanceReady]=useState(false);
  useEffect(()=>{void AsyncStorage.getItem('runngo-appearance').then(value=>{if(value==='light'||value==='dark')setThemeMode(value);}).catch(()=>{}).finally(()=>setAppearanceReady(true));},[]);
  const base=mode==='light'?DefaultTheme:DarkTheme;
  const theme={...base,colors:{...base.colors,background:color.bg,card:color.bg,border:color.separator,primary:color.accent,text:color.text}};
  const [motionReady, setMotionReady] = useState(false);
  useEffect(() => {
    let active = true;
    void initializeReduceMotion(AccessibilityInfo).then(() => { if (active) setMotionReady(true); });
    return () => { active = false; };
  }, []);
  if (!motionReady || !appearanceReady) return null;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={mode==='light'?'dark':'light'} />
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </ThemeProvider>
  );
}
