import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/event/GradientButton';
import { Avatar, Banner, IconButton, Skeleton, t, useReduceMotion } from '@/components/ui';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { API_URL, call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import type { InviteCandidate, InviteState } from '@shared/invites.ts';

/** Riga sotto il nome e pulsante a destra, per ogni stato reale dell'invito (shared/invites.ts). */
const STATE: Record<InviteState, { sub: string; dot?: string; pill: string | null; tint?: string; icon?: keyof typeof Ionicons.glyphMap }> = {
  none: { sub: 'Persona che segui', pill: null },
  pending: { sub: 'Invito in attesa di risposta', dot: color.accent, pill: 'Invitato', tint: color.accent, icon: 'time-outline' },
  member: { sub: 'Già nel club', dot: color.success, pill: 'Iscritto', tint: color.success },
  recent_decline: { sub: 'Ha rifiutato da poco', pill: 'Rifiutato', tint: color.textTertiary },
};

/** Link reale dell'invito: la pagina web dell'app (stesso server dell'API) apre l'adesione con il codice del club. */
const inviteUrl = (code: string) => `${API_URL}/invito/${encodeURIComponent(code)}`;
const shortUrl = (u: string) => u.replace(/^https?:\/\//, '');

function Row({ c, busy, onInvite, event = false }: { c: InviteCandidate; busy: boolean; onInvite: () => void; event?: boolean }) {
  const s = event && c.state === 'member' ? { ...STATE.member, sub: 'Partecipa già all’uscita' } : STATE[c.state];
  const name = c.user.displayName;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64 }}>
      <Avatar name={name} hue={c.user.hue} uri={c.user.avatar} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {s.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.dot }} /> : null}
          <Text style={[type.footnote, { color: color.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
            {s.sub}
          </Text>
        </View>
      </View>
      {c.state === 'none' ? (
        <Pressable onPress={onInvite} disabled={busy} accessibilityRole="button" accessibilityLabel={`Invita ${name}`} accessibilityState={{ busy, disabled: busy }} hitSlop={6} style={({ pressed }) => [pill, { backgroundColor: color.brandStrong, minWidth: 84 }, (pressed || busy) && { opacity: 0.75 }]}>
          {busy ? <ActivityIndicator size="small" color={color.storyInk} /> : <Text style={[type.subhead, { color: color.storyInk, fontWeight: '700' }]}>Invita</Text>}
        </Pressable>
      ) : (
        <View style={[pill, { backgroundColor: color.surface, borderWidth: 1, borderColor: color.separator }]} accessible accessibilityLabel={`${name}: ${s.pill}`}>
          {s.icon ? <Ionicons name={s.icon} size={14} color={s.tint} /> : null}
          <Text style={[type.subhead, { color: s.tint, fontWeight: '700' }]}>{s.pill}</Text>
        </View>
      )}
    </View>
  );
}

const pill = { minHeight: 36, paddingHorizontal: S.lg, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 } as const;

/**
 * "Invita amici" nel club, a tutta pagina: ricerca tra le persone che segui, un "Invita" per riga (il server ricontrolla
 * ogni regola: solo membri, solo amici, un invito in sospeso, pausa dopo un rifiuto), poi il link d'invito reale del club
 * da copiare o condividere con chi non è ancora tra i tuoi amici.
 */
export function InviteSheet({ visible, onClose, clubId = '', clubName = '', inviteCode = '', eventId }: { visible: boolean; onClose: () => void; clubId?: string; clubName?: string; inviteCode?: string; eventId?: string }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [list, setList] = useState<InviteCandidate[] | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(() => {
    setError('');
    setList(null);
    call<InviteCandidate[]>(eventId ? 'eventInviteCandidates' : 'inviteCandidates', eventId ?? clubId).then(setList, (e) => setError(humanError(e, 'Non riesco a caricare i tuoi amici.')));
  }, [clubId, eventId]);
  useEffect(() => {
    if (!visible) return;
    setNote('');
    setQ('');
    setCopied(false);
    load();
  }, [visible, load]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const shown = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('it');
    return (list ?? []).filter((c) => !k || c.user.displayName.toLocaleLowerCase('it').includes(k));
  }, [list, q]);

  async function invite(c: InviteCandidate) {
    setBusyId(c.user.id);
    setError('');
    setNote('');
    try {
      const r = await call<{ sent: number; skipped: number }>(eventId ? 'inviteToEvent' : 'inviteToClub', eventId ?? clubId, [c.user.id]);
      if (r.sent) {
        // Lo stato reale arriva dal server; intanto la riga mostra subito l'invito partito.
        setList((cur) => cur?.map((x) => (x.user.id === c.user.id ? { ...x, state: 'pending' } : x)) ?? cur);
        AccessibilityInfo.announceForAccessibility(`Invito inviato a ${c.user.displayName}`);
      } else setNote(`L’invito a ${c.user.displayName} non è partito: era già invitato o non si può invitare ora.`);
      load();
    } catch (e) {
      setError(humanError(e, 'Non sono riuscito a inviare l’invito. Riprova.'));
    } finally {
      setBusyId(null);
    }
  }

  const url = inviteCode ? inviteUrl(inviteCode) : '';
  async function copy() {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Link copiato');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      /* gli appunti non sono essenziali: resta "Condividi link" */
    }
  }
  const shareLink = () => void Share.share({ message: `Entra nel club “${clubName}” su RUNNGO: ${url}\nCodice d’invito: ${inviteCode}` });

  return (
    <Modal visible={visible} animationType={reduce ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.bg }}>
        <View style={{ paddingTop: insets.top + S.xs, paddingHorizontal: S.sm, flexDirection: 'row', alignItems: 'center', gap: S.xs, minHeight: HIT }}>
          <IconButton name="arrow-back" label="Indietro" onPress={onClose} />
          <Text style={[type.title2, { color: color.text, flex: 1 }]} accessibilityRole="header" numberOfLines={1}>
            Invita amici
          </Text>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: S.xl, gap: S.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 48, borderRadius: R.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.separator, paddingHorizontal: S.md }}>
            <Ionicons name="search" size={18} color={color.textSecondary} />
            <TextInput value={q} onChangeText={setQ} placeholder="Cerca amici..." placeholderTextColor={color.textTertiary} accessibilityLabel="Cerca amici" returnKeyType="search" autoCorrect={false} style={{ flex: 1, color: color.text, ...type.body, paddingVertical: S.sm }} />
            {q ? <IconButton name="close-circle" size={18} color={color.textTertiary} label="Cancella ricerca" onPress={() => setQ('')} /> : null}
          </View>

          {error ? <Banner tone="error" text={error} action="Riprova" onAction={load} /> : null}
          {note ? <Banner tone="info" text={note} /> : null}

          {!list && !error ? (
            <View style={{ gap: S.sm }}>
              <Skeleton height={56} />
              <Skeleton height={56} />
            </View>
          ) : null}
          {list && !list.length ? <Text style={t.muted}>{eventId ? 'Qui compaiono le persone che segui e che possono accedere all’uscita. Per le uscite del club devono esserne membri.' : 'Qui compaiono le persone che segui. Seguine qualcuna dal suo profilo per poterla invitare, oppure condividi il link qui sotto.'}</Text> : null}
          {list && list.length > 0 && !shown.length ?<Text style={t.muted}>Nessuna persona che segui corrisponde a “{q.trim()}”.</Text> : null}
          {shown.length ? (
            <View>
              {shown.map((c) => (
                <Row key={c.user.id} c={c} busy={busyId !== null} event={!!eventId} onInvite={() => void invite(c)} />
              ))}
            </View>
          ) : null}

          {url ? (
            <View style={{ gap: S.sm, marginTop: S.sm }}>
              <View style={{ gap: 2 }}>
                <Text style={[type.headline, { color: color.text }]} accessibilityRole="header">
                  Link di invito
                </Text>
                <Text style={[type.footnote, { color: color.textSecondary }]}>Condividi il link con altri runner</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 52, borderRadius: R.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.separator, paddingLeft: S.lg, paddingRight: S.xs }}>
                <Text style={[type.subhead, { color: color.text, flex: 1 }]} numberOfLines={1} ellipsizeMode="middle" selectable accessibilityLabel={`Link di invito: ${shortUrl(url)}`}>
                  {shortUrl(url)}
                </Text>
                <IconButton name={copied ? 'checkmark' : 'copy-outline'} size={20} color={copied ? color.success : color.textSecondary} label={copied ? 'Link copiato' : 'Copia il link'} onPress={() => void copy()} />
              </View>
              <Text style={[type.footnote, { color: copied ? color.success : color.textTertiary }]} accessibilityLiveRegion="polite">
                {copied ? 'Link copiato negli appunti.' : `Codice d’invito: ${inviteCode}`}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {url ? (
          <View style={{ paddingHorizontal: GUTTER, paddingTop: S.sm, paddingBottom: insets.bottom + S.md }}>
            <GradientButton title="Condividi link" onPress={shareLink} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
