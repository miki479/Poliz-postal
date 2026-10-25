import { describe, expect, it, vi } from 'vitest';
import { contextualLocationPermission, type LocationIntent } from '../mobile/src/lib/locationPermissionPolicy.ts';
function api(status = 'undetermined', canAskAgain = true) {
  return { getForegroundPermissionsAsync: vi.fn(async () => ({ status, canAskAgain })), requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'granted', canAskAgain: true })) };
}
describe('permesso GPS nel contesto giusto', () => {
  it('tutorial, lettura e ripresa non aprono il dialogo di sistema', async () => {
    for (const intent of ['tutorial', 'read', 'resume'] as LocationIntent[]) {
      const location = api();
      expect((await contextualLocationPermission(intent, location)).status).toBe('undetermined');
      expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    }
  });
  it('lo chiede dopo un’azione esplicita su mappa, registrazione o esplorazione', async () => {
    for (const intent of ['map', 'record', 'explore'] as LocationIntent[]) {
      const location = api();
      expect((await contextualLocationPermission(intent, location)).status).toBe('granted');
      expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    }
  });
  it('non richiede nuovamente un permesso concesso o bloccato dal sistema', async () => {
    for (const location of [api('granted'), api('denied', false)]) {
      await contextualLocationPermission('record', location);
      expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    }
  });
  it('rispetta il rifiuto, senza convertirlo in consenso né riprovare automaticamente', async () => {
    const location = api();
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    expect(await contextualLocationPermission('map', location)).toEqual({ status: 'denied', canAskAgain: false });
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
