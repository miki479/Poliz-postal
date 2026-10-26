import { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Banner, Button, Row, Sheet, t, useLoad } from '@/components/ui';
import { color, S } from '@/constants/theme';
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
  const confirmed = (state.data ?? []).filter((c) => c.status === 'accepted');
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
      {state.data ? (
        confirmed.length ? (
          <View style={{ gap: S.sm }}>
            <Text style={t.body}>Con {confirmed.map((c) => c.user.displayName).join(', ')}</Text>
            <Text style={t.small}>Compagni confermati da entrambe le persone.</Text>
          </View>
        ) : (
          <Text style={t.muted}>Nessun compagno confermato: attività individuale.</Text>
        )
      ) : null}
      <Button small title="Aggiungi o correggi compagni" onPress={() => setOpen(true)} />
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
        {(state.data ?? []).map((c) => (
          <View key={c.user.id} style={{ gap: S.sm }}>
            <Row>
              <Avatar name={c.user.displayName} hue={c.user.hue} uri={c.user.avatar} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={t.title}>{c.user.displayName}</Text>
                <Text style={[t.small, c.status === 'accepted' && { color: color.success }]}>
                  {LABEL[c.status]}
                  {c.suggested ? ' · percorso simile, da confermare' : ''}
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
