import { router } from 'expo-router';
import { useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { t } from '@/components/ui';
import { color, R, S } from '@/constants/theme';
import type { EventView, RouteView } from '@shared/types.ts';
export function ExploreMap({ events = [], routes = [] }: { events?: EventView[]; routes?: RouteView[] }) {
 const map = useRef<MapView>(null);
 const points = [...events.filter((e) => e.lat != null && e.lng != null).map((e) => ({ latitude: e.lat!, longitude: e.lng! })), ...routes.flatMap((r) => r.geometry?.map((p) => ({ latitude: p.lat, longitude: p.lng })) ?? [])];
 const fit = () => { if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: { top: 40, left: 40, right: 40, bottom: 40 }, animated: false }); };
 if (!points.length) return <Text style={t.muted}>Nessun punto di ritrovo o tracciato disponibile per questi risultati. Passa all’elenco per consultarli.</Text>;
 return <View style={{ height: 320, borderRadius: R.card, overflow: 'hidden', marginVertical: S.sm }}><MapView ref={map} style={{ flex: 1 }} onMapReady={fit} userInterfaceStyle="dark" mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'} initialRegion={{ ...points[0], latitudeDelta: .04, longitudeDelta: .04 }}>
 {events.filter((e) => e.lat != null && e.lng != null).map((e) => <Marker key={e.id} coordinate={{ latitude: e.lat!, longitude: e.lng! }} pinColor={e.viewer.isParticipant ? color.success : color.accent} title={e.title} description={e.club?.name ?? 'Uscita pubblica'} onCalloutPress={() => router.push({ pathname: '/evento/[id]', params: { id: e.id } })} />)}
 {routes.map((r) => r.geometry && r.geometry.length > 1 ? <Polyline key={r.id} coordinates={r.geometry.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={color.route} strokeWidth={4} tappable onPress={() => router.push({ pathname: '/percorsi/[id]', params: { id: r.id, ...(r.shareToken ? { token: r.shareToken } : {}) } })} /> : null)}
 </MapView></View>;
}
