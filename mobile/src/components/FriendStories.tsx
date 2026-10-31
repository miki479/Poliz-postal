import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteTrace } from '@/components/RouteTrace';
import { Avatar, useReduceMotion } from '@/components/ui';
import { styleOfKind, styleOfSport } from '@/constants/activityColors';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtClock, fmtKm, fmtPace, relativeFromNow } from '@/lib/format';
import { markSeen, seenSet } from '@/lib/seen';
import { mix } from '@/lib/storyPalette';
import type { FeedItem, TrackPoint, UserPublic } from '@shared/types.ts';

/**
 * Storie degli amici, come in cima a Instagram: un cerchio per ogni persona che segui con attività nelle ultime 72 ore.
 * Il percorso compare SOLO se l'amico ha scelto di condividerlo (il server taglia i primi e gli ultimi 300 m); i numeri
 * sono quelli dell'attività, mai stimati. Anello viola = ci sono storie nuove, grigio = già viste.
 */
interface Story {
  id: string;
  at: string;
  title: string;
  sport: ReturnType<typeof styleOfSport>;
  distanceKm: number | null;
  durationSec: number | null;
  track: TrackPoint[] | null;
}
interface Group {
  user: UserPublic;
  stories: Story[];
}

const WINDOW_MS = 72 * 3_600_000;

function toStory(f: FeedItem): Story | null {
  if (f.kind === 'run_completed') {
    const a = f.activity;
    return { id: f.id, at: f.at, title: a.title || 'Corsa', sport: styleOfSport(a.sport), distanceKm: a.distanceKm, durationSec: a.durationMin ? a.durationMin * 60 : null, track: null };
  }
  if (f.kind === 'workout_shared') {
    const w = f.workout;
    return { id: f.id, at: f.at, title: w.title, sport: styleOfKind(w.kind, w.title), distanceKm: w.distanceKm, durationSec: w.durationMin * 60, track: w.track && w.track.length > 1 ? w.track : null };
  }
  return null;
}

export function FriendStories({ meId }: { meId?: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    void Promise.all([call<Array<FeedItem>>('getSocialFeed').catch(() => [] as FeedItem[]), seenSet()]).then(([feed, s]) => {
      const now = Date.now();
      const by = new Map<string, Group>();
      for (const f of feed) {
        if (f.user.id === meId || now - Date.parse(f.at) > WINDOW_MS) continue;
        const st = toStory(f);
        if (!st) continue;
        const g = by.get(f.user.id) ?? { user: f.user, stories: [] };
        g.stories.push(st);
        by.set(f.user.id, g);
      }
      const list = [...by.values()].map((g) => ({ ...g, stories: g.stories.sort((a, b) => a.at.localeCompare(b.at)) }));
      list.sort((a, b) => b.stories[b.stories.length - 1].at.localeCompare(a.stories[a.stories.length - 1].at));
      setSeen(new Set(s));
      setGroups(list);
    });
  }, [meId]);
  useEffect(load, [load]);

  if (!groups?.length) return null;
  return (
    <View style={{ gap: S.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.xl }} contentContainerStyle={{ paddingHorizontal: S.xl, gap: S.lg }} accessibilityRole="list">
        {groups.map((g, i) => {
          const fresh = g.stories.some((s) => !seen.has(`fstory:${s.id}`));
          return (
            <Pressable key={g.user.id} onPress={() => setOpen(i)} accessibilityRole="button" accessibilityLabel={`Storie di ${g.user.displayName}: ${g.stories.length}${fresh ? ', nuove' : ''}`} style={{ alignItems: 'center', gap: 6, width: 72 }}>
              <LinearGradient colors={fresh ? [color.accent, '#C77DFF'] : [color.controlBorder, color.controlBorder]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {g.stories.find((x) => x.track)?.track ? <View pointerEvents="none" style={{ position: 'absolute', opacity: 0.28 }}><RouteTrace track={g.stories.find((x) => x.track)!.track!} width={64} height={64} pad={6} tint={color.accent} strokeWidth={2.5} duration={0} dotEvery={null} seed={1} /></View> : null}
                  <Avatar name={g.user.displayName} hue={g.user.hue} uri={g.user.avatar} size={50} />
                </View>
              </LinearGradient>
              <Text style={[type.caption, { color: fresh ? color.text : color.textSecondary, fontWeight: fresh ? '700' : '500' }]} numberOfLines={1}>{g.user.displayName.split(' ')[0]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {open !== null && groups[open] ? <Viewer groups={groups} start={open} onClose={() => { setOpen(null); void seenSet().then((s) => setSeen(new Set(s))); }} /> : null}
    </View>
  );
}

/** Visualizzatore a schermo intero: tocca a destra per avanti, a sinistra per indietro; avanza da solo (non con "Riduci movimento"). */
function Viewer({ groups, start, onClose }: { groups: Group[]; start: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(0);
  const bar = useRef(new Animated.Value(0)).current;
  const g = groups[gi];
  const story = g.stories[si];
  const tint = story.sport.solid;
  const DURATION = story.track ? 9000 : 6000;

  const next = useCallback(() => {
    if (si < g.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(0); }
    else onClose();
  }, [si, gi, g.stories.length, groups.length, onClose]);
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(0); }
  };

  useEffect(() => {
    void markSeen(`fstory:${story.id}`);
    bar.setValue(0);
    if (reduce) return;
    const a = Animated.timing(bar, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: false });
    a.start(({ finished }) => finished && next());
    return () => a.stop();
  }, [story.id, reduce, DURATION, bar, next]);

  const pace = story.distanceKm && story.durationSec && story.distanceKm >= 0.5 ? story.durationSec / story.distanceKm : null;
  const nums = useMemo(() => [story.distanceKm ? ['Distanza', fmtKm(story.distanceKm)] : null, story.durationSec ? ['Tempo', fmtClock(story.durationSec)] : null, pace ? ['Passo', fmtPace(pace)] : null].filter(Boolean) as string[][], [story, pace]);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#05070A' }}>
        <LinearGradient colors={[mix(tint, '#05070A', 0.55), '#05070A']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: S.lg, gap: S.md }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {g.stories.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
                <Animated.View style={{ height: 3, backgroundColor: '#fff', width: i < si ? '100%' : i === si ? (reduce ? '100%' : bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })) : '0%' }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <Avatar name={g.user.displayName} hue={g.user.hue} uri={g.user.avatar} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={[type.headline, { color: '#fff' }]} numberOfLines={1}>{g.user.displayName}</Text>
              <Text style={[type.caption, { color: 'rgba(255,255,255,0.75)' }]}>{relativeFromNow(story.at)} · {story.sport.label}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi le storie" hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: S.xl, justifyContent: 'center', gap: S.xl }}>
          {story.track ? (
            <RouteTrace key={story.id} track={story.track} width={320} height={260} pad={16} tint={mix(tint, '#FFFFFF', 0.3)} strokeWidth={4} duration={2600} dotEvery={5000} seed={story.id.length} />
          ) : (
            <View style={{ alignItems: 'center', gap: S.sm, opacity: 0.9 }}>
              <Ionicons name="footsteps" size={72} color={mix(tint, '#FFFFFF', 0.3)} />
              <Text style={[type.footnote, { color: 'rgba(255,255,255,0.7)' }]}>L’amico non ha condiviso il percorso</Text>
            </View>
          )}
          <Text style={[type.display, { color: '#fff' }]} numberOfLines={2}>{story.title}</Text>
          <View style={{ flexDirection: 'row', gap: S.xl }}>
            {nums.map(([l, v]) => (
              <View key={l} style={{ gap: 2 }}>
                <Text style={[type.caption, { color: 'rgba(255,255,255,0.7)' }]}>{l}</Text>
                <Text style={[type.title1, { color: '#fff' }]}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Storia precedente" onPress={prev} style={{ position: 'absolute', top: insets.top + 110, bottom: 40, left: 0, width: '33%' }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Storia successiva" onPress={next} style={{ position: 'absolute', top: insets.top + 110, bottom: 40, right: 0, width: '67%' }} />
      </View>
    </Modal>
  );
}
