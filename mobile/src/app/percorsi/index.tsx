import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Async, Button, Card, Chip, Empty, Field, Muted, Pills, Row, Screen, t, useLoad } from '@/components/ui';
import { call } from '@/lib/api';
import { fmtKm } from '@/lib/format';
import type { RouteView } from '@shared/types.ts';

type Scope = 'explore' | 'mine' | 'saved';

export default function Percorsi() {
  const [scope, setScope] = useState<Scope>('mine');
  const [text, setText] = useState('');
  const state = useLoad(() => call<RouteView[]>('listRoutes', { scope, areaText: text.trim() || null }), [scope, text]);
  return (
    <Screen onRefresh={state.reload}>
      <Stack.Screen options={{ title: 'Percorsi' }} />
      <Button title="Salva un percorso" onPress={() => router.push('/percorsi/form')} />
      <Pills value={scope} onChange={setScope} options={[{ value: 'mine', label: 'I miei' }, { value: 'saved', label: 'Salvati' }, { value: 'explore', label: 'Esplora' }]} />
      <Field label="Cerca" value={text} onChangeText={setText} placeholder="Zona o nome" />
      <Async state={state}>
        {(list) =>
          list.length ? (
            list.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: '/percorsi/[id]', params: { id: r.id, ...(r.visibility === 'link' && r.shareToken ? { token: r.shareToken } : {}) } })}>
                <Text style={t.title}>{r.name}</Text>
                <Muted>
                  {r.startName}
                  {r.endName && r.endName !== r.startName ? ` → ${r.endName}` : ' (anello)'}
                </Muted>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <Chip label={r.distanceKm != null ? fmtKm(r.distanceKm) : 'Distanza n.d.'} tone="accent" />
                  {r.geometry ? <Chip label="Tracciato" /> : null}
                  {r.area ? <Chip label={r.area} /> : null}
                  <Chip label={r.visibility === 'private' ? 'Privato' : r.visibility === 'link' ? 'Con link' : 'Pubblico'} />
                  {r.isFavorite ? <Chip label="Preferito" tone="success" /> : null}
                </Row>
              </Card>
            ))
          ) : (
            <Empty title="Nessun percorso" text="Salva un giro con partenza, arrivo e distanza." />
          )
        }
      </Async>
    </Screen>
  );
}
