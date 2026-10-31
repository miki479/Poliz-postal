import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { Avatar, Panel, Sheet, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { themeMode } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtClock, fmtKm, fmtPace } from '@/lib/format';
import type { GroupReport, ReportEntry } from '@shared/groupReport.ts';

const TINTS = ['#8E75FF', '#4FC3F7', '#FFB020', '#FF5C6C', '#5CE1B9', '#F58CE0'];
const MEDAL = ['#F5C84C', '#C4CCD6', '#D08B54'];

/** Report finale di una corsa di gruppo: compare dopo la fine più una pausa, dura 72 ore. Solo chi ha corso insieme sullo stesso tragitto. */
export function GroupReportCard({ eventId }: { eventId: string }) {
  const s = useLoad(() => call<GroupReport | null>('groupReport', eventId).catch(() => null), [eventId]);
  const [open, setOpen] = useState(false);
  const r = s.data;
  if (!r) return null;
  if (!r.ready) {
    const when = new Date(r.availableAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return (
      <Panel style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <Ionicons name="hourglass-outline" size={22} color={color.textSecondary} />
        <Text style={[t.small, { flex: 1 }]}>Il report del gruppo arriva dopo la corsa, alle {when} circa: il tempo di salvare gli allenamenti.</Text>
      </Panel>
    );
  }
  if (r.entries.length < 2) return null;
  const tintOf = (id: string) => TINTS[Math.max(0, r.entries.findIndex((e) => e.user.id === id)) % TINTS.length];
  const podium = r.podium.map((id) => r.entries.find((e) => e.user.id === id)!).filter(Boolean);
  const all = r.tracks.flatMap((x) => x.points);
  const lat = all.reduce((n, p) => n + p.lat, 0) / Math.max(1, all.length), lng = all.reduce((n, p) => n + p.lng, 0) / Math.max(1, all.length);
  const span = Math.max(0.004, Math.max(...all.map((p) => Math.abs(p.lat - lat))) * 2.6, Math.max(...all.map((p) => Math.abs(p.lng - lng))) * 2.6);
  const value = (e: ReportEntry) => (r.metric === 'cadence' ? `${e.cadenceSpm} spm` : e.paceSec ? fmtPace(e.paceSec) : '—');
  return (
    <View style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={t.h2}>Com’è andata</Text>
        <Text style={t.small}>{r.metric === 'cadence' ? 'Classifica per cadenza' : 'Classifica per passo'}</Text>
      </View>
      <Panel style={{ overflow: 'hidden' }}>
        <View style={{ height: 190 }}>
          <MapView style={{ flex: 1 }} userInterfaceStyle={themeMode()} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: span, longitudeDelta: span }}>
            {r.tracks.map((x) => <Polyline key={x.userId} coordinates={x.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={tintOf(x.userId)} strokeWidth={4} lineCap="round" lineJoin="round" />)}
          </MapView>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: S.lg, padding: S.lg }}>
          {[1, 0, 2].map((pos) => {
            const e = podium[pos];
            if (!e) return <View key={pos} style={{ width: 84 }} />;
            const h = pos === 0 ? 84 : pos === 1 ? 62 : 48;
            return (
              <View key={e.user.id} style={{ width: 84, alignItems: 'center', gap: 4 }}>
                <Avatar name={e.user.displayName} hue={e.user.hue} uri={e.user.avatar} size={pos === 0 ? 44 : 36} frame="ring" ring={MEDAL[pos]} />
                <Text style={[type.caption, { color: color.text, fontWeight: '700' }]} numberOfLines={1}>{e.me ? 'Tu' : e.user.displayName.split(' ')[0]}</Text>
                <View style={{ width: 70, height: h, borderTopLeftRadius: R.md, borderTopRightRadius: R.md, backgroundColor: MEDAL[pos] + '33', borderWidth: 1, borderColor: MEDAL[pos] + '88', alignItems: 'center', paddingTop: 6 }}>
                  <Text style={[type.headline, { color: MEDAL[pos], fontWeight: '900' }]}>{pos + 1}</Text>
                  <Text style={[type.caption, { color: color.text, fontVariant: ['tabular-nums'] }]}>{value(e)}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Apri i dettagli del confronto" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: color.separator, opacity: pressed ? 0.6 : 1 })}>
          <Text style={[type.subhead, { color: color.accent, fontWeight: '700' }]}>Dettagli del confronto</Text>
          <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
        </Pressable>
      </Panel>
      <Text style={t.small}>Compaiono solo le persone che hanno corso insieme sullo stesso tragitto. Il report sparisce dopo 72 ore.</Text>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Confronto tra i corridori">
        {r.entries.map((e) => (
          <View key={e.user.id} style={{ gap: 6, paddingVertical: S.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <View style={{ width: 4, height: 34, borderRadius: 2, backgroundColor: tintOf(e.user.id) }} />
              <Avatar name={e.user.displayName} hue={e.user.hue} uri={e.user.avatar} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: color.text, fontWeight: '700' }]}>{e.me ? 'Tu' : e.user.displayName}</Text>
                <Text style={t.small}>{e.source}{e.leftAtKm !== null ? ` · si è staccato dopo ${String(e.leftAtKm).replace('.', ',')} km` : ' · fino alla fine'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginLeft: 8 }}>
              {([['Insieme', fmtKm(e.togetherKm)], ['Tempo', fmtClock(e.togetherSec)], ['Passo', e.paceSec ? fmtPace(e.paceSec) : '—'], ['Cadenza', e.cadenceSpm ? `${e.cadenceSpm} spm` : '—']] as const).map(([l, v]) => (
                <View key={l} style={{ flex: 1, gap: 1 }}>
                  <Text style={[type.caption, { color: color.textSecondary }]}>{l}</Text>
                  <Text style={[type.subhead, { color: color.text, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        <Text style={t.small}>Il confronto usa il tratto fatto insieme. I dati vengono dall’app Runngo, da file o da Strava; chi ha solo un riepilogo senza tragitto non si può verificare e non compare.</Text>
      </Sheet>
    </View>
  );
}
