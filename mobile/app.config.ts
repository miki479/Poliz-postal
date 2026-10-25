import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Native Google callback scheme must be present at build time, never a placeholder. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (iosClientId && !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID non è un Client ID OAuth iOS valido.');
  const iosUrlScheme = iosClientId ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}` : null;
  return {
    ...config,
    name: config.name ?? 'Runngo', slug: config.slug ?? 'runngo',
    plugins: [...(config.plugins ?? []), ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, { iosUrlScheme: string }]] : [])],
    extra: { ...config.extra, googleIosClientId: iosClientId ?? null },
  };
};
