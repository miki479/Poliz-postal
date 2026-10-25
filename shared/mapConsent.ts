import type { WorkoutLog } from './types.ts';

/** Un solo consenso effettivo anche per i client che usano il nome precedente. */
export function hasMapConsent(log: WorkoutLog): boolean {
  return (log.origin == null || log.origin === 'app') &&
    (typeof log.mapShared === 'boolean' ? log.mapShared : log.heatmapConsent === true);
}
