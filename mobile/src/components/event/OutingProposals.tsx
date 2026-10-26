import { Pressable, Text, View } from 'react-native';
import { ActivityGlyph } from '@/components/SportIcon';
import { Button, Skeleton, t, useLoad } from '@/components/ui';
import { eventSportStyle } from '@/constants/eventStyle';
import { color, R, S } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtKm, fmtPace } from '@/lib/format';
import { estimateLevel, eventSportOf, levelLabel } from '@shared/eventLevel.ts';
import { outingProposals, type OutingProposal } from '@shared/outingProposals.ts';
import type { WorkoutLog } from '@shared/types.ts';
export function OutingProposals({ onChoose, onCustom }: { onChoose(p: OutingProposal): void; onCustom(): void }) {
 const state = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null));
 const proposals = outingProposals(state.data ?? []);
 return <View style={{ gap: S.lg }}><Text style={t.muted}>Scegli una proposta da adattare al gruppo. Distanze e posti sono una bozza, da confermare prima di pubblicare.</Text>{state.loading ? <Skeleton height={100} /> : null}
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md }}>{proposals.map((p) => { const st = eventSportStyle(p.sport); return <Pressable key={p.id} onPress={() => onChoose(p)} accessibilityRole="button" accessibilityLabel={`Scegli proposta ${p.title}`} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 130, padding: S.lg, borderRadius: R.card, backgroundColor: color.surface, borderTopWidth: 3, borderTopColor: st.solid, gap: S.sm }}><ActivityGlyph style={st} size={32} color={st.solid} /><Text style={t.title}>{p.title}</Text><Text style={t.small}>{[p.km ? fmtKm(p.km) : 'Distanza da scegliere', p.minutes ? `circa ${p.minutes} min` : null, p.pace ? `Passo ${fmtPace(p.pace)}` : 'Passo da concordare', `${p.spots} posti proposti`, `Livello proposto: ${levelLabel(estimateLevel({ sport: eventSportOf(p.sport), km: p.km, paceSec: p.pace }).level)}`].filter(Boolean).join(' · ')}</Text><Text style={t.small}>{p.personal ? 'Mediana delle tue ultime corse registrate' : 'Proposta modificabile'} · si resta insieme</Text></Pressable>; })}</View>
 <Button variant="soft" title="Uscita libera: scelgo io" onPress={onCustom} /></View>;
}
