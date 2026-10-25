import { AppError, requireActorOf, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { WorkoutLog } from './types.ts';

export type GearSport = 'running' | 'walking' | 'trail';
export interface Gear {
  id: string; userId: string; name: string; sport: GearSport; initialKm: number | null;
  retired: boolean; createdAt: string; updatedAt: string;
}
export interface GearInput { name: string; sport: GearSport; initialKm: number | null }
export interface GearView extends Gear { usedKm: number; activities: number; missingDistanceActivities: number; totalKm: number | null }
export const GEAR_SPORT_LABEL: Record<GearSport, string> = { running: 'Corsa', walking: 'Camminata', trail: 'Trail' };
const roundKm = (n: number) => Math.round(n * 100) / 100;

function own(ctx: Ctx, id: string): Gear {
  const user = requireActorOf(ctx); const gear = ctx.db.gear?.[id];
  if (!gear || gear.userId !== user.id) throw new AppError('not_found', 'Attrezzatura non trovata.');
  return gear;
}
function measured(log: WorkoutLog): boolean {
  return (log.origin == null || log.origin === 'app') && typeof log.distanceKm === 'number' && Number.isFinite(log.distanceKm) && log.distanceKm > 0;
}
function view(ctx: Ctx, gear: Gear): GearView {
  const logs = Object.values(ctx.db.workoutLogs).filter((l) => l.userId === gear.userId && l.gearId === gear.id && (l.origin == null || l.origin === 'app'));
  const known = logs.filter(measured);
  const usedKm = roundKm(known.reduce((sum, l) => sum + l.distanceKm!, 0));
  const missingDistanceActivities = logs.length - known.length;
  return { ...gear, usedKm, activities: logs.length, missingDistanceActivities, totalKm: gear.initialKm == null || missingDistanceActivities > 0 ? null : roundKm(gear.initialKm + usedKm) };
}

export function listGear(ctx: Ctx, includeRetired = true): GearView[] {
  const me = requireActorOf(ctx);
  return Object.values(ctx.db.gear ?? {}).filter((g) => g.userId === me.id && (includeRetired !== false || !g.retired)).map((g) => view(ctx, g)).sort((a, b) => Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name, 'it'));
}

/** Il chilometraggio iniziale è sempre dichiarato dalla persona, mai dedotto dall'età o dalla marca. */
export function saveGear(ctx: Ctx, input: GearInput, id?: string | null): GearView {
  const me = requireActorOf(ctx);
  const existing = id == null ? null : own(ctx, id);
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 80) throw new AppError('validation', 'Scegli un nome tra 2 e 80 caratteri.');
  if (!['running', 'walking', 'trail'].includes(input?.sport)) throw new AppError('validation', 'Scegli corsa, camminata o trail.');
  const km = input?.initialKm;
  if (km !== null && (typeof km !== 'number' || !Number.isFinite(km) || km < 0 || km > 100000)) throw new AppError('validation', 'Indica i chilometri iniziali, oppure lascia il campo vuoto.');
  if (!existing && Object.values(ctx.db.gear ?? {}).filter((g) => g.userId === me.id).length >= 100) throw new AppError('validation', 'Hai raggiunto il limite di 100 elementi di attrezzatura.');
  const now = ctx.now.toISOString();
  const gear: Gear = existing ? { ...existing, name, sport: input.sport, initialKm: km == null ? null : roundKm(km), updatedAt: now } : { id: newId('gear'), userId: me.id, name, sport: input.sport, initialKm: km == null ? null : roundKm(km), retired: false, createdAt: now, updatedAt: now };
  // Cambiare il tipo non riclassifica le attività già registrate.
  ctx.db.gear ??= {}; ctx.db.gear[gear.id] = gear;
  return view(ctx, gear);
}

export function setGearRetired(ctx: Ctx, id: string, retired: boolean): GearView {
  const gear = own(ctx, id);
  if (typeof retired !== 'boolean') throw new AppError('validation', 'Scegli se mettere a riposo questa attrezzatura.');
  gear.retired = retired; gear.updatedAt = ctx.now.toISOString();
  return view(ctx, gear);
}

export function setWorkoutGear(ctx: Ctx, logId: string, gearId: string | null): { id: string; gearId: string | null } {
  const me = requireActorOf(ctx); const log = ctx.db.workoutLogs[logId];
  if (!log || log.userId !== me.id) throw new AppError('not_found', 'Attività non trovata.');
  if (log.origin != null && log.origin !== 'app') throw new AppError('forbidden', 'Associa l’attrezzatura solo alle attività registrate in Runngo.');
  if (gearId !== null && typeof gearId !== 'string') throw new AppError('validation', 'Scegli la tua attrezzatura.');
  if (gearId !== null) {
    const gear = own(ctx, gearId);
    if (gear.retired && log.gearId !== gear.id) throw new AppError('validation', 'Questa attrezzatura è a riposo. Riattivala prima di associarla.');
    // Il tipo è una preferenza dichiarata dell'attrezzatura: usarla non riclassifica l'attività.
  }
  log.gearId = gearId; log.updatedAt = ctx.now.toISOString();
  return { id: log.id, gearId };
}

export const gearMethods = { listGear, saveGear, setGearRetired, setWorkoutGear };
export const GEAR_READ_ONLY = ['listGear'];
