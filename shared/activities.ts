import { newId } from './ids.ts';
import type { Activity, ActivityClass, DbState, Id, SportId } from './types.ts';

export const SOURCE_LABEL: Record<Activity['source'], string> = {
  manual: 'Inserita a mano',
  event: 'Registrata dopo un\'uscita',
  strava: 'Importata da Strava',
  file: 'Importata da file',
};

/** Classe di affidabilità. Nessuna fonte attuale produce "verified": l'app non certifica mai i dati. */
export function activityClass(a: Pick<Activity, 'source'>): ActivityClass {
  return a.source === 'strava' || a.source === 'file' ? 'imported' : 'self_declared';
}

export const CLASS_LABEL: Record<ActivityClass, string> = {
  self_declared: 'Autodichiarata',
  imported: 'Importata',
  verified: 'Verificata',
};

export function newActivity(now: Date, p: Partial<Activity> & Pick<Activity, 'userId' | 'source' | 'sport' | 'date'>): Activity {
  const t = now.toISOString();
  return {
    id: newId('act'),
    eventId: null,
    externalId: null,
    title: '',
    dayOnly: false,
    distanceKm: null,
    durationMin: null,
    note: '',
    // I dati Strava restano privati: le condizioni dell'API non ne consentono la visualizzazione ad altri utenti.
    visibility: p.source === 'strava' || p.source === 'file' ? 'private' : 'shared',
    planSessionId: null,
    importedAt: p.source === 'strava' || p.source === 'file' ? t : null,
    createdAt: t,
    updatedAt: t,
    ...p,
  };
}

export interface DupCandidate {
  userId: Id;
  sport: SportId;
  date: string;
  dayOnly: boolean;
  distanceKm: number | null;
  durationMin: number | null;
}

/**
 * Deduplicazione tra fonti diverse: stessa persona e sport, partenza vicina nel tempo
 * (±30 min, oppure nello stesso giorno se una delle due ha solo la data) e distanza/durata compatibili.
 */
export function findDuplicate(db: DbState, c: DupCandidate, exceptId?: Id): Activity | null {
  const t = Date.parse(c.date);
  for (const a of Object.values(db.activities)) {
    if (a.userId !== c.userId || a.id === exceptId || a.sport !== c.sport) continue;
    const dt = Math.abs(Date.parse(a.date) - t);
    const loose = a.dayOnly || c.dayOnly;
    if (dt > (loose ? 12 * 3_600_000 : 30 * 60_000)) continue;
    if (a.distanceKm !== null && c.distanceKm !== null) {
      if (Math.abs(a.distanceKm - c.distanceKm) <= Math.max(0.3, 0.05 * Math.max(a.distanceKm, c.distanceKm))) return a;
      continue;
    }
    if (a.durationMin !== null && c.durationMin !== null) {
      if (Math.abs(a.durationMin - c.durationMin) <= Math.max(3, 0.1 * Math.max(a.durationMin, c.durationMin))) return a;
      continue;
    }
    if (dt <= 5 * 60_000) return a; // nessuna metrica confrontabile: stessa partenza
  }
  return null;
}
