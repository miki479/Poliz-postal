import type { ParsedActivity } from '@shared/importers.ts';
import type { SportId } from '@shared/types.ts';

/**
 * Dati sanitari di Google (Health Connect), solo lettura e solo su Android con una build dell'app (non in Expo Go).
 * Si leggono le sessioni di corsa e camminata degli ultimi 90 giorni con la distanza registrata dalla sorgente: nessuna stima.
 * Le attività importate restano private, come quelle da file o da Strava.
 */
type HC = typeof import('react-native-health-connect');
const load = (): HC | null => {
  try { return require('react-native-health-connect') as HC; } catch { return null; }
};

export type HealthState = 'unavailable' | 'needs-install' | 'ready';

export async function healthState(): Promise<HealthState> {
  const hc = load();
  if (!hc) return 'unavailable';
  try {
    const s = await hc.getSdkStatus();
    if (s === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return 'ready';
    return s === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ? 'needs-install' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function readHealthRuns(days = 90): Promise<{ activities: ParsedActivity[]; skipped: number }> {
  const hc = load();
  if (!hc) throw new Error('Dati sanitari non disponibili in questa versione dell’app.');
  await hc.initialize();
  const granted = await hc.requestPermission([{ accessType: 'read', recordType: 'ExerciseSession' }, { accessType: 'read', recordType: 'Distance' }]);
  if (!granted.some((p) => 'recordType' in p && p.recordType === 'ExerciseSession')) throw new Error('Permesso non concesso: puoi darlo dalle impostazioni di Health Connect.');
  const T = hc.ExerciseType;
  const map = new Map<number, { sport: SportId; title: string }>([
    [T.RUNNING, { sport: 'running', title: 'Corsa' }],
    [T.RUNNING_TREADMILL, { sport: 'running', title: 'Corsa su tapis roulant' }],
    [T.WALKING, { sport: 'walking', title: 'Camminata' }],
    [T.HIKING, { sport: 'trail', title: 'Escursione' }],
  ]);
  const startTime = new Date(Date.now() - days * 86_400_000).toISOString();
  const { records } = await hc.readRecords('ExerciseSession', { timeRangeFilter: { operator: 'between', startTime, endTime: new Date().toISOString() } });
  const out: ParsedActivity[] = [];
  let skipped = 0;
  for (const r of records) {
    const kind = map.get(r.exerciseType);
    if (!kind) { skipped++; continue; }
    let km: number | null = null;
    try {
      const a = await hc.aggregateRecord({ recordType: 'Distance', timeRangeFilter: { operator: 'between', startTime: r.startTime, endTime: r.endTime } });
      const m = a.DISTANCE?.inMeters ?? 0;
      km = m > 50 ? Math.round(m / 10) / 100 : null;
    } catch {
      km = null;
    }
    const min = Math.round((Date.parse(r.endTime) - Date.parse(r.startTime)) / 60_000);
    if (min < 1) { skipped++; continue; }
    out.push({ externalId: `hc:${r.metadata?.id ?? r.startTime}`, sport: kind.sport, title: r.title?.trim() || kind.title, date: r.startTime, distanceKm: km, durationMin: min, durationSec: min * 60 });
  }
  return { activities: out, skipped };
}
