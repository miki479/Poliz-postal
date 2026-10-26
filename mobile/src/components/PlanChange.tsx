import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';

import { Banner, Button, Divider, Loading, Row, Sheet, t } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { call } from '@/lib/api';
import { ACTION_LABEL, newRequestId, shortDate, todayIso } from '@/lib/plan';
import { fmtDuration, KIND_LABEL } from '@/lib/format';
import type { ChangeParams, ChangePreview } from '@shared/adaptive.ts';
import type { AdjustAction, PlanChange } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export interface ChangeRequest {
  action: AdjustAction;
  params: ChangeParams;
  /** Perché viene proposta (dati usati). */
  basis?: string[];
}

/**
 * Anteprima → Conferma → Scrittura → Annulla.
 * L'anteprima non scrive nulla; la conferma invia la firma delle versioni (se il piano è cambiato, il server rifiuta)
 * e un requestId (doppio tap e retry non duplicano nulla).
 */
export function PlanChangeSheet({ req, onClose, onApplied }: { req: ChangeRequest | null; onClose: () => void; onApplied: (c: PlanChange) => void }) {
  const [pv, setPv] = useState<ChangePreview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(newRequestId());

  useEffect(() => {
    if (!req) return;
    setPv(null);
    setErr('');
    requestId.current = newRequestId();
    call<ChangePreview>('previewPlanChange', req.action, req.params, todayIso()).then(setPv, (e) => setErr(humanError(e, 'Anteprima non disponibile.')));
  }, [req]);

  async function confirm() {
    if (!req || !pv || busy) return;
    setBusy(true);
    setErr('');
    try {
      const c = await call<PlanChange>('applyPlanChange', req.action, req.params, todayIso(), pv.token, requestId.current);
      AccessibilityInfo.announceForAccessibility('Modifica confermata');
      onApplied(c);
    } catch (e) {
      // Nessun falso successo: se il piano è cambiato, si ricarica l'anteprima aggiornata.
      setErr(humanError(e, 'Non salvato.'));
      call<ChangePreview>('previewPlanChange', req.action, req.params, todayIso()).then(setPv, () => setPv(null));
      requestId.current = newRequestId();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!req}
      onClose={onClose}
      title={req ? ACTION_LABEL[req.action] : ''}
      footer={
        pv ? (
          <>
            <Button title="Conferma" iconName="checkmark" busy={busy} onPress={confirm} disabled={!pv.changes.length && !pv.stateAfter} />
            <Button small title="Annulla" onPress={onClose} style={{ alignSelf: 'center' }} />
          </>
        ) : undefined
      }>
      {!pv && !err ? <Loading /> : null}
      {err ? <Banner tone="error" text={err} /> : null}
      {pv ? (
        <>
          <View style={{ gap: S.xs }}>
            <Text style={t.title}>Cosa cambia</Text>
            {pv.changes.length ? (
              pv.changes.map((c, i) => (
                <View key={c.sessionId}>
                  {i ? <Divider /> : null}
                  <View style={{ paddingVertical: S.sm, gap: 2 }}>
                    <Text style={t.body}>{c.label}</Text>
                    <Row gap={6}>
                      <Text style={t.small}>
                        {shortDate(c.before.date)} · {c.before.title || KIND_LABEL[c.before.kind]} · {fmtDuration(c.before.durationMin)}
                      </Text>
                      <Ionicons name="arrow-forward" size={12} color={color.textTertiary} />
                      <Text style={[t.small, { color: color.text }]}>
                        {c.after.status === 'paused' ? 'in pausa' : c.after.status === 'skipped' ? 'saltata' : `${shortDate(c.after.date)} · ${fmtDuration(c.after.durationMin)}`}
                      </Text>
                    </Row>
                  </View>
                </View>
              ))
            ) : (
              <Text style={t.muted}>Nessun allenamento coinvolto.</Text>
            )}
          </View>
          {pv.stateAfter ? <Text style={t.muted}>{pv.stateAfter.mode === 'active' ? 'Il piano torna attivo.' : pv.stateAfter.mode === 'vacation' ? `Modalità vacanza${pv.stateAfter.until ? ` fino al ${shortDate(pv.stateAfter.until)}` : ''}. Potrai cambiare la data di rientro.` : 'Il piano resta in pausa finché non lo riprendi. Storico e progressi restano dove sono.'}</Text> : null}
          <View style={{ gap: S.xs }}>
            <Text style={t.title}>Impatto sull’obiettivo</Text>
            <Text style={t.muted}>{pv.impact}</Text>
          </View>
          {req?.basis?.length ? (
            <View style={{ gap: S.xs }}>
              <Text style={t.title}>Perché te lo proponiamo</Text>
              {req.basis.map((b) => (
                <Text key={b} style={t.muted}>
                  · {b}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** Conferma appena applicata, con annullamento. */
export function UndoBanner({ change, onUndone, onDismiss }: { change: PlanChange; onUndone: () => void; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <View style={{ gap: S.xs }}>
      <Banner
        tone="success"
        text={`${ACTION_LABEL[change.action]}: fatto. Il calendario è aggiornato.`}
        action={busy ? undefined : 'Annulla la modifica'}
        onAction={async () => {
          setBusy(true);
          try {
            await call('undoPlanChange', change.id);
            onUndone();
          } catch (e) {
            setErr(humanError(e, 'Non annullata.'));
          } finally {
            setBusy(false);
          }
        }}
      />
      {err ? <Banner tone="error" text={err} /> : null}
      <Button small title="Chiudi" onPress={onDismiss} style={{ alignSelf: 'flex-end' }} />
    </View>
  );
}
