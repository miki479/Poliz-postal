import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TrackPoint } from '@shared/types.ts';

/**
 * Bozza della registrazione in corso, salvata sul telefono ogni pochi secondi, in pausa e quando l'app va in
 * background. Se l'app viene chiusa o il salvataggio sul server fallisce, l'attività si recupera da qui.
 */
export interface RecordingDraft {
  v: 1;
  startedAt: string;
  sport: 'running' | 'walking';
  environment: 'outdoor' | 'treadmill';
  sessionId: string | null;
  eventId: string | null;
  shared: boolean;
  /** Scelta esplicita prima dell'avvio; facoltativa per le bozze già presenti. */
  gearId?: string | null;
  track: TrackPoint[];
  km: number;
  /** Millisecondi totali in pausa (escluse le pause in corso). */
  pausedMs: number;
  pausedAt: number | null;
  gaps: number;
  lostSec: number;
  savedAt: number;
  /** 'finished' = terminata ma non ancora salvata sul server (es. rete assente). */
  status: 'recording' | 'paused' | 'finished';
  endedAt: number | null;
}

const KEY = 'runngo.recording.v1';

export async function saveDraft(d: RecordingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* memoria piena o non disponibile: la registrazione in corso continua comunque */
  }
}

export async function loadDraft(): Promise<RecordingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as RecordingDraft;
    return d && d.v === 1 && Array.isArray(d.track) ? d : null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}

/** Secondi di attività effettiva (tempo reale meno le pause). */
export function activeSec(d: Pick<RecordingDraft, 'startedAt' | 'pausedMs' | 'pausedAt' | 'endedAt'>, now = Date.now()): number {
  const end = d.endedAt ?? now;
  const pausing = d.pausedAt ? end - d.pausedAt : 0;
  return Math.max(0, Math.floor((end - Date.parse(d.startedAt) - d.pausedMs - pausing) / 1000));
}

/** Passo degli ultimi ~30 s di traccia (null se i dati non bastano). */
export function currentPace(track: TrackPoint[], dist: (a: TrackPoint, b: TrackPoint) => number): number | null {
  if (track.length < 2) return null;
  const last = track[track.length - 1];
  let i = track.length - 2;
  while (i > 0 && last.t - track[i].t < 30) i--;
  let km = 0;
  for (let j = i + 1; j < track.length; j++) km += dist(track[j - 1], track[j]);
  const sec = last.t - track[i].t;
  return km >= 0.05 && sec > 0 ? sec / km : null;
}
