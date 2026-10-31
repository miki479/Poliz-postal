import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

/**
 * Registrazione GPS che continua con il telefono bloccato o l'app in background.
 * Android: servizio in primo piano con notifica fissa ("Runngo sta registrando"). iPhone: indicatore blu di sistema.
 * I punti arrivano dal task di sistema e vengono girati a chi ascolta (la schermata di registrazione), che li elabora come sempre.
 * Serve una build dell'app (in Expo Go il task non gira): in quel caso si resta sul GPS in primo piano.
 */
const TASK = 'runngo-background-gps';
type Listener = (loc: Location.LocationObject) => void;
let listener: Listener | null = null;
let running = false;

try {
  TaskManager.defineTask(TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations?: Location.LocationObject[] }>) => {
    if (error || !data?.locations) return;
    for (const loc of data.locations) listener?.(loc);
  });
} catch {
  /* Expo Go: il task non è disponibile */
}

export async function backgroundGpsAvailable(): Promise<boolean> {
  try { return await TaskManager.isAvailableAsync(); } catch { return false; }
}

/** Chiede il permesso "sempre" (necessario per il blocco schermo). Restituisce true se concesso. */
export async function ensureBackgroundPermission(): Promise<boolean> {
  try {
    const cur = await Location.getBackgroundPermissionsAsync();
    if (cur.status === 'granted') return true;
    const r = await Location.requestBackgroundPermissionsAsync();
    return r.status === 'granted';
  } catch {
    return false;
  }
}

export async function startBackgroundGps(onLocation: Listener): Promise<boolean> {
  if (!(await backgroundGpsAvailable()) || !(await ensureBackgroundPermission())) return false;
  listener = onLocation;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 3,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.Fitness,
      foregroundService: Platform.OS === 'android' ? { notificationTitle: 'Runngo sta registrando', notificationBody: 'Il tuo percorso è in registrazione. Tocca per tornare all’app.', notificationColor: '#8E75FF' } : undefined,
    });
    running = true;
    return true;
  } catch {
    listener = null;
    return false;
  }
}

export async function stopBackgroundGps(): Promise<void> {
  listener = null;
  if (!running) return;
  running = false;
  try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); } catch { /* già fermo */ }
}
