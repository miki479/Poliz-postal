/** Pure orchestration: native SDK identity is never trusted until the API verifies its token. */
export interface GoogleSdk {
  configure(config: { webClientId: string; iosClientId?: string; offlineAccess: boolean }): void;
  hasPlayServices(options: { showPlayServicesUpdateDialog: boolean }): Promise<boolean>;
  signIn(): Promise<{ type: 'cancelled' } | { type: 'success'; data: { idToken: string | null } }>;
}
export async function completeGoogleSignIn(options: {
  platform: string; expoGo: boolean; webClientId: string | null; iosClientId?: string;
  loadSdk(): Promise<GoogleSdk>; acceptToken(token: string): Promise<void>;
}): Promise<boolean> {
  if (options.expoGo) throw new Error('Per accedere con Google serve la versione Runngo installata sul telefono. In Expo Go puoi usare email e password.');
  if (options.platform !== 'ios' && options.platform !== 'android') throw new Error('Questo accesso Google è per l’app iPhone e Android. Qui puoi usare email e password.');
  if (!options.webClientId) throw new Error('L’accesso Google non è ancora configurato sul server. Puoi usare email e password.');
  if (options.platform === 'ios' && !options.iosClientId) throw new Error('L’accesso Google non è ancora configurato per questa versione iPhone. Puoi usare email e password.');
  const sdk = await options.loadSdk();
  sdk.configure({ webClientId: options.webClientId, ...(options.iosClientId ? { iosClientId: options.iosClientId } : {}), offlineAccess: false });
  if (options.platform === 'android' && !await sdk.hasPlayServices({ showPlayServicesUpdateDialog: true })) throw new Error('Google Play Services non è disponibile su questo telefono. Usa email e password.');
  const response = await sdk.signIn();
  if (response.type !== 'success') return false;
  if (!response.data.idToken) throw new Error('Google non ha restituito un token di accesso valido. Riprova o usa email e password.');
  await options.acceptToken(response.data.idToken);
  return true;
}
