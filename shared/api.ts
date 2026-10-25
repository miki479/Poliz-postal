import { saveSetup } from './setup.ts';
import { nearbyHeatmap } from './heatmap.ts';
import { AppError, coreMethods, type Ctx } from './engine.ts';
import { challengeMethods, finalizeDueChallenges } from './challenges.ts';
import { importMethods } from './importing.ts';
import { routeMethods } from './routes.ts';
import { statsMethods } from './stats.ts';
import { trainingMethods } from './training.ts';
import { ADAPTIVE_READ_ONLY, adaptiveMethods } from './adaptive.ts';
import { FAME_READ_ONLY, fameMethods } from './fame.ts';
import { GOALS_READ_ONLY, goalMethods } from './goals.ts';
import { getPerformances } from './performances.ts';
import { runCompanions } from './companions.ts';
import { SOCIAL_READ_ONLY, socialMethods } from './social.ts';
import { INVITES_READ_ONLY, inviteMethods } from './invites.ts';

/** Registro chiuso di tutti i metodi invocabili dall'esterno (HTTP o client demo). */
export const methods = {
  saveSetup,
  nearbyHeatmap,
  ...coreMethods,
  ...statsMethods,
  ...challengeMethods,
  ...routeMethods,
  ...trainingMethods,
  ...importMethods,
  ...adaptiveMethods,
  ...fameMethods,
  ...goalMethods,
  getPerformances,
  runCompanions,
  ...socialMethods,
  ...inviteMethods,
} as const;

export type MethodName = keyof typeof methods;

/** Metodi consentiti anche senza sessione (la logica interna decide cosa mostrare). */
export const PUBLIC_METHODS = new Set<MethodName>(['me', 'listEvents', 'getEvent', 'clubByCode', 'getChallenge', 'getRoute', 'listRoutes']);
/** Metodi che non modificano i dati: il server non riscrive il file. */
export const READ_ONLY_METHODS = new Set<string>(['me', 'listEvents', 'getEvent', 'clubByCode', 'listMyClubs', 'getClub', 'clubLeaderboard', 'getProfile', 'listBadges', 'getFeed', 'getHome', 'listNotifications', 'getStats', 'listActivities', 'getChallenge', 'listChallenges', 'getRoute', 'listRoutes', 'listSessions', 'getSession', 'listWorkoutLogs', 'getWorkoutLog', 'previewPlan', 'listPlans', 'listRoutines', 'weekSummary', 'trainingProgress', 'strengthProgress', ...ADAPTIVE_READ_ONLY, ...FAME_READ_ONLY, ...GOALS_READ_ONLY, 'getPerformances', 'runCompanions', 'nearbyHeatmap', ...SOCIAL_READ_ONLY, ...INVITES_READ_ONLY]);

type Tail<T> = T extends (ctx: Ctx, ...rest: infer R) => infer Ret ? (...args: R) => Promise<Ret> : never;
export type Api = { [K in MethodName]: Tail<(typeof methods)[K]> };

export function call(ctx: Ctx, method: string, args: unknown[]): unknown {
  if (!Object.prototype.hasOwnProperty.call(methods, method)) throw new AppError('bad_request', 'Metodo sconosciuto.');
  // Prima di qualsiasi operazione: congela le sfide scadute, così modifiche successive alle attività non ne alterano il risultato.
  finalizeDueChallenges(ctx);
  const fn = methods[method as MethodName] as (ctx: Ctx, ...a: unknown[]) => unknown;
  return fn(ctx, ...args);
}
