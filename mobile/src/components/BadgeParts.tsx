import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BadgeHex } from '@/components/BadgeHex';
import { AwardMark } from '@/components/Results';
import { SportGlyph } from '@/components/SportIcon';
import { Panel, PressableScale } from '@/components/ui';
import { awardOfRecord, awardTitle, BADGE_KINDS, inThisMonth, kindOf, recordKind, recordTitle, type CollectionCell } from '@/constants/achievements';
import { color, HIT, R, S, type } from '@/constants/theme';
import { fmtDate } from '@/lib/format';
import { SPORT_NAME, type Award, type AwardSport, type RecordEntry } from '@shared/records.ts';

/** Riquadro arrotondato con la figura dello sport (corsa, camminata, trail) o il bilanciere (forza). */
export function SportSquare({ sport, tint, size = 36, filled = true }: { sport: AwardSport; tint: string; size?: number; filled?: boolean }) {
  const ink = filled ? '#FFFFFF' : tint;
  const g = size * 0.6;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: filled ? tint : `${tint}29`, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {sport === 'strength' ? <Ionicons name="barbell" size={g} color={ink} /> : <SportGlyph glyph={sport === 'walking' ? 'walk' : sport === 'trail' ? 'trail' : 'run'} size={g} color={ink} />}
    </View>
  );
}

/** Schede a pillola (Tutti / Record / Traguardi, Per sport / Per categoria): la selezionata è piena. */
export function PillTabs<V extends string>({ options, value, onChange }: { options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: S.sm }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={({ pressed }) => [{ flex: 1, minHeight: 38, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.sm, backgroundColor: on ? color.accent : color.surface }, pressed && !on && { backgroundColor: color.surfacePressed }]}>
            <Text style={[type.subhead, { color: on ? color.onAccent : color.textSecondary, fontWeight: on ? '700' : '600' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Intestazione di sezione con azione a destra ("Vedi tutti"), come nel mockup. */
export function SectionHead({ title, action, onAction, right }: { title: string; action?: string; onAction?: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
      <Text style={[type.title2, { color: color.text }]} accessibilityRole="header">
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" style={({ pressed }) => ({ minHeight: HIT, justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
          <Text style={[type.subhead, { color: color.accent, fontWeight: '600' }]}>{action}</Text>
        </Pressable>
      ) : (
        right ?? null
      )}
    </View>
  );
}

function SummaryCol({ label, value, delta }: { label: string; value: number; delta: number }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[type.footnote, { color: color.textSecondary }]}>{label}</Text>
      <Text style={[type.display, { color: color.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[type.caption, { color: delta ? color.success : color.textTertiary }]}>{delta ? `+${delta} questo mese` : 'Nessuno questo mese'}</Text>
    </View>
  );
}

/** Riquadro scuro "Riconoscimenti · Record personali", con quanti ne sono arrivati nel mese (dati reali). */
export function AwardsSummary({ awards, records, onPress }: { awards: Award[]; records: RecordEntry[]; onPress?: () => void }) {
  const da = awards.filter((a) => inThisMonth(a.date)).length;
  const dr = records.filter((r) => inThisMonth(r.date)).length;
  const body = (
    <Panel tone="brand" style={{ flexDirection: 'row', padding: S.lg, gap: S.lg }}>
      <SummaryCol label="Riconoscimenti" value={awards.length} delta={da} />
      <SummaryCol label="Record personali" value={records.length} delta={dr} />
    </Panel>
  );
  if (!onPress) return <View accessible accessibilityLabel={`Riconoscimenti: ${awards.length}, ${da} questo mese. Record personali: ${records.length}, ${dr} questo mese.`}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`Riconoscimenti: ${awards.length}, ${da} questo mese. Record personali: ${records.length}, ${dr} questo mese. Apri i riconoscimenti`}>
      {body}
    </PressableScale>
  );
}

/** Riga di un record attuale: figura dello sport nel colore del tipo, titolo, "valore · data". Apre il riconoscimento (o l'attività). */
export function RecordRow({ r, awards }: { r: RecordEntry; awards: Award[] }) {
  const tone = BADGE_KINDS[recordKind(r)].tone;
  const award = awardOfRecord(r, awards);
  const open = () => (award ? router.push({ pathname: '/riconoscimenti/[id]', params: { id: award.id } }) : router.push({ pathname: '/allenamento/log/[id]', params: { id: r.logId } }));
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${recordTitle(r)}: ${r.value}, ${fmtDate(r.date)}, ${SPORT_NAME[r.sport]}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingVertical: S.xs }, pressed && { opacity: 0.6 }]}>
      <SportSquare sport={r.sport} tint={tone.solid} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
          {recordTitle(r)}
        </Text>
        <Text style={[type.footnote, { color: color.textSecondary, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
          {r.value} · {fmtDate(r.date)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
    </Pressable>
  );
}

/** Casella di un riconoscimento in griglia: badge, nome e data (o "Da conquistare" in grigio). */
export function HexCell({ cell, size = 64, sportLine, onPress, style }: { cell: CollectionCell; size?: number; sportLine?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const a = cell.latest;
  const name = a ? awardTitle(a) : cell.entry.name;
  const when = a ? fmtDate(a.date) : 'Da conquistare';
  const label = `${name}${sportLine ? `, ${SPORT_NAME[cell.entry.sport]}` : ''}. ${a ? `Conquistato il ${when}${cell.times > 1 ? `, ${cell.times} volte` : ''}` : 'Da conquistare'}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ alignItems: 'center', gap: S.xs, paddingVertical: S.sm }, style, pressed && { opacity: 0.6 }]}>
      {a ? <AwardMark a={a} size={size} /> : <BadgeHex kind={kindOf(cell.entry)} size={size} locked />}
      <Text style={[type.caption, { color: a ? color.text : color.textTertiary, fontWeight: '700', textAlign: 'center' }]} numberOfLines={2}>
        {name}
      </Text>
      {sportLine ? <Text style={[type.caption, { color: color.textSecondary, textAlign: 'center' }]}>{SPORT_NAME[cell.entry.sport]}</Text> : null}
      <Text style={[type.caption, { color: color.textTertiary, textAlign: 'center' }]} numberOfLines={1}>
        {when}
        {a && cell.times > 1 ? ` · ×${cell.times}` : ''}
      </Text>
    </Pressable>
  );
}

/** "Ultimi traguardi" in tre colonne: badge, nome e data di conquista. */
export function LatestAwards({ awards, max = 3 }: { awards: Award[]; max?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {awards.slice(0, max).map((a, i) => (
        <View key={a.id} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderColor: color.separator }}>
          <HexCell cell={{ entry: { key: a.code, sport: a.sport, category: a.category, name: awardTitle(a), hint: a.description, unit: a.unit }, latest: a, times: 1 }} size={58} onPress={() => router.push({ pathname: '/riconoscimenti/[id]', params: { id: a.id } })} />
        </View>
      ))}
      {Array.from({ length: Math.max(0, max - awards.length) }, (_, i) => (
        <View key={`e${i}`} style={{ flex: 1 }} />
      ))}
    </View>
  );
}
