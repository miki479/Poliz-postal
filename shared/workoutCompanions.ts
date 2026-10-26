import { AppError, notify, registerPurger, requireActorOf, toPublic, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import { companionsOf } from './companions.ts';
import type { Id, UserPublic } from './types.ts';
export interface WorkoutCompanion { id: Id; logId: Id; fromId: Id; toId: Id; status: 'pending' | 'accepted' | 'declined' | 'removed'; createdAt: string; respondedAt: string | null }
export interface CompanionCandidate { user: UserPublic; requestId: Id | null; status: WorkoutCompanion['status'] | 'none'; suggested: boolean; canRequest: boolean }
export interface CompanionRequestView { id: Id; from: UserPublic; createdAt: string; status: WorkoutCompanion['status'] }
const COOL = 30 * 86_400_000;
const rows = (ctx: Ctx) => Object.values(ctx.db.workoutCompanions ?? {});
function owned(ctx: Ctx, logId: Id) { const me = requireActorOf(ctx); const log = ctx.db.workoutLogs[logId]; if (!log || log.userId !== me.id) throw new AppError('not_found', 'Allenamento non trovato.'); return log; }
function last(ctx: Ctx, logId: Id, toId: Id) { return rows(ctx).filter((r) => r.logId === logId && r.toId === toId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0]; }
const cooling = (ctx: Ctx, r?: WorkoutCompanion) => !!r && (r.status === 'declined' || r.status === 'removed') && ctx.now.getTime() - Date.parse(r.respondedAt ?? r.createdAt) < COOL;
export function workoutCompanionContext(ctx: Ctx, logId: Id): CompanionCandidate[] {
 const log = owned(ctx, logId);
 // GPS propone soltanto candidati: non conferma mai una corsa in compagnia.
 const suggested = new Set(log.origin !== 'strava' && log.shared ? companionsOf(ctx.db, log).map((u) => u.id) : []);
 const ids = new Set(Object.values(ctx.db.follows).filter((f) => f.fromId === log.userId).map((f) => f.toId));
 for (const r of rows(ctx)) if (r.logId === logId) ids.add(r.toId);
 return [...ids].filter((id) => !!ctx.db.users[id] && id !== log.userId).map((id) => { const r = last(ctx, logId, id); const follows = Object.values(ctx.db.follows).some((f) => f.fromId === log.userId && f.toId === id); return { user: toPublic(ctx.db,id), requestId: r?.id ?? null, status: r?.status ?? 'none', suggested: suggested.has(id), canRequest: follows && !cooling(ctx,r) && r?.status !== 'accepted' && r?.status !== 'pending' }; });
}
export function requestWorkoutCompanion(ctx: Ctx, logId: Id, toId: Id): WorkoutCompanion {
 const log = owned(ctx,logId); const me = requireActorOf(ctx);
 if (!ctx.db.users[toId] || toId === me.id || !Object.values(ctx.db.follows).some((f) => f.fromId === me.id && f.toId === toId)) throw new AppError('forbidden', 'Puoi chiedere conferma soltanto alle persone che segui.');
 const previous = last(ctx,logId,toId);
 if (previous?.status === 'pending' || previous?.status === 'accepted') return previous;
 if (cooling(ctx,previous)) throw new AppError('rate_limited', 'Questa persona ha rifiutato o rimosso il collegamento. Attendi prima di chiedere di nuovo.');
 if (rows(ctx).filter((r) => r.fromId === me.id && r.status === 'pending').length >= 30) throw new AppError('rate_limited', 'Hai già molte richieste in attesa.');
 const r: WorkoutCompanion = { id:newId('wco'),logId:log.id,fromId:me.id,toId,status:'pending',createdAt:ctx.now.toISOString(),respondedAt:null };
 (ctx.db.workoutCompanions ??= {})[r.id] = r;
 // Non rivela titolo, metriche, tracciato o data di attività private/Strava.
 notify(ctx,toId,'workout_companion',`${me.displayName} chiede conferma di una corsa insieme. Puoi accettare o rifiutare dalle notifiche.`,{});
 return r;
}
export function myWorkoutCompanionRequests(ctx: Ctx): CompanionRequestView[] {
 const me = requireActorOf(ctx);
 return rows(ctx).filter((r) => r.toId === me.id && r.status === 'pending' && !!ctx.db.users[r.fromId] && !!ctx.db.workoutLogs[r.logId]).map((r) => ({ id:r.id,from:toPublic(ctx.db,r.fromId),createdAt:r.createdAt,status:r.status }));
}
export function respondWorkoutCompanion(ctx: Ctx, id: Id, accept: boolean): { status: WorkoutCompanion['status'] } {
 const me = requireActorOf(ctx); const r = ctx.db.workoutCompanions?.[id];
 if (!r || r.toId !== me.id || !ctx.db.workoutLogs[r.logId] || !ctx.db.users[r.fromId]) throw new AppError('not_found','Richiesta non trovata.');
 if (typeof accept !== 'boolean') throw new AppError('validation','Scegli se confermare o rifiutare.');
 if (r.status !== 'pending') return { status:r.status };
 r.status = accept ? 'accepted':'declined'; r.respondedAt = ctx.now.toISOString();
 notify(ctx,r.fromId,'workout_companion',`${me.displayName} ha ${accept ? 'confermato':'rifiutato'} il collegamento alla corsa.`,{});
 return { status:r.status };
}
export function removeWorkoutCompanion(ctx: Ctx, id: Id): { removed:true } {
 const me = requireActorOf(ctx); const r = ctx.db.workoutCompanions?.[id];
 if (!r || (r.fromId !== me.id && r.toId !== me.id)) throw new AppError('not_found','Collegamento non trovato.');
 r.status = 'removed'; r.respondedAt = ctx.now.toISOString(); return {removed:true};
}
registerPurger((ctx,id) => { for (const r of rows(ctx)) if (r.fromId === id || r.toId === id) delete ctx.db.workoutCompanions[r.id]; });
export const companionMethods = { workoutCompanionContext, requestWorkoutCompanion, myWorkoutCompanionRequests, respondWorkoutCompanion, removeWorkoutCompanion };
export const COMPANIONS_READ_ONLY = ['workoutCompanionContext','myWorkoutCompanionRequests'];
