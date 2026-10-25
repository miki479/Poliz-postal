export type LocationIntent = 'tutorial' | 'read' | 'resume' | 'map' | 'record' | 'explore';
export interface LocationPermission { status: string; canAskAgain: boolean }
/** Only a location-dependent user action may trigger an OS dialog. Never reopening a screen. */
export async function contextualLocationPermission<P extends LocationPermission>(intent: LocationIntent, api: {
  getForegroundPermissionsAsync(): Promise<P>;
  requestForegroundPermissionsAsync(): Promise<P>;
}): Promise<P> {
  const current = await api.getForegroundPermissionsAsync();
  if (current.status === 'granted' || !current.canAskAgain || !['map', 'record', 'explore'].includes(intent)) return current;
  return api.requestForegroundPermissionsAsync();
}
