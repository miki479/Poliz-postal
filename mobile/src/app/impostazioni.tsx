import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Async, Banner, Button, Divider, Field, Row, Screen, Section, Sheet, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { auth, ext, type AccountInfo, type StravaStatus } from '@/lib/api';
import { fmtDateTimeShort } from '@/lib/format';
import { useSession } from '@/lib/session';

import { humanError } from '@/lib/errors';
function NavRow({ icon, title, subtitle, onPress, tone }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; tone?: 'danger' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={tone === 'danger' ? color.danger : color.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={[t.body, tone === 'danger' && { color: color.danger }]}>{title}</Text>
        {subtitle ? <Text style={t.small}>{subtitle}</Text> : null}
      </View>
      {tone ? null : <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />}
    </Pressable>
  );
}

/** Gestione privata: account, integrazioni, privacy. Niente di tutto questo compare nel profilo pubblico. */
export default function Impostazioni() {
  const { logout } = useSession();
  const account = useLoad(() => auth.account());
  const strava = useLoad(() => ext.strava.status().catch(() => null as StravaStatus | null));
  const [pwd, setPwd] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwdErr, setPwdErr] = useState('');
  const [del, setDel] = useState(false);
  const [delPwd, setDelPwd] = useState('');

  async function changePwd() {
    setBusy(true);
    setPwdErr('');
    try {
      await auth.changePassword(cur, next);
      setCur('');
      setNext('');
      setPwd(false);
      Alert.alert('Password aggiornata');
    } catch (e) {
      setPwdErr(humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  function removeAccount(a: AccountInfo) {
    Alert.alert('Eliminare l’account?', 'Profilo, attività e iscrizioni verranno cancellati dal server. Non si può annullare.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina definitivamente',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth.deleteAccount(a.hasPassword ? { password: delPwd } : { confirm: 'ELIMINA' });
            await logout();
          } catch (e) {
            Alert.alert('Non eliminato', humanError(e, 'Errore.'));
          }
        },
      },
    ]);
  }

  const s = strava.data;
  const stravaLine = !s ? 'Stato non disponibile' : !s.configured ? 'Non attivo su questo server' : s.connected ? (s.revoked ? 'Accesso revocato: ricollega' : `Collegato${s.lastSyncAt ? ` · ultima sincronizzazione ${fmtDateTimeShort(s.lastSyncAt)}` : ' · mai sincronizzato'}`) : 'Non collegato';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Impostazioni' }} />
      <Async state={account} skeleton={<Skeleton height={120} />}>
        {(a) => (
          <>
            <Section title="Account">
              <View>
                <Row style={{ minHeight: 56 }}>
                  <Ionicons name="mail-outline" size={22} color={color.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={t.body}>{a.email}</Text>
                    <Text style={t.small}>{a.emailVerified ? 'Email verificata' : 'Email non ancora verificata'}</Text>
                  </View>
                </Row>
                {!a.emailVerified && a.mailEnabled ? <Button small title="Invia di nuovo l’email di verifica" onPress={() => auth.resendVerification().then(() => Alert.alert('Email inviata'), (e) => Alert.alert('Errore', String(e.message)))} /> : null}
                {a.hasPassword ? (
                  <>
                    <Divider inset={34} />
                    <NavRow icon="lock-closed-outline" title="Cambia password" onPress={() => setPwd(true)} />
                  </>
                ) : null}
              </View>
            </Section>

            <Section title="Dati e integrazioni">
              <View>
                <NavRow icon="sync-outline" title="Strava" subtitle={stravaLine} onPress={() => router.push('/integrazioni')} />
                <Divider inset={34} />
                <NavRow icon="document-outline" title="Importa da file" subtitle="GPX, TCX o esportazione di Apple Salute" onPress={() => router.push('/integrazioni')} />
              </View>
              <Text style={t.small}>Apple Salute non si collega direttamente: per ora si importa il file di esportazione. Le attività importate restano private finché non scegli di condividerle.</Text>
            </Section>

            <Section title="Privacy">
              <NavRow icon="eye-outline" title="Cosa mostri agli altri" subtitle="Statistiche, club, uscite e feed" onPress={() => router.push('/profilo-modifica')} />
            </Section>

            <Section>
              <View>
                <NavRow icon="log-out-outline" title="Esci" onPress={() => void logout()} />
                <Divider inset={34} />
                <NavRow icon="trash-outline" title="Elimina account" tone="danger" onPress={() => setDel(true)} />
              </View>
            </Section>

            <Sheet visible={pwd} onClose={() => setPwd(false)} title="Cambia password" footer={<Button title="Aggiorna password" onPress={changePwd} busy={busy} disabled={!cur || next.length < 8} />}>
              <Field label="Password attuale" value={cur} onChangeText={setCur} secureToggle textContentType="password" autoComplete="current-password" />
              <Field label="Nuova password" value={next} onChangeText={setNext} secureToggle textContentType="newPassword" autoComplete="new-password" hint="Almeno 8 caratteri." />
              {pwdErr ? <Banner tone="error" text={pwdErr} /> : null}
            </Sheet>

            <Sheet visible={del} onClose={() => setDel(false)} title="Elimina account" footer={<Button variant="danger" title="Elimina il mio account" onPress={() => removeAccount(a)} disabled={a.hasPassword && !delPwd} />}>
              <Text style={t.body}>Cancella in modo definitivo i tuoi dati dal server di Runngo. Le attività già su Strava restano su Strava.</Text>
              {a.hasPassword ? <Field label="Conferma con la password" value={delPwd} onChangeText={setDelPwd} secureToggle textContentType="password" /> : null}
            </Sheet>
          </>
        )}
      </Async>
    </Screen>
  );
}
