import { describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { createUser, emptyDb, toPublic } from '../shared/engine.ts';
import type { Me, ProfileView } from '../shared/types.ts';

const now = new Date('2026-10-25T12:00:00Z');
function setup() {
  const db = emptyDb();
  const user = createUser(db, now, { displayName: 'Miki', username: 'miki', hue: 1, profileCompleted: false });
  return { db, user, ctx: { db, actorId: user.id, now } };
}
describe('configurazione iniziale', () => {
  it('parte dopo la registrazione con le condivisioni facoltative spente', () => {
    const { user } = setup();
    expect(user.setup).toMatchObject({ step: 0, completedAt: null, weightKg: null, heightCm: null, groupMatching: false, heatmapConsent: false });
  });
  it('salva l’avanzamento, riprende e conserva preferenze/misure senza pubblicarle', () => {
    const { user, ctx, db } = setup();
    call(ctx, 'saveSetup', [{ step: 2, displayName: 'Michele', weightKg: 72.5, heightCm: 178 }]);
    expect((call(ctx, 'me', []) as Me).setup?.step).toBe(2);
    call(ctx, 'saveSetup', [{ step: 5, groupMatching: true, heatmapConsent: true }]);
    call(ctx, 'saveSetup', [{ complete: true }]);
    expect(user.setup).toMatchObject({ completedAt: now.toISOString(), weightKg: 72.5, groupMatching: true, heatmapConsent: true });
    expect(toPublic(db, user.id)).not.toHaveProperty('setup');
    const publicProfile = call(ctx, 'getProfile', [user.id]) as ProfileView;
    expect(publicProfile.user).not.toHaveProperty('setup');
    expect(JSON.stringify(publicProfile)).not.toContain('weightKg');
    call(ctx, 'saveSetup', [{ restart: true }]);
    expect(user.setup).toMatchObject({ step: 0, completedAt: null, weightKg: 72.5 });
  });
  it('consente di saltare le misure, azzerarle e non richiede GPS per completare', () => {
    const { user, ctx } = setup();
    call(ctx, 'saveSetup', [{ complete: true }]);
    expect(user.setup?.completedAt).toBe(now.toISOString());
    call(ctx, 'saveSetup', [{ weightKg: null, heightCm: null }]);
    expect(user.setup?.weightKg).toBeNull();
  });
  it('rifiuta misure impossibili, NaN, step falsi e consensi non booleani senza salvare metà richiesta', () => {
    const { user, ctx } = setup();
    for (const patch of [{ weightKg: -1 }, { heightCm: 900 }, { weightKg: NaN }, { groupMatching: 'yes' }, { step: 50 }]) {
      expect(() => call(ctx, 'saveSetup', [{ heatmapConsent: true, ...patch }])).toThrow();
      expect(user.setup?.heatmapConsent).toBe(false);
    }
    expect(() => call({ ...ctx, actorId: null }, 'saveSetup', [{ complete: true }])).toThrow();
  });
});
