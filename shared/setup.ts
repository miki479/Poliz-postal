import { AppError, type Ctx } from './engine.ts';
import type { Me, SetupPreferences } from './types.ts';

/** Private onboarding state. Preferences do not publish GPS tracks or infer sensor readings. */
export function saveSetup(ctx: Ctx, raw: unknown): Me {
  const user = ctx.actorId ? ctx.db.users[ctx.actorId] : null;
  if (!user) throw new AppError('unauthenticated', 'Accedi per continuare.');
  if (!raw || typeof raw !== 'object') throw new AppError('validation', 'Configurazione non valida.');
  const input = raw as Record<string, unknown>;
  const current: SetupPreferences = user.setup ?? { version: 1, step: 0, completedAt: null, weightKg: null, heightCm: null, groupMatching: false, heatmapConsent: false };
  const next = { ...current };
  const errors: Record<string, string> = {};
  for (const [key, min, max, label] of [['weightKg', 20, 350, 'Peso'], ['heightCm', 80, 250, 'Altezza']] as const) {
    if (!(key in input)) continue;
    const n = input[key];
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)) errors[key] = `${label}: inserisci un valore tra ${min} e ${max}, oppure lascia vuoto.`;
    else next[key] = n as number | null;
  }
  for (const key of ['groupMatching', 'heatmapConsent'] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'boolean') errors[key] = 'Scelta non valida.';
    else next[key] = input[key] as boolean;
  }
  if ('step' in input) {
    if (!Number.isInteger(input.step) || Number(input.step) < 0 || Number(input.step) > 5) errors.step = 'Passaggio non valido.';
    else next.step = Number(input.step);
  }
  if (input.restart === true) { next.step = 0; next.completedAt = null; }
  if (input.complete === true) { next.step = 5; next.completedAt = ctx.now.toISOString(); }
  if (Object.keys(errors).length) throw new AppError('validation', 'Controlla i campi.', errors);
  if ('displayName' in input) {
    if (typeof input.displayName !== 'string' || input.displayName.trim().length < 2 || input.displayName.trim().length > 30) throw new AppError('validation', 'Il nome deve avere da 2 a 30 caratteri.', { displayName: 'Da 2 a 30 caratteri.' });
    user.displayName = input.displayName.trim();
  }
  user.setup = next;
  return user;
}
