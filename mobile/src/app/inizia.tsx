import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { SetupArt, SETUP_TINTS } from '@/components/SetupArt';
import { Banner, Button, Field, IconButton, LinkText, Row, SwitchRow, t } from '@/components/ui';
import { color, GUTTER, R, S, type } from '@/constants/theme';
import { call, ext } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { useSession } from '@/lib/session';
import type { Me } from '@shared/types.ts';

const SLIDES = [
  { label: 'BENVENUTO', title: `Le tue corse.
La tua gente.`, text: 'Un piano per te, persone con cui uscire e strade da scoprire. Partiamo dalle cose che contano per te.', action: 'Personalizziamo Runngo' },
  { label: 'IL TUO PROFILO', title: `Piacere di conoscerti.`, text: 'Scegli come farti chiamare. Se vuoi, aggiungi peso e altezza: restano privati e puoi cambiarli quando vuoi.', action: 'Salva e continua' },
  { label: 'LE TUE ATTIVITÀ', title: `Le tue corse,
già qui.`, text: 'Collega Strava per ritrovare le attività senza inserirle a mano. Sarai tu ad autorizzare il collegamento, sul sito di Strava.', action: 'Continua' },
  { label: 'LA TUA POSIZIONE', title: `Il GPS,
quando ti serve.`, text: 'Ti chiederemo la posizione quando vorrai vedere la tua zona sulla mappa o avviare una corsa all’aperto. Ora non devi autorizzare nulla.', action: 'Ho capito' },
  { label: 'CORRERE INSIEME', title: `Insieme sulla strada.
Insieme nel ricordo.`, text: 'Registrate la corsa: al termine Runngo può riconoscere che eravate insieme. Funziona quando entrambi scegliete di condividere le attività.', action: 'Continua' },
  { label: 'LE STRADE DELLA COMMUNITY', title: `Una buona strada
vale per tutti.`, text: 'Aiuta altri runner a scoprire le zone più frequentate. Solo dati aggregati di almeno 3 persone, senza nomi, orari o punti vicini a partenza e arrivo.', action: 'Crea il mio piano' },
] as const;

export default function Inizia() {
  const { me, refresh } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState(me?.setup?.step ?? 0);
  const [name, setName] = useState(me?.displayName ?? '');
  const [weight, setWeight] = useState(me?.setup?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(me?.setup?.heightCm?.toString() ?? '');
  const [group, setGroup] = useState(me?.setup?.groupMatching ?? false);
  const [heat, setHeat] = useState(me?.setup?.heatmapConsent ?? false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const slide = SLIDES[step];
  const tint = SETUP_TINTS[step];
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); AccessibilityInfo.announceForAccessibility(`Passaggio ${step + 1} di ${SLIDES.length}. ${SLIDES[step].title.replace('\n', ' ')}`); }, [step]);

  async function advance(skip = false, plan = false) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const patch: Record<string, unknown> = step === 5 ? { complete: true } : { step: step + 1 };
    if (!skip && step === 1) Object.assign(patch, { displayName: name.trim(), weightKg: weight.trim() ? Number(weight.replace(',', '.')) : null, heightCm: height.trim() ? Number(height.replace(',', '.')) : null });
    if (!skip && step === 4) patch.groupMatching = group;
    if (!skip && step === 5) patch.heatmapConsent = heat;
    try {
      await call<Me>('saveSetup', patch);
      if (step === 5) { await refresh(); if (plan) router.replace('/allenamento/piano'); }
      else { Keyboard.dismiss(); setDirection(1); setStep(step + 1); }
    } catch (e) { setError(humanError(e, 'Non salvato. Riprova: le tue scelte restano qui.')); }
    finally { setBusy(false); }
  }
  async function connect() {
    if (busy) return;
    setBusy(true); setConnecting(true); setError(''); setMessage('');
    try {
      await WebBrowser.openBrowserAsync(await ext.strava.connect());
      const status = await ext.strava.status();
      setConnected(status.connected && !status.revoked);
      setMessage(status.connected && !status.revoked ? 'Strava collegato. Le attività verranno sincronizzate dopo la configurazione.' : 'Collegamento non completato. Puoi riprovare o farlo più tardi.');
    } catch (e) { setError(humanError(e, 'Strava non disponibile al momento. Puoi continuare.')); }
    finally { setBusy(false); setConnecting(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.sm }}>
    <Row style={{ paddingHorizontal: GUTTER }}>
      <IconButton name="chevron-back" label="Passaggio precedente" disabled={step === 0 || busy} onPress={() => { Keyboard.dismiss(); setDirection(-1); setStep(step - 1); setError(''); setMessage(''); }} />
      <Text style={[t.small, { flex: 1, textAlign: 'center' }]}>IL TUO INIZIO · {step + 1} DI {SLIDES.length}</Text>
      <LinkText title="Non ora" disabled={busy} onPress={() => { if (!busy) void advance(true); }} />
    </Row>
    <Row gap={6} style={{ paddingHorizontal: GUTTER, marginTop: S.md }}>
      {SLIDES.map((_, i) => <View key={i} style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: i <= step ? tint : color.surfaceElevated }} />)}
    </Row>
    <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1, padding: GUTTER, gap: S.lg, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
      <ScreenEntrance changeKey={step} direction={direction} style={{ gap: S.lg }}>
      <SetupArt step={step} selected={step === 4 ? group : step === 5 ? heat : step === 2 ? connected : false} />
      <View style={{ gap: S.sm }}>
        <Text style={[type.caption, { color: tint, letterSpacing: 1.2 }]}>{slide.label}</Text>
        <Text style={t.h1} accessibilityRole="header">{slide.title}</Text>
        <Text style={t.muted}>{slide.text}</Text>
      </View>
      {step === 1 ? <View style={{ gap: S.md }}>
        <Field label="Nome" value={name} onChangeText={setName} maxLength={30} autoComplete="name" />
        <Row><View style={{ flex: 1 }}><Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" optional /></View><View style={{ flex: 1 }}><Field label="Altezza (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" optional /></View></Row>
        <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}><Ionicons name="lock-closed-outline" size={16} color={color.textSecondary} /><Text style={[t.small, { flex: 1 }]}>Misure facoltative. Nessuna classifica o stima di calorie basata sul peso.</Text></View>
      </View> : null}
      {step === 2 ? <View style={{ gap: S.md }}>
        <Button title={connected ? 'Strava collegato' : 'Collega Strava'} variant="soft" iconName={connected ? 'checkmark-circle-outline' : 'sync-outline'} onPress={() => void connect()} disabled={busy || connected} busy={connecting} />
        <Text style={t.small}>Puoi farlo anche più tardi. Apple Salute, GPX e TCX si importano da file nelle impostazioni.</Text>
      </View> : null}
      {step === 3 ? <View style={{ gap: S.md, padding: S.lg, borderRadius: R.card, backgroundColor: color.surface }}>
        <Row><Ionicons name="location-outline" size={22} color={tint} /><Text style={[t.body, { flex: 1 }]}>Scegli “Centra sulla mia posizione” o premi Avvia: ti spieghiamo l’uso e chiediamo il GPS.</Text></Row>
        <Text style={t.small}>Il permesso GPS non condivide il percorso con gli amici e non abilita le mappe di calore.</Text>
        <Text style={t.small}>Puoi continuare senza posizione. Sul tapis roulant il GPS non viene richiesto.</Text>
      </View> : null}
      {step === 4 ? <View style={{ padding: S.lg, backgroundColor: color.surface, borderRadius: R.card, borderWidth: 1, borderColor: group ? tint : color.separator }}><SwitchRow label="Riconosci con chi corro" hint="Imposta la condivisione delle nuove attività. Anche i tuoi amici devono condividere e consentire il riconoscimento nelle impostazioni privacy. Puoi spegnerla prima di ogni corsa." value={group} onChange={setGroup} /><Text style={t.small}>Nessuna posizione degli amici in diretta. Puoi scegliere la visibilità prima di ogni attività.</Text></View> : null}
      {step === 5 ? <View style={{ gap: S.md, padding: S.lg, backgroundColor: color.surface, borderRadius: R.card, borderWidth: 1, borderColor: heat ? tint : color.separator }}>
        <SwitchRow label="Contribuisci alle mappe di calore" hint="Facoltativo, separato dal GPS e dal gruppo. Puoi spegnerlo prima di ogni attività o revocarlo dal menu dell’attività salvata." value={heat} onChange={setHeat} />
        <Text style={t.body}>Il prossimo passo? Un piano adatto ai tuoi obiettivi, da creare insieme in poche domande.</Text>
      </View> : null}
      {message ? <Banner tone={connected ? "success" : "info"} text={message} /> : null}
      {error ? <Banner tone="error" text={error} /> : null}
      </ScreenEntrance>
    </ScrollView>
    <View style={{ paddingHorizontal: GUTTER, paddingTop: S.sm, paddingBottom: insets.bottom + S.md, gap: S.sm }}>
      <Button title={slide.action} onPress={() => void advance(false, step === 5)} busy={busy && !connecting} disabled={busy} />
      {step === 5 ? <Button title="Esplora l’app, piano più tardi" variant="ghost" onPress={() => void advance()} disabled={busy} /> : null}
    </View>
  </KeyboardAvoidingView>;
}
