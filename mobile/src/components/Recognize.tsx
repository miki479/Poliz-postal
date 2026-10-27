import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, Banner, Button, Divider, LinkText, Loading, Pills, Row, Sheet, t } from '@/components/ui';
import { S } from '@/constants/theme';
import { call } from '@/lib/api';
import type { GiveResult, RecognitionPrompt } from '@shared/fame.ts';
import type { RecognitionCategory } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export const RECOGNITION_UI: Record<RecognitionCategory, { label: string; description: string }> = {
  teamwork: { label: 'Fa squadra', description: 'Ha incoraggiato le altre persone e reso la corsa un momento di gruppo.' },
  keeps_group: { label: 'Tiene unito il gruppo', description: 'Ha aspettato e ricompattato: nessuno è rimasto indietro.' },
  organization: { label: 'Ottima organizzazione', description: 'Ritrovo, percorso e orari chiari.' },
  shares_experience: { label: 'Condivide esperienza', description: 'Consigli utili su percorso, ritmo o attrezzatura.' },
  pace_setter: { label: 'Motore della corsa', description: 'Ha tenuto il ritmo concordato aiutando il gruppo.' },
};

/**
 * "Chi ha reso speciale questa corsa?" — facoltativo, una volta per uscita, entro 72 ore.
 * Le regole (presenza confermata, limiti, niente autovalutazione) sono applicate dal server.
 */
export function RecognizeSheet({ eventId, visible, onClose, onDone }: { eventId: string; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState<RecognitionPrompt | null>(null);
  const [picks, setPicks] = useState<Record<string, RecognitionCategory[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<GiveResult | null>(null);

  useEffect(() => {
    if (!visible) return;
    setResult(null);
    call<RecognitionPrompt>('recognitionPrompt', eventId).then(setP, (e) => setErr(humanError(e, 'Errore.')));
  }, [visible, eventId]);

  const total = Object.values(picks).reduce((a, l) => a + l.length, 0);

  async function send(skip: boolean) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const entries = skip ? null : Object.entries(picks).flatMap(([toId, cats]) => cats.map((category) => ({ toId, category })));
      setResult(await call<GiveResult>('giveRecognitions', eventId, entries));
      onDone();
    } catch (e) {
      setErr(humanError(e, 'Non inviato.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Chi ha reso speciale questa corsa?"
      footer={p?.eligible && !p.done && !result ? (
        <>
          <Button title={total ? `Invia ${total} ${total === 1 ? 'riconoscimento' : 'riconoscimenti'}` : 'Scegli almeno una qualità'} busy={busy} disabled={!total || total > 5} onPress={() => void send(false)} />
          <LinkText title="Non ho abbastanza elementi" onPress={() => void send(true)} style={{ alignSelf: 'center' }} />
        </>
      ) : undefined}>
      {!p && !err ? <Loading /> : null}
      {err ? <Banner tone="error" text={err} /> : null}
      {result ? <Banner tone="success" text={result.skipped ? 'Va bene, nessun problema.' : `Grazie! ${result.saved} ${result.saved === 1 ? 'riconoscimento inviato' : 'riconoscimenti inviati'}.${result.ignored.length ? ' Alcuni non sono stati conteggiati perché hai già riconosciuto spesso quella persona di recente.' : ''}`} /> : null}
      {p && !result ? (
        !p.eligible ? (
          <Text style={t.muted}>{p.reason}</Text>
        ) : p.done ? (
          <Text style={t.muted}>Hai già risposto per questa uscita.</Text>
        ) : (
          <>
            <Text style={t.muted}>Facoltativo. Riconosci comportamenti, non capacità o aspetto. Chi riceve vede le qualità solo quando diventano ricorrenti, non chi le ha date. Massimo 5.</Text>
            {p.peers.map((peer, i) => (
              <View key={peer.user.id} style={{ gap: S.sm }}>
                {i ? <Divider /> : null}
                <Row>
                  <Avatar name={peer.user.displayName} hue={peer.user.hue} uri={peer.user.avatar} size={36} />
                  <Text style={[t.title, { flex: 1 }]}>
                    {peer.user.displayName}
                    {peer.organizer ? ' · organizza' : ''}
                  </Text>
                </Row>
                <Pills multi value={picks[peer.user.id] ?? []} onChange={(v: RecognitionCategory[]) => setPicks({ ...picks, [peer.user.id]: v })} options={peer.categories.map((c) => ({ value: c, label: RECOGNITION_UI[c].label }))} />
              </View>
            ))}
            <View style={{ gap: S.xs }}>
              {(Object.keys(RECOGNITION_UI) as RecognitionCategory[]).map((c) => (
                <Text key={c} style={t.small}>
                  <Text style={{ fontWeight: '700' }}>{RECOGNITION_UI[c].label}</Text>: {RECOGNITION_UI[c].description}
                </Text>
              ))}
            </View>
          </>
        )
      ) : null}
    </Sheet>
  );
}
