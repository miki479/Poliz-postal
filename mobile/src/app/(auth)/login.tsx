import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Field, LinkText, Segmented, t } from '@/components/ui';
import { color, GUTTER, R, S } from '@/constants/theme';
import { auth, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

import { humanError } from '@/lib/errors';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login, register } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function validate(): boolean {
    const e: typeof fieldErr = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Controlla l’indirizzo email.';
    if (mode === 'register' && password.length < 8) e.password = 'Almeno 8 caratteri.';
    if (mode === 'login' && !password) e.password = 'Inserisci la password.';
    setFieldErr(e);
    return !e.email && !e.password;
  }

  async function submit() {
    if (busy || !validate()) return; // nessun invio doppio
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await (mode === 'login' ? login : register)(email.trim(), password);
    } catch (e) {
      // I dati inseriti restano nei campi; l'errore è quello reale restituito dal server o dalla rete.
      const err = e as ApiError;
      if (err?.fields?.email || err?.fields?.password) setFieldErr({ email: err.fields.email, password: err.fields.password });
      setError(err?.code === 'network' ? 'Non riesco a raggiungere il server di Runngo. Controlla la connessione e riprova.' : err?.message || 'Accesso non riuscito.');
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: S.xxl, paddingHorizontal: GUTTER, paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: S.lg }}>
          <Image source={require('@/assets/images/icon.png')} style={{ width: 88, height: 88, borderRadius: R.card + 6 }} accessibilityIgnoresInvertColors accessible={false} />
          <Image source={require('@/assets/images/wordmark.png')} style={{ width: 172, height: 172 * (207 / 893) }} resizeMode="contain" accessibilityLabel="Runngo" accessibilityRole="header" />
          <Text style={[t.muted, { textAlign: 'center' }]}>Trova persone con cui correre e vivi ogni uscita insieme al tuo gruppo.</Text>
        </View>

        <Segmented value={mode} onChange={(m) => { setMode(m); setError(''); setFieldErr({}); }} options={[{ value: 'login', label: 'Accedi' }, { value: 'register', label: 'Crea account' }]} />

        <View style={{ gap: S.lg }}>
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
          {error ? <Banner tone="error" text={error} /> : null}
          {notice ? <Banner tone="success" text={notice} /> : null}
          <Button title={mode === 'login' ? 'Accedi' : 'Crea il tuo account'} onPress={submit} busy={busy} />
          {mode === 'login' ? <LinkText title="Password dimenticata?" onPress={forgot} style={{ alignSelf: 'center' }} /> : <Text style={[t.small, { textAlign: 'center' }]}>Dopo l’accesso decidi tu cosa mostrare agli altri dal tuo profilo.</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
