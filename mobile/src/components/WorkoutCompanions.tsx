import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Banner, Button, Row, Sheet, t, useLoad } from '@/components/ui';
import { color, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import type { CompanionCandidate, CompanionRequestView } from '@shared/workoutCompanions.ts';
const LABEL = {
  accepted: 'Confermato',
  pending: 'In attesa di conferma',
  declined: 'Rifiutato',
  removed: 'Collegamento rimosso',
  none: 'Non collegato',
};
export function WorkoutCompanions({ logId }: { logId: string }) {
  const state = useLoad(() => call<CompanionCandidate[]>('workoutCompanionContext', logId), [logId]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Solo ciò di cui l'app è certa: i compagni confermati e le persone che segui. Gli abbinamenti per percorso simile non si mostrano.
  const candidates = (state.data ?? []).filter((c) => !c.suggested || c.status === 'accepted' || c.status === 'pending');
  const confirmed = candidates.filter((c) => c.status === 'accepted');
  const change = async (c: CompanionCandidate, remove: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (remove && c.requestId) await call('removeWorkoutCompanion', c.requestId);
      else await call('requestWorkoutCompanion', logId, c.user.id);
      await state.reload();
    } catch (e) {
      setError(humanError(e, 'Non riesco ad aggiornare i compagni. Riprova.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: S.sm }}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Compagni di questa attività" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, opacity: pressed ? 0.6 : 1 })}>
        {confirmed.length ? (
          <View style={{ flexDirection: 'row' }}>{confirmed.slice(0, 3).map((c, i) => <View key={c.user.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={c.user.displayName} hue={c.user.hue} uri={c.user.avatar} size={28} frame="ring" ring={color.bg} /></View>)}</View>
        ) : <Ionicons name="person-add-outline" size={22} color={color.accent} />}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>{confirmed.length ? `Con ${confirmed.map((c) => c.user.displayName).join(', ')}` : 'Chi era con te?'}</Text>
          <Text style={t.small} numberOfLines={1}>{confirmed.length ? 'Confermati da entrambe le persone' : 'Attività individuale finché nessuno conferma'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Con chi hai corso">
        <Text style={t.muted}>
          Scegli tra le persone che segui. Compariranno nella corsa solo dopo la loro conferma. Gli abbinamenti GPS sono suggerimenti, non
          presenze verificate.
        </Text>
        {state.error ? (
          <Banner tone="error" text={state.error} action="Riprova" onAction={state.reload} />
        ) : state.data?.length === 0 ? (
          <Text style={t.muted}>Non segui ancora nessuno: cerca compagni nella Community.</Text>
        ) : null}
        {candidates.map((c) => (
          <View key={c.user.id} style={{ gap: S.sm }}>
            <Row>
              <Avatar name={c.user.displayName} hue={c.user.hue} uri={c.user.avatar} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={t.title}>{c.user.displayName}</Text>
                <Text style={[t.small, c.status === 'accepted' && { color: color.success }]}>
                  {LABEL[c.status]}
                  
                </Text>
              </View>
            </Row>
            {c.canRequest ? (
              <Button variant="soft" title="Chiedi conferma" disabled={busy} onPress={() => void change(c, false)} />
            ) : c.status === 'pending' || c.status === 'accepted' ? (
              <Button
                small
                title={c.status === 'pending' ? 'Annulla richiesta' : 'Rimuovi collegamento'}
                disabled={busy}
                onPress={() => void change(c, true)}
              />
            ) : null}
          </View>
        ))}
        {error ? <Banner tone="error" text={error} /> : null}
      </Sheet>
    </View>
  );
}
export function CompanionRequestCard({ request, onDone }: { request: CompanionRequestView; onDone(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await call('respondWorkoutCompanion', request.id, accept);
      onDone();
    } catch (e) {
      setError(humanError(e, 'Non riesco a rispondere. Riprova.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: S.sm }}>
      <Text style={t.title}>Hai corso con {request.from.displayName}?</Text>
      <Text style={t.muted}>
        Conferma solo se avete corso insieme. Non condividi posizione, percorso o metriche e puoi rimuovere il collegamento.
      </Text>
      <Button title="Confermo" busy={busy} onPress={() => void answer(true)} />
      <Button variant="soft" title="Rifiuta" disabled={busy} onPress={() => void answer(false)} />
      {error ? <Banner tone="error" text={error} /> : null}
    </View>
  );
}
