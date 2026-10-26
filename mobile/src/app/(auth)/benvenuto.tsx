import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { SetupArt } from '@/components/SetupArt';
import { Button, IconButton, Row, t, useReduceMotion, useScreenReader } from '@/components/ui';
import { color, GUTTER, HIT, S, type } from '@/constants/theme';
import { canPlayWelcome } from '@/lib/welcomePlayback';

const SLIDES = [
  { art: 0, icon: 'sparkles-outline', label: 'QUESTA È RUNNGO', title: 'La tua prossima corsa\ncomincia qui.', text: 'Un piano da seguire, strade da scoprire e persone con cui condividere il percorso.' },
  { art: 1, icon: 'calendar-outline', label: 'UN PASSO ALLA VOLTA', title: 'Un piano che\nparte da te.', text: 'Scegli obiettivo, giorni e tempo a disposizione. Segna gli allenamenti fatti, spostale o saltale quando serve.' },
  { art: 3, icon: 'navigate-outline', label: 'LE TUE STRADE', title: 'Ogni corsa\nlascia un racconto.', text: 'Registra il percorso con il GPS e ritrova distanza, ritmo e giri. Le mappe di calore crescono con le attività che i runner scelgono di condividere.' },
  { art: 4, icon: 'people-outline', label: 'LA TUA GENTE', title: 'Corri insieme.\nLo ritrovi dopo.', text: 'Trova uscite, club e sfide. Se condividete le attività, Runngo può riconoscere con chi hai corso, anche senza confermarlo a mano.' },
  { art: 2, icon: 'trophy-outline', label: 'I TUOI PROGRESSI', title: 'Le piccole uscite.\nI grandi passi.', text: 'Ritrova costanza, riconoscimenti e record basati sui dati registrati. Collega Strava per importare le tue attività.' },
] as const;

export default function Benvenuto() {
  const focused = useIsFocused();
  // Login remains above this route in the stack: unmount timers and artwork while it is covered.
  return focused ? <WelcomeCarousel /> : <View style={{ flex: 1, backgroundColor: color.bg }} />;
}
function WelcomeCarousel() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const reduce = useReduceMotion();
  const screenReader = useScreenReader();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const automatic = canPlayWelcome({ active, reducedMotion: reduce, screenReader, paused });
  const slide = SLIDES[index];
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!automatic) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), 7000);
    return () => clearTimeout(timer);
  }, [automatic, index]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [index]);
  function select(i: number) {
    setPaused(true);
    setIndex(i);
    if (screenReader) AccessibilityInfo.announceForAccessibility(`${i + 1} di ${SLIDES.length}. ${SLIDES[i].title.replace('\n', ' ')}. ${SLIDES[i].text}`);
  }
  function auth(mode: 'login' | 'register') {
    setPaused(true);
    router.push({ pathname: '/(auth)/login', params: { mode } });
  }
  return <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.md }}>
    <View style={{ paddingHorizontal: GUTTER, paddingBottom: S.md }}>
      <Image source={require('@/assets/images/wordmark.png')} style={{ width: 144, height: 144 * (207 / 893) }} resizeMode="contain" accessibilityLabel="Runngo" />
    </View>
    <ScrollView ref={scroll} onScrollBeginDrag={() => setPaused(true)} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER, paddingVertical: S.md }}>
      <ScreenEntrance changeKey={index} style={{ gap: S.xxl }}>
        {active ? <SetupArt step={slide.art} iconName={slide.icon} caption="CORRI. INSIEME." /> : <View style={{ height: 208 }} />}
        <View style={{ gap: S.md }}>
          <Text style={[type.caption, { color: slide.art === 4 ? color.brandText : color.accent, letterSpacing: 1.2 }]}>{slide.label}</Text>
          <Text style={[t.h1, { fontSize: type.display.fontSize, lineHeight: type.display.lineHeight }]} accessibilityRole="header">{slide.title}</Text>
          <Text style={t.muted}>{slide.text}</Text>
        </View>
      </ScreenEntrance>
    </ScrollView>
    <View style={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + S.lg, gap: S.sm, borderTopWidth: 1, borderTopColor: color.separator }}>
      <Row style={{ justifyContent: 'center' }} gap={0}>
        {SLIDES.map((item, i) => <Pressable key={item.label} onPress={() => select(i)} accessibilityRole="button" accessibilityState={{ selected: i === index }} accessibilityLabel={`Slide ${i + 1} di ${SLIDES.length}: ${item.label}`} style={{ width: HIT, minHeight: HIT, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: i === index ? 24 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? color.accent : color.controlBorder }} />
        </Pressable>)}
        {!reduce && !screenReader ? <IconButton name={paused ? 'play-outline' : 'pause-outline'} label={paused ? 'Riprendi le slide automatiche' : 'Ferma le slide automatiche'} onPress={() => setPaused(!paused)} /> : null}
      </Row>
      <Button title="Registrati" iconName="arrow-forward" onPress={() => auth('register')} />
      <Button title="Accedi" variant="soft" onPress={() => auth('login')} />
      <Text style={[t.small, { textAlign: 'center' }]}>Dopo la registrazione ti guidiamo nelle scelte e nel tuo primo piano.</Text>
    </View>
  </View>;
}
