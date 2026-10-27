import { Tabs } from 'expo-router';

import { RecordTabBar } from '@/components/RecordTabBar';

/**
 * Barra personalizzata: quattro schede e, al centro, il tasto "Registra" sporgente con gradiente arancio.
 * "Social" resta raggiungibile come rotta ma il suo feed vive ora nella Home.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <RecordTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="esplora" options={{ title: 'Esplora' }} />
      <Tabs.Screen name="club" options={{ title: 'Gruppi' }} />
      <Tabs.Screen name="profilo" options={{ title: 'Profilo' }} />
      <Tabs.Screen name="social" options={{ href: null }} />
    </Tabs>
  );
}
