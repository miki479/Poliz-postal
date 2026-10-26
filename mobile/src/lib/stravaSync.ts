import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { ext } from '@/lib/api';

let importedNotice = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useStravaImportNotice() {
  const count = useSyncExternalStore(subscribe, () => importedNotice, () => 0);
  return { count, dismiss: () => { importedNotice = 0; listeners.forEach((listener) => listener()); } };
}

/**
 * Sincronizzazione automatica con Strava: all'apertura dell'app e ogni volta che si torna in primo piano.
 * Parte solo se Strava è collegato e l'accesso non è stato revocato. Il server applica comunque una pausa di
 * 5 minuti tra due sincronizzazioni e un budget di richieste, quindi aprire l'app spesso non carica Strava.
 * È silenziosa: se fallisce non disturba, e lo stato dettagliato resta in Impostazioni → Strava.
 */
export function useAutoStravaSync(enabled: boolean, onSynced?: () => void) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const run = async () => {
      if (Date.now() - last.current < 60_000) return; // al massimo una verifica al minuto dal telefono
      last.current = Date.now();
      try {
        const s = await ext.strava.status();
        if (!s.configured || !s.connected || s.revoked) return;
        const r = await ext.strava.sync();
        if (r.summary.imported > 0) { importedNotice += r.summary.imported; listeners.forEach((listener) => listener()); }
        if (r.summary.imported || r.summary.updated) onSynced?.();
      } catch {
        /* silenzioso: riproverà alla prossima apertura */
      }
    };
    void run();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void run());
    return () => sub.remove();
  }, [enabled, onSynced]);
}
