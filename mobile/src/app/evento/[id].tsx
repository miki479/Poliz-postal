import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { InviteSheet } from '@/components/InviteSheet';
import { ActionSheetIOS, Alert, Platform, Pressable, Share, StyleSheet, Text, View, type AlertButton } from 'react-native';

import { EventScene, EventSigns, GlassChip, JoinStatus, paceNum, PersonRow } from '@/components/cards';
import { ActivityGlyph } from '@/components/SportIcon';
import { Async, Avatar, Banner, Button, Divider, Field, IconButton, Metric, Row, Screen, Section, Skeleton, t, useLoad, Panel } from '@/components/ui';
import { eventContext, eventSportStyle, PACT_ICONS, PACT_TINT, pactModes, VISIBILITY_ICONS } from '@/constants/eventStyle';
import { color, R, S, type } from '@/constants/theme';
import { call, ext, type WeatherResult } from '@/lib/api';
import { eventShareText, fmtDay, fmtKm, fmtTime, kmParts, LEVEL_LABEL, whenLabel } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useJoin } from '@/lib/useJoin';
import { RecognizeSheet } from '@/components/Recognize';
import { compatibility } from '@/lib/compat';
import { utcToZoned } from '@/lib/format';
import { GroupReportCard } from '@/components/GroupReportCard';
import type { RecognitionPrompt } from '@shared/fame.ts';
import type { PlannedSession } from '@shared/types.ts';
import type { Activity, ClubView, EventView, JoinBlock, UserPublic } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
const BLOCK: Record<JoinBlock, string> = {
  login: 'Accedi per partecipare.',
  full: 'Posti esauriti: tieni d’occhio l’uscita, qualcuno potrebbe liberare il posto.',
  cancelled: 'L’organizzatore ha annullato questa uscita.',
  past: 'Questa uscita si è già svolta.',
  club_only: 'Riservata ai membri del club che la organizza.',
  organizer: 'Sei l’organizzatore.',
};

function Weather({ e }: { e: EventView }) {
  const [w, setW] = useState<WeatherResult | null>(null);
  useEffect(() => {
    if (e.lat != null && e.lng != null && !e.isPast) ext.weather(e.lat, e.lng, e.startsAt).then(setW, () => setW(null));
  }, [e.lat, e.lng, e.startsAt, e.isPast]);
  if (!w?.available || !w.hour) return null;
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Ionicons name="partly-sunny-outline" size={20} color={color.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={t.body}>
          {w.hour.label} · {Math.round(w.hour.tempC)}° · vento {Math.round(w.hour.windKmh)} km/h{w.hour.rainProb != null ? ` · pioggia ${w.hour.rainProb}%` : ''}
        </Text>
        <Text style={t.small}>Previsione all’ora di partenza · {w.attribution}</Text>
      </View>
    </Row>
  );
}

function InfoLine({ icon, tint = color.textSecondary, children }: { icon: keyof typeof Ionicons.glyphMap; tint?: string; children: React.ReactNode }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={tint} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </Row>
  );
}

/** Immagine reale del club che organizza, se ne ha una; altrimenti null e resta la scena disegnata. Nessun salto: la scena ha già la sua misura. */
function useClubImage(clubId: string | null | undefined): string | null {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    setImg(null);
    if (!clubId) return;
    let alive = true;
    call<ClubView>('getClub', clubId, null).then(
      (c) => alive && setImg(c.imageDataUrl ?? null),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [clubId]);
  return img;
}

/**
 * Testata del dettaglio: la stessa scena della card grande "Uscite di gruppo" (sfumatura con la figura dell'attività o
 * immagine del club), data e ora e stato in alto, tipo e visibilità in chiaro, titolo grande e fila delle icone delle
 * caratteristiche (qui ogni icona si tocca e mostra il suo nome).
 */
function Hero({ e, image }: { e: EventView; image: string | null }) {
  const st = eventSportStyle(e.sport);
  const ctx = eventContext(e);
  const kind = [st.label, VISIBILITY_ICONS[e.visibility].label, ctx.clubName].filter(Boolean).join(' · ');
  return (
    <EventScene sport={e.sport} image={image} style={{ borderRadius: R.card + 2, opacity: e.status === 'cancelled' ? 0.75 : 1 }}>
      <View style={{ minHeight: 272, padding: S.lg, justifyContent: 'space-between', gap: S.xl }}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <GlassChip text={whenLabel(e.startsAt, e.timezone)} />
          <JoinStatus e={e} glass />
        </Row>
        <View style={{ gap: S.sm }}>
          <Row gap={6}>
            <ActivityGlyph style={st} size={16} color={color.storyInk} />
            <Text style={[type.footnote, { color: color.storyInkSecondary, fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
              {kind}
            </Text>
          </Row>
          <Text style={[type.display, { color: color.storyInk, fontSize: 30, lineHeight: 36 }]} accessibilityRole="header" numberOfLines={3}>
            {e.title}
          </Text>
          <EventSigns e={e} interactive />
        </View>
      </View>
    </EventScene>
  );
}

/** Chi organizza per primo, poi tu, poi gli altri in ordine di iscrizione (come arrivano dal server). */
function orderPeople(list: UserPublic[], organizerId: string, meId?: string): UserPublic[] {
  const rank = (p: UserPublic) => (p.id === organizerId ? 0 : p.id === meId ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/**
 * Partecipanti (mockup "Partecipanti"): riquadro con la scheda "Iscritti" e una riga per persona con stato e freccia.
 * Solo stati reali: l'iscrizione è immediata (nessuna richiesta "in attesa") e il server non dice chi ha poi corso davvero,
 * tranne per te ("Corsa registrata"). Per questo le schede "Confermati" e "Partecipanti" del mockup non ci sono.
 */
function Participants({ e, meId }: { e: EventView; meId?: string }) {
  const n = e.participantCount;
  const list = e.participants ? orderPeople(e.participants, e.organizer.id, meId) : null;
  const statusOf = (p: UserPublic): { text: string; tint: string } => {
    if (p.id === e.organizer.id) return { text: 'Organizzatore', tint: color.warning };
    if (p.id === meId && e.viewer.hasConfirmedRun) return { text: 'Corsa registrata', tint: color.success };
    return { text: 'Iscritto', tint: color.accent };
  };
  return (
    <View style={{ gap: S.sm }}>
      <Text style={t.h2} accessibilityRole="header">
        Partecipanti
      </Text>
      <Panel style={{ overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: S.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator }}>
          <View style={{ paddingTop: S.md, paddingBottom: S.sm, borderBottomWidth: 2, borderBottomColor: color.accent, marginBottom: -StyleSheet.hairlineWidth }} accessible accessibilityRole="header" accessibilityLabel={`Iscritti: ${n}${e.maxParticipants ? ` su ${e.maxParticipants} posti` : ''}`}>
            <Text style={[type.subhead, { color: color.text, fontWeight: '700' }]}>Iscritti</Text>
          </View>
          <Text style={[t.small, { marginLeft: 'auto', paddingBottom: S.sm }]} importantForAccessibility="no" accessibilityElementsHidden>
            {e.maxParticipants ? `${n} su ${e.maxParticipants}` : n}
          </Text>
        </View>
        {list && list.length ? (
          <View style={{ paddingVertical: S.xs }}>
            {list.map((p, i) => {
              const s = statusOf(p);
              return (
                <View key={p.id}>
                  {i ? <Divider inset={S.lg + 40 + S.md} /> : null}
                  <PersonRow p={p} isMe={p.id === meId} status={s.text} tint={s.tint} onPress={() => router.push({ pathname: '/utente/[id]', params: { id: p.id } })} />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[t.muted, { padding: S.lg }]}>{n === 0 ? 'Ancora nessun iscritto.' : e.restricted ? 'I nomi di chi partecipa sono visibili solo a chi ha accesso all’uscita.' : 'Accedi per vedere chi partecipa.'}</Text>
        )}
      </Panel>
    </View>
  );
}

/** Patto di corsa: le stesse icone, etichette e spiegazioni delle card (PACT_ICONS), solo le modalità dichiarate. */
function Pact({ e }: { e: EventView }) {
  const modes = pactModes(e.pact);
  if (!modes.length) return null;
  const regroup = (e.pact?.regroupPoints ?? '').trim();
  return (
    <Section title="Patto di corsa">
      {modes.map((m) => {
        const d = PACT_ICONS[m];
        const detail = m === 'regroupPoints' && regroup ? regroup : d.hint;
        return (
          <InfoLine key={m} icon={d.icon} tint={PACT_TINT}>
            <View accessible accessibilityLabel={`${d.label}: ${detail}`}>
              <Text style={t.body}>{d.label}</Text>
              <Text style={t.muted}>{detail}</Text>
            </View>
          </InfoLine>
        );
      })}
      <Text style={t.small}>Impegni dichiarati da chi organizza, non garanzie di sicurezza.</Text>
    </Section>
  );
}

/** Perché l'uscita può essere pertinente per l’allenamento del piano di quel giorno (criteri dichiarati). */
function PlanFit({ e }: { e: EventView }) {
  const [s, setS] = useState<PlannedSession | null>(null);
  useEffect(() => {
    if (e.isPast || e.status !== 'active') return;
    const day = utcToZoned(e.startsAt, e.timezone).date;
    call<PlannedSession[]>('listSessions', { from: day, to: day }).then((l) => setS(l.find((x) => x.status === 'planned' || x.status === 'rescheduled') ?? null), () => setS(null));
  }, [e.startsAt, e.timezone, e.isPast, e.status]);
  if (!s) return null;
  const c = compatibility(e, s);
  return (
    <Section title={c.fits ? 'Adatta al tuo piano' : 'Rispetto al tuo piano'}>
      <Text style={t.body}>Quel giorno hai in programma “{s.title}”, {s.durationMin} minuti.</Text>
      {c.reasons.map((r) => (
        <Text key={r} style={t.small}>
          · {r}
        </Text>
      ))}
      <Text style={t.small}>Indicazione basata su durata e livello dichiarati, non una valutazione medica.</Text>
    </Section>
  );
}

function RecognizeInvite({ e, autoOpen }: { e: EventView; autoOpen: boolean }) {
  const [p, setP] = useState<RecognitionPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => call<RecognitionPrompt>('recognitionPrompt', e.id).then(setP, () => setP(null));
  useEffect(() => {
    if (!e.isPast) return;
    void load().then(() => autoOpen && setOpen(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, e.isPast]);
  if (!p || !p.eligible || p.done) return open ? <RecognizeSheet eventId={e.id} visible={open} onClose={() => setOpen(false)} onDone={() => void load()} /> : null;
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Row gap={S.sm}>
        <Ionicons name="sparkles-outline" size={20} color={color.brandText} />
        <Text style={[t.title, { flex: 1 }]}>Chi ha reso speciale questa corsa?</Text>
      </Row>
      <Text style={t.muted}>Facoltativo, fino al {new Date(p.deadline).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.</Text>
      <Button variant="soft" title="Lascia un riconoscimento" iconName="heart-outline" onPress={() => setOpen(true)} />
      <RecognizeSheet eventId={e.id} visible={open} onClose={() => setOpen(false)} onDone={() => void load()} />
    </Panel>
  );
}

export default function EventoDettaglio() {
  const { id, t: token, recognize } = useLocalSearchParams<{ id: string; t?: string; recognize?: string }>();
  const { me } = useSession();
  const state = useLoad(() => call<EventView>('getEvent', id, token ?? null), [id]);
  const j = useJoin((e) => state.setData(e));
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [inviting, setInviting] = useState(false);
  const clubImage = useClubImage(state.data?.club?.id);

  function organizerMenu(e: EventView) {
    const options = ['Modifica', ...(e.status === 'active' && !e.isPast ? ['Annulla uscita'] : []), 'Chiudi'];
    const pick = (i: number) => {
      if (options[i] === 'Modifica') router.push({ pathname: '/evento/form', params: { id: e.id } });
      if (options[i] === 'Annulla uscita')
        Alert.alert('Annullare l’uscita?', `Le ${e.participantCount} persone iscritte riceveranno una notifica. L’uscita resterà visibile come annullata.`, [
          { text: 'No, tienila', style: 'cancel' },
          { text: 'Annulla uscita', style: 'destructive', onPress: () => call<EventView>('cancelEvent', e.id).then(state.setData, (err) => Alert.alert('Non annullata', humanError(err, 'Riprova tra poco.'))) },
        ]);
    };
    const cancel = options.indexOf('Annulla uscita');
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: cancel >= 0 ? cancel : undefined }, pick);
    else {
      // Su Android l'avviso non si chiude toccando fuori: serve sempre "Chiudi" (al massimo tre voci).
      const buttons: AlertButton[] = options.slice(0, -1).map((o, i) => ({ text: o, style: o === 'Annulla uscita' ? 'destructive' : 'default', onPress: () => pick(i) }));
      Alert.alert(e.title, undefined, [...buttons, { text: 'Chiudi', style: 'cancel' }], { cancelable: true });
    }
  }

  async function confirmRun(e: EventView) {
    setConfirming(true);
    try {
      const num = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : null);
      await call<Activity>('confirmRun', e.id, { distanceKm: num(km), durationMin: num(min) });
      await state.reload();
    } catch (err) {
      Alert.alert('Non registrata', humanError(err, 'Errore.'));
    } finally {
      setConfirming(false);
    }
  }

  const e = state.data;
  const v = e?.viewer;
  const footer = !e || !v ? undefined : v.isOrganizer ? undefined : v.isParticipant ? (
    <>
      <Row style={{ justifyContent: 'center' }}>
        <Ionicons name="checkmark-circle" size={20} color={color.success} />
        <Text style={[type.headline, { color: color.text }]}>{j.done === 'joined' ? 'Ci sei! Iscrizione confermata' : 'Sei iscritto'}</Text>
      </Row>
      {!e.isPast && e.status === 'active' ? (
        <Button
          small
          variant="danger"
          title="Annulla la partecipazione"
          disabled={j.busy}
          onPress={() => Alert.alert('Annullare la partecipazione?', 'Il tuo posto tornerà disponibile e l’organizzatore lo vedrà.', [{ text: 'Resto iscritto', style: 'cancel' }, { text: 'Annulla partecipazione', style: 'destructive', onPress: () => void j.leave(e.id) }])}
          style={{ alignSelf: 'center' }}
        />
      ) : null}
      {j.error ? <Banner tone="error" text={j.error} /> : null}
    </>
  ) : v.canJoin ? (
    <>
      <Button title={j.busy ? 'Ti iscrivo…' : 'Partecipa'} iconName="add-circle-outline" busy={j.busy} onPress={() => void j.join(e.id, token ?? null)} accessibilityHint="Ti iscrive a questa uscita" />
      {j.error ? <Banner tone="error" text={j.error} /> : j.done === 'left' ? <Text style={[t.small, { textAlign: 'center' }]}>Partecipazione annullata.</Text> : null}
    </>
  ) : v.joinBlock ? (
    <Text style={[t.muted, { textAlign: 'center' }]}>{BLOCK[v.joinBlock]}</Text>
  ) : undefined;

  return (
    <Screen onRefresh={state.reload} footer={footer}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            e ? (
              <Row gap={0}>
                <IconButton name="share-outline" label="Condividi l’uscita" color={color.accent} onPress={() => void Share.share({ message: eventShareText(e.title, e.startsAt, e.timezone) }).catch(() => {})} />
                {e.viewer.isOrganizer ? <IconButton name="ellipsis-horizontal" label="Altre azioni" color={color.accent} onPress={() => organizerMenu(e)} /> : null}
              </Row>
            ) : null,
        }}
      />
      <Async state={state} skeleton={<><Skeleton height={272} radius={R.card + 2} /><Skeleton height={80} /></>}>
        {(e) => (
          <>
            {/* 1. Ciò che serve per decidere: la stessa scena della card grande, poi quando e dove */}
            <Hero e={e} image={clubImage} />
            <View style={{ gap: S.md }}>
              <InfoLine icon="calendar-outline">
                <Text style={t.body}>{fmtDay(e.startsAt, e.timezone)}</Text>
                <Text style={t.muted}>Partenza alle {fmtTime(e.startsAt, e.timezone)}</Text>
              </InfoLine>
              <InfoLine icon="location-outline">
                {e.restricted ? (
                  <Text style={t.muted}>Il punto di ritrovo è visibile a chi partecipa.</Text>
                ) : (
                  <>
                    <Text style={t.body}>{e.meetingPlace || 'Punto di ritrovo da definire'}</Text>
                    {e.area ? <Text style={t.muted}>{e.area}</Text> : null}
                  </>
                )}
              </InfoLine>
            </View>

            <Row gap={0} style={{ backgroundColor: color.surface, borderRadius: R.card, paddingVertical: S.lg, paddingHorizontal: S.lg }}>
              <Metric size="sm" value={e.distanceKm ? kmParts(e.distanceKm)[0] : '—'} unit={e.distanceKm ? 'km' : undefined} label="Distanza" />
              <Metric size="sm" value={e.paceSecPerKm ? paceNum(e.paceSecPerKm) : '—'} unit={e.paceSecPerKm ? '/km' : undefined} label={e.sport === 'trail' ? 'Passo indicativo' : 'Passo previsto'} />
              <Metric size="sm" value={LEVEL_LABEL[e.level]} label="Livello" />
            </Row>
            <Text style={[t.small, { marginTop: -S.lg }]}>
              {e.participantCount} {e.participantCount === 1 ? 'iscritto' : 'iscritti'}
              {e.maxParticipants ? ` su ${e.maxParticipants} posti` : ''}
              {e.spotsLeft !== null && e.spotsLeft > 0 && !e.isPast ? ` · ${e.spotsLeft} ${e.spotsLeft === 1 ? 'posto libero' : 'posti liberi'}` : ''}
            </Text>

            <Weather e={e} />
            <PlanFit e={e} />
            <RecognizeInvite e={e} autoOpen={recognize === '1'} />
            {!e.isPast && e.status === 'active' && (e.viewer.isOrganizer || e.viewer.isParticipant) && !e.restricted ? (
              <>
                <Button title="Invita amici all’uscita" variant="soft" iconName="person-add-outline" onPress={() => setInviting(true)} />
                <InviteSheet visible={inviting} onClose={() => setInviting(false)} eventId={e.id} />
              </>
            ) : null}
            <Pact e={e} />

            {/* 2. Percorso, organizzatore, partecipanti, dettagli */}
            {e.route ? (
              <Section title="Percorso">
                <Pressable onPress={() => router.push({ pathname: '/percorsi/[id]', params: { id: e.route!.id } })} accessibilityRole="button" accessibilityLabel={`Percorso ${e.route.name}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52 }, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="map-outline" size={22} color={color.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={t.title}>{e.route.name}</Text>
                    <Text style={t.muted}>
                      {e.route.startName}
                      {e.route.endName && e.route.endName !== e.route.startName ? ` → ${e.route.endName}` : ' · anello'}
                      {e.route.distanceKm ? ` · ${fmtKm(e.route.distanceKm)}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
                </Pressable>
              </Section>
            ) : null}

            <Section title="Organizza">
              <Pressable onPress={() => router.push({ pathname: '/utente/[id]', params: { id: e.organizer.id } })} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52 }, pressed && { opacity: 0.6 }]}>
                <Avatar name={e.organizer.displayName} hue={e.organizer.hue} uri={e.organizer.avatar} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={t.title}>{e.organizer.displayName}</Text>
                  {e.club ? <Text style={t.muted}>per {e.club.name}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
              </Pressable>
            </Section>

            <Participants e={e} meId={me?.id} />

            {e.notes && !e.restricted ? (
              <Section title="Note dell’organizzatore">
                <Text style={t.body}>{e.notes}</Text>
              </Section>
            ) : null}

            {e.isPast && e.status === 'active' && e.viewer.isParticipant ? <GroupReportCard eventId={e.id} /> : null}

            {e.viewer.canConfirmRun ? (
              <Section title="Hai corso? Registra l’uscita">
                <Text style={t.muted}>Distanza e durata le dichiari tu: servono per i tuoi progressi e per le sfide del gruppo.</Text>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Field label="Km" value={km} onChangeText={setKm} keyboardType="decimal-pad" placeholder="es. 8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Minuti" value={min} onChangeText={setMin} keyboardType="number-pad" placeholder="es. 50" />
                  </View>
                </Row>
                <Button variant="soft" title="Registra la mia corsa" iconName="checkmark-done-outline" busy={confirming} onPress={() => void confirmRun(e)} />
              </Section>
            ) : e.viewer.hasConfirmedRun ? (
              <Banner tone="success" text="Hai registrato questa corsa." />
            ) : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
