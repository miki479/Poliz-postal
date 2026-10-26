import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { badgeA11y, BadgeCaption, BadgeEmblem } from '@/components/Badge';
import { Avatar, Metric, Row, t } from '@/components/ui';
import { color, PROFILE_ACCENTS, R, S, type } from '@/constants/theme';
import { kmParts, SPORT_LABEL } from '@/lib/format';
import type { ProfileStyle, ProfileView } from '@shared/types.ts';

export const BASE_STYLE: ProfileStyle = { accent: 'teal', frame: 'none', featuredBadges: [] };

/**
 * Identità con la gerarchia del mockup: avatar con la cornice e l'accento personali, nome e riga secondaria
 * (con `onIdentity` è toccabile e porta a modificare il profilo), poi tre contatori centrati:
 * Attività · Racconti · Club (senza il numero dei racconti, per i profili altrui: Km totali).
 * `onBadges`: mostra anche i distintivi in evidenza (profili altrui). L'accento personale resta confinato qui.
 */
export function ProfileHeader({ p, style, right, onBadges, stories, onIdentity }: { p: ProfileView; style?: ProfileStyle; right?: React.ReactNode; onBadges?: () => void; stories?: number; onIdentity?: () => void }) {
  // Stile assente (utente creato prima della personalizzazione o server non aggiornato): si usa lo stile base.
  const st: ProfileStyle = { ...BASE_STYLE, ...(style ?? p.user.style ?? {}) };
  const acc = PROFILE_ACCENTS[st.accent] ?? PROFILE_ACCENTS.teal;
  const u = p.user;
  const sub = [u.sports.length ? u.sports.map((s) => SPORT_LABEL[s]).join(', ') : `@${u.username}`, u.area || null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: S.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.lg }}>
        <Avatar name={u.displayName} hue={u.hue} uri={u.avatar} size={84} frame={st.frame} ring={acc.solid} />
        <Pressable
          disabled={!onIdentity}
          onPress={onIdentity}
          accessibilityRole={onIdentity ? 'button' : 'header'}
          accessibilityLabel={`${u.displayName || 'Nuovo runner'}, ${sub}${onIdentity ? '. Modifica profilo e stile' : ''}`}
          style={({ pressed }) => [{ flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
        >
          <Text style={t.title1} numberOfLines={2}>
            {u.displayName || 'Nuovo runner'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[t.muted, { flexShrink: 1 }]} numberOfLines={1}>
              {sub}
            </Text>
            {onIdentity ? <Ionicons name="chevron-forward" size={14} color={color.textTertiary} /> : null}
          </View>
        </Pressable>
        {right ? <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>{right}</View> : null}
      </View>

      {u.bio ? <Text style={t.body}>{u.bio}</Text> : null}

      {p.clubs?.length ? (
        <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
          {p.clubs.map((c) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/club/[id]', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`Club ${c.name}`} style={({ pressed }) => [{ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.chip, backgroundColor: color.surface, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <Text style={[type.footnote, { color: acc.solid, fontWeight: '600' }]}>{c.name}</Text>
            </Pressable>
          ))}
        </Row>
      ) : null}

      {p.stats ? (
        <Row gap={0}>
          <Metric size="sm" align="center" value={String(p.stats.completedRuns)} label="Attività" />
          {stories !== undefined ? <Metric size="sm" align="center" value={String(stories)} label="Racconti" /> : <Metric size="sm" align="center" value={kmParts(p.stats.declaredDistanceKm)[0]} label="Km totali" />}
          <Metric size="sm" align="center" value={p.clubs ? String(p.clubs.length) : '—'} label="Gruppi" />
        </Row>
      ) : (
        <Text style={t.muted}>Statistiche non pubbliche.</Text>
      )}

      {onBadges && p.badges ? (
        <Pressable onPress={onBadges} accessibilityRole="button" accessibilityLabel={`Distintivi: ${p.badges.earned} su ${p.badges.total}. ${p.badges.featured.map(badgeA11y).join('. ')}`} style={({ pressed }) => [{ gap: S.md }, pressed && { opacity: 0.7 }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={t.h2}>Distintivi</Text>
            <Text style={t.small}>
              {p.badges.earned} di {p.badges.total} ›
            </Text>
          </Row>
          {p.badges.featured?.length ? (
            <Row gap={S.lg} style={{ alignItems: 'flex-start' }}>
              {p.badges.featured.map((b) => (
                <View key={b.id} style={{ width: 88, alignItems: 'center', gap: S.sm }}>
                  <BadgeEmblem b={b} size={60} />
                  <BadgeCaption b={b} />
                </View>
              ))}
            </Row>
          ) : (
            <Text style={t.muted}>{p.isSelf ? (p.badges.earned ? 'Scegli fino a tre distintivi da mettere in evidenza.' : 'I distintivi arrivano correndo in compagnia, organizzando uscite e con la costanza.') : 'Nessun distintivo in evidenza.'}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
