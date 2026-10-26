import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OutingProposals } from '@/components/event/OutingProposals';
import { contextualLocationPermission } from '@/lib/locationPermissionPolicy';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, Text, View, type ScrollViewInstance } from 'react-native';

import { ClubChoice } from '@/components/event/ClubChoice';
import { EventFrame } from '@/components/event/EventFrame';
import { EventPreview } from '@/components/event/EventPreview';
import { FeatureList, type Feature } from '@/components/event/FeatureRows';
import { GradientButton } from '@/components/event/GradientButton';
import { OptionChip } from '@/components/event/OptionChip';
import { PactTiles } from '@/components/event/PactPicker';
import { Reveal } from '@/components/event/Reveal';
import { SectionTitle } from '@/components/event/SectionTitle';
import { TypeCards } from '@/components/event/TypePicker';
import { DistanceDial, LevelBar, PaceDial } from '@/components/EventDials';
import { PlacePicker, shortPlace } from '@/components/PlacePicker';
import { Banner, Button, DateField, Empty, Field, Loading, Row, Sheet, useReduceMotion } from '@/components/ui';
import { loadEventForEdit } from '@/lib/eventEdit';
import { ChoiceRow } from '@/components/Wizard';
import { clubTint, eventSportStyle, FEATURE_ICONS, PACT_ICON, PACT_ICONS, PACT_MODES, PACT_TINT, pactBlocker, pactModes, VISIBILITY_ICONS, type PactMode } from '@/constants/eventStyle';
import { color, S, type } from '@/constants/theme';
import { ApiError, call, type GeoPlace } from '@/lib/api';
import { checkDate, humanError } from '@/lib/errors';
import { deviceTimezone, formatPace, SPORT_LABEL, whenLabel } from '@/lib/format';
import { estimateLevel, eventSportOf, fromServerLevel, hasPaceScale, levelLabel, paceInScale, toServerLevel, type EventSport, type UiLevel } from '@shared/eventLevel.ts';
import type { ClubView, EventInput, EventView, RunPact, SportId, Visibility } from '@shared/types.ts';

/** I quattro passi del mockup: cosa e quando, i dettagli dell'uscita, il patto con il gruppo, il riepilogo. */
const STEPS = ['Attività', 'Dettagli', 'Patto', 'Riepilogo'] as const;
const LAST = STEPS.length - 1;

const SPOTS = [8, 15, 25];

/** Spiegazione breve dei tipi che ne hanno bisogno (corsa e camminata si capiscono da sé). */
const TYPE_NOTE: Partial<Record<SportId, string>> = {
  trail: 'Su sentieri: salite e discese cambiano il passo, che resta indicativo.',
  run_walk: 'Tratti di corsa e di camminata alternati: adatta a chi inizia.',
  other: 'Un’attività diversa: descrivila nelle note. Il ritmo non si indica.',
};

const NO_PACT: Record<PactMode, boolean> = { noDrop: false, inclusivePace: false, regroupPoints: false, takeTurns: false, pairs: false, selfPace: false };

type PacedSport = Exclude<EventSport, 'other'>;
type Errors = { title?: string; when?: string; place?: string; who?: string; max?: string; general?: string };

function suggestTitle(sport: SportId, when: Date): string {
  const day = when.toLocaleDateString('it-IT', { weekday: 'long' });
  const h = when.getHours();
  const part = h < 11 ? 'mattina' : h < 15 ? 'pranzo' : h < 19 ? 'pomeriggio' : 'sera';
  // "Altro del sabato" non suona: per un'attività diversa si parla di uscita.
  return `${sport === 'other' ? 'Uscita' : SPORT_LABEL[sport]} del ${day} ${part}`;
}

const kmLabel = (km: number) => `${String(Math.round(km * 100) / 100).replace('.', ',')} km`;

/**
 * Crea (o modifica) un'uscita in 4 passi, come nei mockup:
 *  1. Attività: tipo (tessere a tutto colore), quando e dove (luogo verificato), per chi (pubblica, un club, su invito);
 *  2. Dettagli: distanza, ritmo con la figura animata e livello (stimato finché non lo scegli tu);
 *  3. Patto: patto di corsa a tessere (facoltativo), posti e note;
 *  4. Riepilogo: nome, anteprima e caratteristiche, poi la pubblicazione.
 * Avanzamento a passi in alto, un solo pulsante principale largo in basso. Niente campo obbligatorio superfluo.
 */
export default function EventoForm() {
  const { id, clubId: clubParam } = useLocalSearchParams<{ id?: string; clubId?: string }>();
  const reduce = useReduceMotion();
  const [proposalsOpen, setProposalsOpen] = useState(!id);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [usual, setUsual] = useState<GeoPlace | null>(null);
  const [ready, setReady] = useState(!id);
  const [i, setI] = useState(0);
  const iRef = useRef(0);
  const [dir, setDir] = useState(1);
  const slide = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const whenY = useRef(0);
  const whoY = useRef(0);
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [sport, setSport] = useState<SportId>('running');
  // Ultimo tipo con una nota e ultimo con un ritmo: nota e card del ritmo restano disegnate mentre i loro pannelli si chiudono.
  const [noteSport, setNoteSport] = useState<SportId>('running');
  const [pacedSport, setPacedSport] = useState<PacedSport>('running');
  const [loadErr, setLoadErr] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  // null = stima automatica; un valore = scelta dell'utente (o livello già salvato), che la stima non sovrascrive.
  const [manualLevel, setManualLevel] = useState<UiLevel | null>(null);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return d;
  });
  const [placeV, setPlaceV] = useState<GeoPlace | null>(null);
  const [placeText, setPlaceText] = useState(''); // solo se il servizio geografico non è attivo (o uscita già esistente senza coordinate)
  const [geoOff, setGeoOff] = useState(false);
  const [meet, setMeet] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(clubParam ? 'club' : 'public');
  const [clubId, setClubId] = useState<string | null>(clubParam ?? null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [tz, setTz] = useState(deviceTimezone());
  const [km, setKm] = useState<number | null>(null);
  const [paceSec, setPaceSec] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [maxCustom, setMaxCustom] = useState(false);
  const [maxText, setMaxText] = useState('');
  const [notes, setNotes] = useState('');
  // Modalità del patto accese; per i punti di ricompattamento serve anche il testo (senza testo non si salvano).
  const [pactOn, setPactOn] = useState<Record<PactMode, boolean>>(NO_PACT);
  const [regroup, setRegroup] = useState('');
  const [routeId, setRouteId] = useState<string | null>(null);
  const [clubs, setClubs] = useState<ClubView[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Errors>({});

  useEffect(() => {
    call<ClubView[]>('listMyClubs').then(setClubs, () => {});
    if (!id) { void AsyncStorage.getItem('runngo:usual-meeting-place').then((value) => { if (!value) return; try { const p = JSON.parse(value); if (typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) setUsual(p); } catch { /* ignora preferenza danneggiata */ } }); return; }
    setLoadErr('');
    setReady(false);
    return loadEventForEdit(() => call<EventView>('getEvent', id, null),
      (e) => {
        setVersion(e.version);
        setTitle(e.title);
        setTitleEdited(true);
        applySport(e.sport);
        setWhen(new Date(e.startsAt));
        setTz(e.timezone);
        if (e.lat !== null && e.lng !== null) setPlaceV({ name: e.area || e.meetingPlace, lat: e.lat, lng: e.lng });
        else setPlaceText(e.area || e.meetingPlace);
        setMeet(e.lat !== null ? e.meetingPlace : '');
        setKm(e.distanceKm);
        setPaceSec(e.paceSecPerKm);
        // Il livello salvato vale come scelta manuale; la stima serve solo a recuperarne la sfumatura (stessa fascia del server).
        setManualLevel(fromServerLevel(e.level, estimateLevel({ sport: eventSportOf(e.sport), km: e.distanceKm, paceSec: e.paceSecPerKm }).level));
        setNotes(e.notes);
        setMax(e.maxParticipants);
        setVisibility(e.visibility);
        setClubId(e.clubId);
        setRouteId(e.routeId);
        // Un patto salvato prima delle nuove modalità non le ha: valgono "no".
        const saved = pactModes(e.pact);
        setPactOn({ ...NO_PACT, ...Object.fromEntries(saved.map((m) => [m, true])) });
        setRegroup(e.pact?.regroupPoints ?? '');
        setReady(true);
      },
      // Senza l'uscita da modificare il modulo non si apre (salvare partirebbe da dati vuoti): si spiega il motivo.
      setLoadErr,
    );
  }, [id, loadAttempt]);

  // Titolo suggerito finché l'utente non lo scrive da sé.
  useEffect(() => {
    if (!titleEdited && !id) setTitle(suggestTitle(sport, when));
  }, [sport, when, titleEdited, id]);

  // Transizione tra i passi: il nuovo passo entra scorrendo dal lato giusto (avanti da destra, indietro da sinistra).
  const go = useCallback(
    (n: number) => {
      const to = Math.max(0, Math.min(LAST, n));
      setDir(to >= iRef.current ? 1 : -1);
      iRef.current = to;
      setI(to);
      setErr({});
      if (reduce) return;
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    [reduce, slide],
  );

  // Indietro di sistema (Android): torna al passo precedente invece di chiudere tutto.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (iRef.current === 0) return false;
      go(iRef.current - 1);
      return true;
    });
    return () => sub.remove();
  }, [go]);

  const placeName = placeV ? shortPlace(placeV.name) : placeText.trim();
  const club = clubs.find((c) => c.id === clubId) ?? null;
  const dialSport = eventSportOf(sport);
  const withPace = hasPaceScale(dialSport);
  const estimate = estimateLevel({ sport: dialSport, km, paceSec: withPace ? paceSec : null });
  const uiLevel: UiLevel = manualLevel ?? estimate.level;
  const maxVal = maxCustom ? (maxText.trim() ? Number(maxText) : null) : max;
  const needsText = !placeV && (geoOff || !!placeText);
  const activePact = PACT_MODES.filter((m) => pactOn[m]);
  const regroupText = pactOn.regroupPoints ? regroup.trim() : '';
  /** Modalità che finiscono davvero nel patto (i punti di ricompattamento solo con il testo). */
  const declaredPact = activePact.filter((m) => m !== 'regroupPoints' || regroupText);

  function applySport(s: SportId) {
    setSport(s);
    if (TYPE_NOTE[s]) setNoteSport(s);
    const es = eventSportOf(s);
    if (es !== 'other') setPacedSport(es);
  }

  // Cambiare tipo non cancella i dati ancora sensati (in modifica un tocco sbagliato non deve perdere quelli salvati):
  // la distanza vale per tutti; il ritmo resta solo se sta nella scala del nuovo tipo (6:00 al km non è una camminata)
  // e "Altro" non ha ritmo.
  function pickSport(s: SportId) {
    if (s === sport) return;
    applySport(s);
    const next = eventSportOf(s);
    if (!hasPaceScale(next) || !paceInScale(next, paceSec)) setPaceSec(null);
  }

  /** Esce dal modulo senza salvare; aperto da un collegamento diretto (niente schermata dietro) torna alla Home. */
  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function togglePact(m: PactMode) {
    if (!pactOn[m] && pactBlocker(m, activePact)) return;
    setPactOn((p) => ({ ...p, [m]: !p[m] }));
  }

  /** Porta in vista la sezione con l'errore (le posizioni sono relative al contenuto del passo). */
  function showSection(y: number) {
    scrollRef.current?.scrollTo({ y: Math.max(0, S.lg + y - S.sm), animated: !reduce });
  }

  function next() {
    if (i === 0) {
      const d = checkDate(when, { future: !id });
      if (d) {
        setErr({ when: d });
        return showSection(whenY.current);
      }
      if (!placeV && !placeText.trim()) {
        setErr({ place: 'Scegli la città o la località dalla ricerca.' });
        return showSection(whenY.current);
      }
      if (visibility === 'club' && !clubId) {
        setErr({ who: 'Scegli per quale club è l’uscita, oppure rendila pubblica.' });
        setWhoOpen(true);
        return showSection(whoY.current);
      }
    }
    // Passo "Dettagli": i selettori producono solo valori validi (agganciati e nei limiti del server), nulla da controllare.
    // Numero intero (un testo incollato può contenere virgole o lettere: Number li rende decimali o NaN).
    if (i === 2 && maxCustom && maxText.trim() && !(maxVal && Number.isInteger(maxVal) && maxVal >= 2 && maxVal <= 500)) return setErr({ max: 'I posti devono essere un numero intero tra 2 e 500.' });
    setErr({});
    if (i === LAST) return void save();
    go(i + 1);
  }

  async function locateMeetingPlace() {
    setGpsBusy(true);
    try {
      const permission = await contextualLocationPermission('map', Location);
      if (permission.status !== 'granted') { setErr({ place: 'La posizione non è consentita. Puoi scegliere il ritrovo manualmente.' }); return; }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const addresses = await Location.reverseGeocodeAsync({ latitude: fix.coords.latitude, longitude: fix.coords.longitude }).catch(() => []);
      const a = addresses[0];
      const name = a ? [a.street, a.streetNumber, a.city].filter(Boolean).join(' ') : 'Punto scelto con GPS';
      setPlaceV({ name, lat: fix.coords.latitude, lng: fix.coords.longitude });
      setGpsAccuracy(fix.coords.accuracy); setErr({});
    } catch { setErr({ place: 'Non riesco a rilevare la posizione. Riprova all’aperto o scegli il ritrovo manualmente.' }); }
    finally { setGpsBusy(false); }
  }

  async function save() {
    if (!placeV && !placeText.trim()) { go(0); return setErr({ place: 'Conferma il punto di ritrovo prima di pubblicare.' }); }
    if (visibility === 'club' && !clubId) { go(0); setWhoOpen(true); return; }
    if (title.trim().length < 3) return setErr({ title: 'Dai un nome all’uscita: almeno 3 lettere.' });
    const dErr = checkDate(when, { future: !id });
    if (dErr) {
      go(0);
      return setErr({ when: dErr });
    }
    const pact: RunPact | null = declaredPact.length
      ? { noDrop: pactOn.noDrop, inclusivePace: pactOn.inclusivePace, regroupPoints: regroupText, takeTurns: pactOn.takeTurns, pairs: pactOn.pairs, selfPace: pactOn.selfPace }
      : null;
    const input: EventInput = {
      title: title.trim(),
      sport,
      startsAt: when.toISOString(),
      timezone: tz,
      meetingPlace: meet.trim() || placeName,
      area: placeV ? shortPlace(placeV.name) : placeText.trim(),
      lat: placeV ? Math.round(placeV.lat * 1e5) / 1e5 : null,
      lng: placeV ? Math.round(placeV.lng * 1e5) / 1e5 : null,
      distanceKm: km && km > 0 ? km : null,
      paceSecPerKm: withPace ? paceSec : null,
      level: toServerLevel(uiLevel),
      notes: notes.trim(),
      maxParticipants: maxVal && maxVal >= 2 ? maxVal : null,
      visibility,
      clubId: visibility === 'club' ? clubId : null,
      routeId,
      pact,
    };
    setBusy(true);
    setErr({});
    try {
      const e = id ? await call<EventView>('updateEvent', id, input, version) : await call<EventView>('createEvent', input);
      router.dismissTo({ pathname: '/evento/[id]', params: { id: e.id } });
    } catch (e) {
      // Il server spiega il campo che non va (già in italiano): meglio del generico "controlla i campi".
      const field = e instanceof ApiError && e.fields ? Object.values(e.fields)[0] : undefined;
      setErr({ general: field ?? humanError(e, 'Non sono riuscito a salvare l’uscita. Riprova.') });
    } finally {
      setBusy(false);
    }
  }

  if (loadErr)
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: 'Modifica l’uscita' }} />
        <View style={{ flex: 1, backgroundColor: color.bg, padding: S.xl }}>
          <Empty title="Uscita non disponibile" text={loadErr} iconName="cloud-offline-outline" />
          <Button title="Riprova" onPress={() => setLoadAttempt((n) => n + 1)} />
          <Button title="Torna indietro" variant="soft" onPress={close} />
        </View>
      </>
    );
  if (!ready) return <Loading />;
  const sportStyle = eventSportStyle(sport);
  const whenText = whenLabel(when.toISOString(), tz);
  const placeLine = [meet.trim(), placeName].filter(Boolean).join(' · ') + (needsText ? ' (non verificato)' : '');

  /** Caratteristiche del riepilogo, come la legenda dei mockup: solo ciò che è stato scelto davvero. */
  const features: Feature[] = [];
  if (visibility === 'club') {
    const v = VISIBILITY_ICONS.club;
    features.push({ key: 'vis', icon: v.icon, tint: club ? clubTint(club.name) : v.tint, title: 'Club', detail: v.hint, value: club?.name });
  } else {
    const v = VISIBILITY_ICONS[visibility];
    features.push({ key: 'vis', icon: v.icon, tint: v.tint, title: visibility === 'public' ? 'Uscita pubblica' : 'Su invito', detail: v.hint, value: v.label });
  }
  features.push({
    key: 'sport',
    glyph: sportStyle,
    tint: sportStyle.solid,
    title: 'Tipo di attività',
    detail: [km ? kmLabel(km) : null, withPace && paceSec ? `Passo ${formatPace(paceSec)}` : null, `Livello ${levelLabel(uiLevel).toLowerCase()}`].filter(Boolean).join(' · '),
    value: SPORT_LABEL[sport],
  });
  features.push({ key: 'when', icon: 'calendar-outline', tint: color.accent, title: whenText, detail: placeLine || undefined });
  features.push(
    declaredPact.length
      ? {
          key: 'pact',
          icon: PACT_ICON,
          tint: PACT_TINT,
          title: 'Patto di corsa',
          detail: declaredPact.length === 1 ? (declaredPact[0] === 'regroupPoints' ? regroupText : PACT_ICONS[declaredPact[0]].hint) : declaredPact.map((m) => PACT_ICONS[m].label).join(', '),
          value: declaredPact.length === 1 ? PACT_ICONS[declaredPact[0]].label : `${declaredPact.length} impegni`,
        }
      : { key: 'pact', icon: PACT_ICON, tint: color.textTertiary, title: 'Patto di corsa', detail: 'Nessun impegno indicato' },
  );
  features.push(
    maxVal && maxVal >= 2
      ? { key: 'spots', icon: FEATURE_ICONS.limitedSpots.icon, tint: color.brandText, title: 'Posti', detail: FEATURE_ICONS.limitedSpots.hint, value: `${maxVal} posti` }
      : { key: 'spots', icon: FEATURE_ICONS.limitedSpots.icon, tint: color.brandText, title: 'Posti', detail: 'Senza limite di partecipanti', value: 'Illimitati' },
  );
  if (routeId) features.push({ key: 'route', icon: FEATURE_ICONS.route.icon, tint: color.accent, title: FEATURE_ICONS.route.label, detail: FEATURE_ICONS.route.hint });
  if (notes.trim()) features.push({ key: 'notes', icon: 'document-text-outline', tint: color.textSecondary, title: 'Note', detail: notes.trim() });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Sheet visible={proposalsOpen} onClose={() => setProposalsOpen(false)} title="Che uscita organizzi?">
        <OutingProposals onCustom={() => setProposalsOpen(false)} onChoose={(p) => { applySport(p.sport); setKm(p.km); setPaceSec(p.pace); setMax(p.spots); setTitle(p.title); setTitleEdited(true); setPactOn({ ...NO_PACT, [p.pact]: true }); setProposalsOpen(false); go(LAST); }} />
      </Sheet>
      <EventFrame
        title={id ? 'Modifica l’uscita' : 'Crea un’uscita'}
        steps={STEPS}
        index={i}
        onBack={() => (i > 0 ? go(i - 1) : close())}
        onCancel={close}
        onStep={go}
        scrollRef={scrollRef}
        footer={
          <>
            {err.general ? <Banner tone="error" text={err.general} /> : null}
            <GradientButton
              title={i < LAST ? 'Avanti' : busy ? (id ? 'Salvo…' : 'Pubblico…') : id ? 'Salva le modifiche' : 'Pubblica l’uscita'}
              busy={busy}
              onPress={next}
              accessibilityHint={i < LAST ? `Passo successivo: ${STEPS[i + 1]}` : undefined}
            />
          </>
        }>
        <Animated.View style={{ gap: S.lg, opacity: slide, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [dir * 28, 0] }) }] }}>
          {i === 0 ? (
            <>
              <View>
                <SectionTitle title="Tipo di attività" />
                <View style={{ marginTop: S.md }}>
                  <TypeCards value={sport} onChange={pickSport} />
                </View>
                <Reveal open={!!TYPE_NOTE[sport]}>
                  <Text style={[type.footnote, { color: color.textSecondary, paddingTop: S.sm }]}>{TYPE_NOTE[noteSport]}</Text>
                </Reveal>
              </View>

              <View style={{ gap: S.md }} onLayout={(e) => (whenY.current = e.nativeEvent.layout.y)}>
                <Button variant="soft" title="Usa la mia posizione" busy={gpsBusy} onPress={() => void locateMeetingPlace()} />
                {gpsAccuracy !== null ? <Text style={{ color: color.textSecondary }}>Precisione GPS: circa {Math.round(gpsAccuracy)} m. Controlla il ritrovo prima di pubblicare.</Text> : null}
                {usual ? <Button small title={`Usa il ritrovo abituale: ${shortPlace(usual.name)}`} onPress={() => { setPlaceV(usual); setGpsAccuracy(null); }} /> : null}
                {placeV ? <Button small title="Imposta questo come ritrovo abituale" onPress={async () => { await AsyncStorage.setItem('runngo:usual-meeting-place', JSON.stringify(placeV)); setUsual(placeV); }} /> : null}
                <SectionTitle title="Quando e dove" />
                <DateField
                  label="Data e ora"
                  value={when}
                  onChange={(d) => {
                    setWhen(d);
                    setErr({});
                  }}
                />
                {err.when ? <Banner tone="error" text={err.when} /> : null}
                {geoOff || (id && placeText && !placeV) ? (
                  <>
                    <Banner tone="warn" text="La ricerca dei luoghi non è attiva: scrivi il luogo a mano. Non sarà verificato e non comparirà tra le uscite vicine." />
                    <Field
                      label="Luogo (non verificato)"
                      value={placeText}
                      onChangeText={(v) => {
                        setPlaceText(v);
                        setErr({});
                      }}
                      placeholder="Es. Forlì"
                      error={err.place}
                    />
                  </>
                ) : (
                  <>
                    <PlacePicker
                      label="Città o località"
                      value={placeV}
                      onChange={(p) => {
                        setPlaceV(p);
                        setErr({});
                      }}
                      onUnavailable={() => setGeoOff(true)}
                    />
                    {err.place ? <Banner tone="error" text={err.place} /> : null}
                  </>
                )}
              </View>

              <View style={{ gap: S.sm }} onLayout={(e) => (whoY.current = e.nativeEvent.layout.y)}>
                <Pressable onPress={() => setWhoOpen(true)} accessibilityRole="button" accessibilityState={{ expanded: whoOpen }} accessibilityLabel="Visibilità e punto di ritrovo. Modifica i dettagli" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, padding: S.md, borderRadius: 18, backgroundColor: color.surface, opacity: pressed ? 0.75 : 1 })}>
                  <Ionicons name={visibility === 'club' ? 'people-outline' : visibility === 'private' ? 'link-outline' : 'earth-outline'} size={23} color={color.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.headline, { color: color.text }]}>Visibilità e ritrovo</Text>
                    <Text style={[type.footnote, { color: color.textSecondary }]}>{[visibility === 'club' ? club?.name ?? 'Scegli un club' : visibility === 'private' ? 'Solo chi ha il link' : 'Uscita pubblica', meet.trim() || 'Punto preciso facoltativo'].join(' · ')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
                </Pressable>
                {err.who ? <Banner tone="error" text={err.who} /> : null}
              </View>
            </>
          ) : null}

          {i === 1 ? (
            <>
              <DistanceDial sport={dialSport} value={km} onChange={setKm} />
              <View>
                {/* Il ritmo si chiude scorrendo passando ad "Altro" (che non ha ritmo): il livello sale senza saltare. */}
                <Reveal open={withPace}>
                  <View style={{ paddingBottom: S.xxl }}>
                    <PaceDial sport={pacedSport} value={paceSec} km={km} onChange={setPaceSec} />
                  </View>
                </Reveal>
                <LevelBar sport={dialSport} level={uiLevel} auto={manualLevel === null} estimate={estimate.level} onChange={setManualLevel} onReset={() => setManualLevel(null)} />
              </View>
            </>
          ) : null}

          {i === 2 ? (
            <>
              <View>
                <SectionTitle title="Patto di corsa" note="(opzionale)" />
                <Text style={[type.footnote, { color: color.textSecondary, marginTop: S.sm, marginBottom: S.md }]}>Impegni che prendi con il gruppo. Non sono garanzie di sicurezza.</Text>
                <PactTiles on={pactOn} onToggle={togglePact} />
                <Reveal open={pactOn.regroupPoints}>
                  <View style={{ paddingTop: S.sm }}>
                    <Field label="Dove ci si ricompatta" value={regroup} onChangeText={setRegroup} maxLength={160} placeholder="Es. fontana del parco, km 5" hint="Senza un luogo questo impegno non viene salvato." />
                  </View>
                </Reveal>
              </View>

              <View>
                <SectionTitle title="Posti" />
                <Row gap={S.sm} style={{ flexWrap: 'wrap', marginTop: S.md }}>
                  <OptionChip
                    label="Illimitati"
                    on={!maxCustom && max === null}
                    onPress={() => {
                      setMaxCustom(false);
                      setMax(null);
                      setErr({});
                    }}
                  />
                  {SPOTS.map((n) => (
                    <OptionChip
                      key={n}
                      label={String(n)}
                      accessibilityLabel={`${n} posti`}
                      on={!maxCustom && max === n}
                      onPress={() => {
                        setMaxCustom(false);
                        setMax(n);
                        setErr({});
                      }}
                    />
                  ))}
                  <OptionChip label="Altro" accessibilityLabel="Altro numero di posti" on={maxCustom} onPress={() => setMaxCustom(!maxCustom)} />
                </Row>
                <Reveal open={maxCustom}>
                  <View style={{ paddingTop: S.md }}>
                    <Field label="Posti massimi" value={maxText} onChangeText={setMaxText} keyboardType="number-pad" placeholder="Es. 12" maxLength={3} error={err.max} />
                  </View>
                </Reveal>
              </View>

              <Field label="Note per chi partecipa" value={notes} onChangeText={setNotes} multiline optional />
            </>
          ) : null}

          {i === 3 ? (
            <>
              <View style={{ gap: S.sm }}>
                <EventPreview
                  title={title}
                  sport={sport}
                  when={whenText}
                  place={meet.trim() || placeName}
                  km={km && km > 0 ? km : null}
                  paceSec={withPace ? paceSec : null}
                  visibility={visibility}
                  clubName={visibility === 'club' ? (club?.name ?? null) : null}
                  image={visibility === 'club' ? (club?.imageDataUrl ?? null) : null}
                  pact={declaredPact}
                  route={!!routeId}
                  spots={maxVal && maxVal >= 2 ? maxVal : null}
                />
                <Text style={[type.footnote, { color: color.textSecondary, textAlign: 'center' }]}>Così comparirà tra le uscite di gruppo.</Text>
              </View>
              <Field
                label="Nome dell’uscita"
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setTitleEdited(true);
                  setErr({});
                }}
                maxLength={80}
                error={err.title}
              />
              <View>
                <SectionTitle title="Caratteristiche" />
                <View style={{ marginTop: S.md }}>
                  <FeatureList items={features} onEdit={(key) => go(key === 'sport' ? 1 : key === 'pact' || key === 'spots' || key === 'notes' ? 2 : 0)} />
                </View>
              </View>
            </>
          ) : null}
        </Animated.View>
      </EventFrame>
      <Sheet visible={whoOpen && i === 0} onClose={() => setWhoOpen(false)} title="Visibilità e ritrovo" footer={<Button title="Conferma dettagli" onPress={() => setWhoOpen(false)} />}>
        <Field label="Punto di ritrovo preciso" value={meet} onChangeText={setMeet} optional placeholder="Es. fontana di piazza Saffi" maxLength={90} />
        <View style={{ gap: S.sm }} accessibilityRole="radiogroup" accessibilityLabel="Visibilità">
          <SectionTitle title="Visibilità" />
          <ChoiceRow title="Uscita pubblica" hint="Compare in Esplora: può partecipare chiunque" icon="earth-outline" on={visibility === 'public'} onPress={() => { setVisibility('public'); setClubId(null); setErr({}); }} />
          <ChoiceRow title="Solo chi ha il link" hint="Non compare in Esplora: decidi tu con chi condividerla" icon="link-outline" on={visibility === 'private'} onPress={() => { setVisibility('private'); setClubId(null); setErr({}); }} />
        </View>
        <View style={{ gap: S.sm }} accessibilityRole="radiogroup" accessibilityLabel="Riservata a un club">
          <SectionTitle title="Riservata a un club" />
          <Text style={[type.footnote, { color: color.textSecondary }]}>Scegli un tuo club per riservare l’uscita ai suoi membri.</Text>
          {clubs.map((c) => <ClubChoice key={c.id} club={c} selected={visibility === 'club' && clubId === c.id} onSelect={() => { setVisibility('club'); setClubId(c.id); setErr({}); }} />)}
          {!clubs.length ? <Text style={[type.footnote, { color: color.textSecondary }]}>Non fai ancora parte di un club.</Text> : null}
        </View>
        {err.who ? <Banner tone="error" text={err.who} /> : null}
      </Sheet>
    </>
  );
}
