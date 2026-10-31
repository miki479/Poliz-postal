import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { GoogleButton } from '@/components/GoogleButton';
import { Banner, Button, Field, LinkText, Segmented, t } from '@/components/ui';
import { color, GUTTER, R, S } from '@/constants/theme';
import { auth, ApiError, API_URL, post } from '@/lib/api';
import { googleLogin, type GoogleAttempt } from '@/lib/googleLogin';
import { useSession } from '@/lib/session';

import { humanError } from '@/lib/errors';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  if (mode !== 'login' && mode !== 'register') return <Redirect href="/(auth)/benvenuto" />;
  const initialMode = mode === 'register' ? 'register' : 'login';
  return <LoginForm key={initialMode} initialMode={initialMode} />;
}
function LoginForm({ initialMode }: { initialMode: 'login' | 'register' }) {
  const { login, register, refresh } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleRequest = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => () => { if (googleRequest.current) googleRequest.current.cancelled = true; }, []);

  async function withGoogle() {
    if (busy || googleBusy) return;
    setGoogleBusy(true); setError(''); setNotice('');
    const request = { cancelled: false }; googleRequest.current = request;
    try {
      const complete = await googleLogin({
        start: () => post<GoogleAttempt>('/api/auth/google/mobile/start', {}),
        poll: ({ id, pollToken }) => post('/api/auth/google/mobile/poll', { id, pollToken }),
        cancel: ({ id, pollToken }) => post('/api/auth/google/mobile/cancel', { id, pollToken }),
        open: (path) => WebBrowser.openBrowserAsync(API_URL + path),
        wait: () => new Promise((resolve) => setTimeout(resolve, 1200)),
        cancelled: () => request.cancelled,
      });
      if (complete && !request.cancelled) await refresh();
    } catch (e) {
      if (!request.cancelled) setError(humanError(e, 'Accesso con Google non riuscito. Riprova.'));
    } finally { if (googleRequest.current === request) { googleRequest.current = null; setGoogleBusy(false); } }
  }

  function validate(): boolean {
    const e: typeof fieldErr = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Controlla l’indirizzo email.';
    if (mode === 'register' && password.length < 8) e.password = 'Almeno 8 caratteri.';
    if (mode === 'login' && !password) e.password = 'Inserisci la password.';
    setFieldErr(e);
    return !e.email && !e.password;
  }

  async function submit() {
    if (busy || googleBusy || !validate()) return; // nessun invio doppio
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await (mode === 'login' ? login : register)(email.trim(), password);
    } catch (e) {
      // I dati inseriti restano nei campi; l'errore è quello reale restituito dal server o dalla rete.
      const err = e as ApiError;
      if (err?.fields?.email || err?.fields?.password) setFieldErr({ email: err.fields.email, password: err.fields.password });
      setError(err?.code === 'network' ? 'Non riesco a raggiungere il server di Runngo. Controlla la connessione e riprova.' : humanError(e, 'Accesso non riuscito.'));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setFieldErr({ email: 'Scrivi la tua email per ricevere il link.' });
    try {
      await auth.forgot(email.trim());
      setNotice('Se l’indirizzo è registrato, riceverai un’email con le istruzioni.');
    } catch (e) {
      setError(humanError(e, 'Invio non riuscito.'));
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: S.xxl, paddingHorizontal: GUTTER, paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenEntrance changeKey={mode} style={{ gap: S.xxl }}>
        <View style={{ alignItems: 'center', gap: S.lg }}>
          <Image source={require('@/assets/images/icon.png')} style={{ width: 88, height: 88, borderRadius: R.card + 6 }} accessibilityIgnoresInvertColors accessible={false} />
          <Image source={require('@/assets/images/wordmark.png')} style={{ width: 172, height: 172 * (207 / 893) }} resizeMode="contain" accessibilityLabel="Runngo" accessibilityRole="header" />
          <Text style={[t.muted, { textAlign: 'center' }]}>Trova persone con cui correre e vivi ogni uscita insieme al tuo gruppo.</Text>
        </View>

        <Segmented value={mode} onChange={(m) => { setMode(m); setError(''); setFieldErr({}); }} options={[{ value: 'login', label: 'Accedi' }, { value: 'register', label: 'Crea account' }]} />

        <View style={{ gap: S.lg }}>
          <GoogleButton onPress={() => void withGoogle()} busy={googleBusy} disabled={busy || googleBusy} />
          {error ? <Banner tone="error" text={error} /> : null}
          {googleBusy ? <LinkText title="Annulla accesso Google" onPress={() => { if (googleRequest.current) googleRequest.current.cancelled = true; setGoogleBusy(false); }} /> : null}
          <Text style={[t.small, { textAlign: 'center' }]}>oppure usa la tua email</Text>
          <Field label="Email" value={email} onChangeText={(v) => { setEmail(v); setFieldErr((f) => ({ ...f, email: undefined })); }} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" error={fieldErr.email} />
          <Field
            label="Password"
            value={password}
            onChangeText={(v) => { setPassword(v); setFieldErr((f) => ({ ...f, password: undefined })); }}
            secureToggle
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={fieldErr.password}
            hint={mode === 'register' ? 'Almeno 8 caratteri.' : undefined}
          />
          {notice ? <Banner tone="success" text={notice} /> : null}
          <Button title={mode === 'login' ? 'Accedi' : 'Crea il tuo account'} onPress={submit} busy={busy && !googleBusy} disabled={busy || googleBusy} />
          {mode === 'login' ? <LinkText title="Password dimenticata?" onPress={forgot} disabled={busy} style={{ alignSelf: 'center' }} /> : <Text style={[t.small, { textAlign: 'center' }]}>Dopo l’accesso decidi tu cosa mostrare agli altri dal tuo profilo.</Text>}
        </View>
        </ScreenEntrance>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
