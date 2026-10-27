import { themeMode } from '@/constants/theme';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Async, Banner, Button, Card, Chip, Muted, Row, Screen, Stat, t, useLoad } from '@/components/ui';
import { API_URL, call } from '@/lib/api';
import { fmtKm } from '@/lib/format';
import type { RouteView } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export default function PercorsoDettaglio() {
  const { id, token } = useLocalSearchParams<{ id: string; token?: string }>();
  const state = useLoad(() => call<RouteView>('getRoute', id, token ?? null), [id]);
  const [busy, setBusy] = useState(false);

  const region = useMemo(() => {
    const pts = state.data?.geometry ?? (state.data?.start ? [state.data.start, ...(state.data.end ? [state.data.end] : [])] : null);
    if (!pts?.length) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5), longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.5) };
  }, [state.data]);

  async function act(fn: () => Promise<unknown>, back = false) {
    setBusy(true);
    try {
      await fn();
      if (back) router.back();
      else await state.reload();
    } catch (e) {
      Alert.alert('Non riuscito', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={state.reload}>
      <Async state={state}>
        {(r) => (
          <>
            <Stack.Screen options={{ title: r.name }} />
            <View style={{ gap: 6 }}>
              <Text style={[t.h1, { fontSize: 22 }]}>{r.name}</Text>
              <Muted>
                {r.startName}
                {r.endName && r.endName !== r.startName ? ` → ${r.endName}` : ' (anello)'}
              </Muted>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                <Chip label={r.visibility === 'private' ? 'Privato' : r.visibility === 'link' ? 'Con link' : 'Pubblico'} />
                {r.area ? <Chip label={r.area} /> : null}
              </Row>
            </View>

            {region ? (
              <View style={{ height: 240, borderRadius: 16, overflow: 'hidden' }}>
                <MapView style={{ flex: 1 }} initialRegion={region} userInterfaceStyle={themeMode()}>
                  {r.geometry ? <Polyline coordinates={r.geometry.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor="#3cc8cd" strokeWidth={4} /> : null}
                  {r.start ? <Marker coordinate={{ latitude: r.start.lat, longitude: r.start.lng }} title="Partenza" /> : null}
                  {r.end && r.end !== r.start ? <Marker coordinate={{ latitude: r.end.lat, longitude: r.end.lng }} title="Arrivo" pinColor="blue" /> : null}
                </MapView>
              </View>
            ) : (
              <Banner text="Questo percorso non ha un tracciato su mappa." />
            )}

            <Row>
              <Stat value={r.distanceKm != null ? fmtKm(r.distanceKm) : '—'} label={r.distanceSource === 'routing' ? 'Distanza (servizio)' : 'Distanza'} />
              <Stat value={String(r.favoriteCount)} label="Preferiti" />
            </Row>
            {r.description ? <Text style={t.body}>{r.description}</Text> : null}
            {r.notes ? (
              <Card>
                <Text style={t.title}>Note</Text>
                <Text style={t.body}>{r.notes}</Text>
              </Card>
            ) : null}
            {r.geometryProvider ? <Muted>Tracciato: {r.geometryProvider}</Muted> : null}

            <Button variant={r.isFavorite ? 'soft' : 'primary'} title={r.isFavorite ? 'Rimuovi dai salvati' : 'Salva nei preferiti'} busy={busy} onPress={() => act(() => call('setRouteFavorite', r.id, !r.isFavorite, token ?? null))} />
            <Button variant="soft" title="Condividi" onPress={() => Share.share({ message: `${r.name} su RUNNGO: ${API_URL}/percorso/${r.id}${r.visibility === 'link' && r.shareToken ? `?t=${r.shareToken}` : ''}` })} />
            {r.isOwner ? (
              <Row>
                <Button style={{ flex: 1 }} variant="soft" title="Modifica" onPress={() => router.push({ pathname: '/percorsi/form', params: { id: r.id } })} />
                <Button style={{ flex: 1 }} variant="danger" title="Elimina" onPress={() => Alert.alert('Eliminare il percorso?', undefined, [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: () => act(() => call('deleteRoute', r.id), true) }])} />
              </Row>
            ) : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
