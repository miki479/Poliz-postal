import type { IconName } from '@/components/ui';
import type { AdjustAction, PlannedSession } from '@shared/types.ts';

export type Tone = 'default' | 'accent' | 'success' | 'danger' | 'warn' | 'brand';

/**
 * Stato mostrato di un allenamento. "Non registrata" e "In attesa di sincronizzazione" sono DERIVATI:
 * non vengono mai salvati, quindi un'importazione in ritardo non marca nulla come "non svolto".
 */
export function sessionOutcome(s: PlannedSession, today: string, sync: { connected: boolean; lastSyncAt: string | null }): { label: string; tone: Tone; icon: IconName } {
  if (s.manualDone) return { label: 'Fatta · dichiarata, senza registrazione', tone: 'default', icon: 'checkbox-outline' };
  if (s.status === 'completed') return { label: s.linkedActivityId ? 'Completata · corsa associata' : 'Completata', tone: 'success', icon: 'checkmark-circle' };
  if (s.status === 'skipped') return { label: 'Saltata per scelta', tone: 'default', icon: 'remove-circle-outline' };
  if (s.status === 'paused') return { label: 'In pausa', tone: 'default', icon: 'pause-circle-outline' };
  if (s.date < today) {
    if (sync.connected && (!sync.lastSyncAt || sync.lastSyncAt.slice(0, 10) <= s.date)) return { label: 'In attesa di sincronizzazione', tone: 'accent', icon: 'sync-outline' };
    return { label: 'Non registrata', tone: 'warn', icon: 'help-circle-outline' };
  }
  const adj = s.adjustment?.action;
  if (adj === 'swap_easy') return { label: 'Sostituita con corsa facile', tone: 'accent', icon: 'swap-horizontal' };
  if (adj === 'shorten') return { label: 'Ridotta', tone: 'accent', icon: 'contract-outline' };
  if (s.status === 'rescheduled') return { label: 'Spostata', tone: 'accent', icon: 'calendar-outline' };
  return { label: s.date === today ? 'Oggi' : 'Da fare', tone: s.date === today ? 'accent' : 'default', icon: 'ellipse-outline' };
}

export const ACTION_LABEL: Record<AdjustAction, string> = {
  swap_easy: 'Alternativa leggera',
  shorten: 'Riduci la durata',
  move: 'Sposta l’allenamento',
  skip: 'Salta l’allenamento',
  pause: 'Metti in pausa il piano',
  vacation: 'Modalità vacanza',
  resume: 'Riprendi il piano',
};

export const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const shortDate = (day: string) => new Date(day + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
