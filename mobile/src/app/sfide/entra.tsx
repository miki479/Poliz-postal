import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Field, Muted, Screen } from '@/components/ui';

/** Una sfida si apre con il link d'invito completo (…/sfida/<id>?c=<codice>): ne ricavo id e codice. */
export default function SfidaEntra() {
  const [link, setLink] = useState('');

  function open() {
    const m = /\/sfida\/([^/?#\s]+)(?:\?[^#\s]*?\bc=([^&#\s]+))?/.exec(link.trim());
    if (!m) return Alert.alert('Link non valido', 'Incolla il link d’invito ricevuto, che contiene “/sfida/”.');
    router.replace({ pathname: '/sfide/[id]', params: { id: m[1], ...(m[2] ? { code: m[2] } : {}) } });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Entra in una sfida' }} />
      <Muted>Incolla il link d’invito che ti hanno mandato.</Muted>
      <Field label="Link d’invito" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="https://…/sfida/…" />
      <Button title="Apri sfida" onPress={open} disabled={link.trim().length < 8} />
    </Screen>
  );
}
