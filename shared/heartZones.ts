export interface HeartZones { custom: boolean; zones: Array<{ min: number; max: number }> }
export interface HeartZonesResult { zones: HeartZones | null; needsReconnect?: boolean; unavailable?: boolean }

/** Solo soglie fornite da Strava: nessuna formula basata sull'età o stima della frequenza massima. */
export function parseHeartZones(value: unknown): HeartZones | null {
  const heart = (value as { heart_rate?: HeartZones } | null)?.heart_rate;
  if (!heart || typeof heart.custom !== 'boolean' || !Array.isArray(heart.zones) || !heart.zones.length || heart.zones.length > 10) return null;
  const valid = heart.zones.every((z, i, all) => z && Number.isFinite(z.min) && z.min >= 0 && z.min <= 300 && Number.isFinite(z.max) && ((z.max === -1 && i === all.length - 1) || (z.max > z.min && z.max <= 300)) && (i === 0 || z.min >= all[i - 1].max));
  return valid ? { custom: heart.custom, zones: heart.zones.map(({ min, max }) => ({ min, max })) } : null;
}
