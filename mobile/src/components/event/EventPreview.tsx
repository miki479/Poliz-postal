import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EventScene, GlassChip, paceNum } from '@/components/cards';
import { ActivityGlyph } from '@/components/SportIcon';
import type { IconName } from '@/components/ui';
import type { ActivityStyle } from '@/constants/activityColors';
import { eventSportStyle, FEATURE_ICONS, PACT_ICONS, VISIBILITY_ICONS, type PactMode } from '@/constants/eventStyle';
import { color, R, S, type } from '@/constants/theme';
import { fmtKm, SPORT_LABEL } from '@/lib/format';
import type { SportId, Visibility } from '@shared/types.ts';

type Sign = { key: string; icon?: IconName; glyph?: ActivityStyle; meaning: string };

const H = 252; // stessa altezza della card "Uscite di gruppo" della Home
const SEP_INK = 'rgba(255,255,255,0.3)';

/**
 * Anteprima del riepilogo: la stessa card grande "Uscite di gruppo" della Home (mockup), con i dati scelti nel modulo.
 * Scena a gradiente con la figura dell'attività (o l'immagine del club), data e ora in alto, titolo, riga
 * "Ritrovo · km · min/km" e la fila delle icone delle caratteristiche nello stesso ordine della legenda:
 * visibilità, club, tipo di attività, impegni del patto, caratteristiche extra. Niente partecipanti: l'uscita non c'è ancora.
 */
export function EventPreview({
  title,
  sport,
  when,
  place,
  km,
  paceSec,
  visibility,
  clubName,
  image,
  pact,
  route,
  spots,
}: {
  title: string;
  sport: SportId;
  when: string;
  place: string;
  km: number | null;
  paceSec: number | null;
  visibility: Visibility;
  clubName: string | null;
  image: string | null;
  pact: readonly PactMode[];
  route: boolean;
  spots: number | null;
}) {
  const st = eventSportStyle(sport);
  const line = [place ? `Ritrovo: ${place}` : null, km ? fmtKm(km) : null, paceSec ? `${paceNum(paceSec)} min/km` : null].filter(Boolean).join(' · ');

  const groups: Sign[][] = [];
  if (visibility !== 'club') groups.push([{ key: 'vis', icon: VISIBILITY_ICONS[visibility].icon, meaning: visibility === 'public' ? 'Uscita pubblica' : 'Su invito' }]);
  else groups.push([{ key: 'club', icon: VISIBILITY_ICONS.club.icon, meaning: clubName ? `Solo per il club ${clubName}` : 'Riservata al club' }]);
  groups.push([{ key: 'sport', glyph: st, meaning: `Tipo di attività: ${SPORT_LABEL[sport]}` }]);
  if (pact.length) groups.push(pact.map((m) => ({ key: m, icon: PACT_ICONS[m].icon, meaning: `Patto: ${PACT_ICONS[m].label}` })));
  const extra: Sign[] = [];
  if (route) extra.push({ key: 'route', icon: FEATURE_ICONS.route.icon, meaning: FEATURE_ICONS.route.label });
  if (spots) extra.push({ key: 'spots', icon: FEATURE_ICONS.limitedSpots.icon, meaning: `${spots} posti` });
  if (extra.length) groups.push(extra);

  const name = title.trim() || 'Dai un nome all’uscita';
  const said = [`Anteprima della card: ${name}`, `${SPORT_LABEL[sport]}, ${when}`, line.replace(/ · /g, ', '), ...groups.flat().map((g) => g.meaning)].filter(Boolean).join('. ');

  return (
    <View style={{ borderRadius: R.card + 2, overflow: 'hidden' }} accessible accessibilityLabel={`${said}.`}>
      <EventScene sport={sport} image={image} style={{ minHeight: H, borderRadius: R.card + 2 }}>
        <View style={{ flex: 1, minHeight: H, padding: S.lg, justifyContent: 'space-between', gap: S.lg }}>
          <View style={{ flexDirection: 'row' }}>
            <GlassChip text={when} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[type.title1, s.title, !title.trim() && { color: color.storyInkSecondary }]} numberOfLines={2}>
              {name}
            </Text>
            {line ? (
              <Text style={[type.subhead, { color: color.storyInkSecondary }]} numberOfLines={1}>
                {line}
              </Text>
            ) : null}
            <View style={s.signs}>
              {groups.map((g, i) => (
                <Fragment key={g[0].key}>
                  {i ? <View style={s.sep} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                    {g.map((x) => (x.glyph ? <ActivityGlyph key={x.key} style={x.glyph} size={18} color={color.storyInk} /> : <Ionicons key={x.key} name={x.icon ?? 'ellipse-outline'} size={17} color={color.storyInk} />))}
                  </View>
                </Fragment>
              ))}
            </View>
          </View>
        </View>
      </EventScene>
    </View>
  );
}

const s = StyleSheet.create({
  title: { color: color.storyInk, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  signs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: S.xs, marginTop: S.xs },
  sep: { width: StyleSheet.hairlineWidth * 2, height: 15, backgroundColor: SEP_INK, marginHorizontal: S.md },
});
