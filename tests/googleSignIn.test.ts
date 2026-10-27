import { describe, expect, it, vi } from 'vitest';
import { completeGoogleSignIn, type GoogleSdk } from '../mobile/src/lib/googleSignInFlow.ts';
function setup() {
  const sdk: GoogleSdk = {
    configure: vi.fn(), hasPlayServices: vi.fn(async () => true),
    signIn: vi.fn(async () => ({ type: 'success' as const, data: { idToken: 'signed-google-id-token' } })),
  };
  const options = { platform: 'android', expoGo: false, webClientId: 'web-client.apps.googleusercontent.com', loadSdk: vi.fn(async () => sdk), acceptToken: vi.fn(async (_token: string) => {}) };
  return { sdk, options };
}
describe('Google Sign-In nativo', () => {
  it('apre il provider e completa la sessione SOLO dopo la verifica API del token', async () => {
    const { sdk, options } = setup();
    expect(await completeGoogleSignIn(options)).toBe(true);
    expect(sdk.configure).toHaveBeenCalledWith({ webClientId: options.webClientId, offlineAccess: false });
    expect(sdk.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
    expect(options.acceptToken).toHaveBeenCalledTimes(1);
    expect(options.acceptToken).toHaveBeenCalledWith('signed-google-id-token');
  });
  it('un annullamento non autentica e non diventa un falso successo', async () => {
    const { sdk, options } = setup();
    vi.mocked(sdk.signIn).mockResolvedValue({ type: 'cancelled' });
    expect(await completeGoogleSignIn(options)).toBe(false);
    expect(options.acceptToken).not.toHaveBeenCalled();
  });
  it('propaga il rifiuto del server senza accettare il profilo dichiarato dal client', async () => {
    const { options } = setup();
    options.acceptToken.mockRejectedValue(new Error('Firma non valida'));
    await expect(completeGoogleSignIn(options)).rejects.toThrow('Firma non valida');
  });
  it('non importa moduli nativi in Expo Go, sul web o senza la configurazione richiesta', async () => {
    for (const patch of [{ expoGo: true }, { platform: 'web' }, { webClientId: null }, { platform: 'ios' }]) {
      const { options } = setup();
      await expect(completeGoogleSignIn({ ...options, ...patch })).rejects.toThrow();
      expect(options.loadSdk).not.toHaveBeenCalled();
      expect(options.acceptToken).not.toHaveBeenCalled();
    }
  });
  it('su iOS configura il Client ID iOS e usa comunque il Web Client ID del server per l’ID token', async () => {
    const { sdk, options } = setup();
    await completeGoogleSignIn({ ...options, platform: 'ios', iosClientId: 'ios-client.apps.googleusercontent.com' });
    expect(sdk.configure).toHaveBeenCalledWith({ webClientId: options.webClientId, iosClientId: 'ios-client.apps.googleusercontent.com', offlineAccess: false });
    expect(sdk.hasPlayServices).not.toHaveBeenCalled();
  });
  it('senza Play Services o senza ID token non tenta l’accesso API', async () => {
    const { sdk, options } = setup();
    vi.mocked(sdk.hasPlayServices).mockResolvedValue(false);
    await expect(completeGoogleSignIn(options)).rejects.toThrow('Play Services');
    vi.mocked(sdk.hasPlayServices).mockResolvedValue(true);
    vi.mocked(sdk.signIn).mockResolvedValue({ type: 'success', data: { idToken: null } });
    await expect(completeGoogleSignIn(options)).rejects.toThrow('token');
    expect(options.acceptToken).not.toHaveBeenCalled();
  });
});
