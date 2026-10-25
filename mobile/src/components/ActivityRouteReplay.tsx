import { useRef, type ComponentProps } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { RouteReplay } from './RouteReplay';
import { color, S, type } from '@/constants/theme';
import { trackSegments } from '@shared/track.ts';

/** Il replay stabile resta invariato. Una traccia interrotta mostra solo i tratti realmente acquisiti. */
export function ActivityRouteReplay(props: ComponentProps<typeof RouteReplay>) {
  if (!props.track.some((p) => p.breakBefore)) return <RouteReplay {...props} />;
  return <InterruptedMap {...props} />;
}

function InterruptedMap(props: ComponentProps<typeof RouteReplay>) {
  const map = useRef<MapView>(null);
  const segments = trackSegments(props.track);
  const tint = props.tint ?? color.accent;
  return <View style={[{ overflow: 'hidden' }, props.style]}>
    <MapView ref={map} style={{ flex: 1 }} userInterfaceStyle="dark" mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'} pitchEnabled={false}
      onMapReady={() => map.current?.fitToCoordinates(props.track.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: (props.insetTop ?? 0) + 30, bottom: 60, left: 30, right: 30 }, animated: false })}>
      {segments.filter((s) => s.length > 1).map((s, i) => <Polyline key={i} coordinates={s.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={tint} strokeWidth={5} />)}
    </MapView>
    <View pointerEvents="none" style={{ position: 'absolute', left: S.md, right: S.md, bottom: S.md, padding: S.sm, borderRadius: 12, backgroundColor: color.overlay }}>
      <Text style={[type.caption, { color: color.text }]}>GPS interrotto · solo tratti registrati</Text>
    </View>
  </View>;
}
