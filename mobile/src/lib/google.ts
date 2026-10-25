import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { health } from './api';
import { completeGoogleSignIn } from './googleSignInFlow';

let inProgress = false;
/** Imported only after the Expo Go guard: missing native modules must never crash the login screen. */
export async function signInGoogle(acceptToken: (token: string) => Promise<void>): Promise<boolean> {
  if (inProgress) return false;
  inProgress = true;
  try {
    const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    const status = expoGo ? null : await health();
    if (!expoGo && !status) throw new Error('Non riesco a raggiungere il server di Runngo. Controlla la connessione e riprova.');
    const iosClientId = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;
    return await completeGoogleSignIn({
      platform: Platform.OS, expoGo, webClientId: status?.googleClientId ?? null, iosClientId,
      acceptToken,
      loadSdk: async () => {
        let native;
        try { native = await import('@react-native-google-signin/google-signin'); }
        catch { throw new Error('Questa versione dell’app non include ancora Google. Installa la build aggiornata di Runngo.'); }
        const { GoogleSignin, isErrorWithCode, statusCodes } = native;
        return {
          configure: (config) => GoogleSignin.configure(config),
          hasPlayServices: (options) => GoogleSignin.hasPlayServices(options),
          signIn: async () => {
            try { return await GoogleSignin.signIn(); }
            catch (e) {
              if (isErrorWithCode(e)) {
                if (e.code === statusCodes.SIGN_IN_CANCELLED) return { type: 'cancelled' as const };
                if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Aggiorna Google Play Services oppure usa email e password.');
                if (e.code === statusCodes.IN_PROGRESS) throw new Error('Un accesso Google è già in corso.');
              }
              throw new Error('Google non ha completato l’accesso. Riprova oppure usa email e password.');
            }
          },
        };
      },
    });
  } finally { inProgress = false; }
}
