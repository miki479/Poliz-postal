import { useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { call } from '@/lib/api';
import type { EventView } from '@shared/types.ts';

/**
 * Iscrizione/annullamento a un'uscita con stati espliciti. Un riferimento "in volo" blocca i tap ripetuti:
 * niente doppie richieste anche se l'interfaccia non ha ancora ridisegnato il pulsante disabilitato.
 */
export function useJoin(onChange: (e: EventView) => void) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'joined' | 'left' | null>(null);

  async function run(kind: 'join' | 'leave', id: string, token?: string | null) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const e = await call<EventView>(kind === 'join' ? 'joinEvent' : 'leaveEvent', id, ...(kind === 'join' ? [token ?? null] : []));
      onChange(e);
      setDone(kind === 'join' ? 'joined' : 'left');
      AccessibilityInfo.announceForAccessibility(kind === 'join' ? 'Iscrizione confermata' : 'Partecipazione annullata');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non riuscito. Riprova.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { join: (id: string, token?: string | null) => run('join', id, token), leave: (id: string) => run('leave', id), busy, error, done };
}
