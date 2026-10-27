import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BadgeEmblem } from '@/components/Badge';
import { BASE_STYLE, ProfileHeader } from '@/components/ProfileHeader';
import { Banner, Button, Divider, Field, LinkText, Loading, Pills, Row, Screen, Sheet, SwitchRow, t } from '@/components/ui';
import { color, HIT, PROFILE_ACCENTS, R, S, type } from '@/constants/theme';
import { auth, call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { SportChips } from '@/components/SportChips';
import { useSession } from '@/lib/session';
import type { AvatarFrame, BadgeView, Me, PrivacySettings, ProfileAccent, ProfileStyle, ProfileView, SportId } from '@shared/types.ts';

type Panel = 'who' | 'style' | 'privacy' | null;

/**
 * Profilo in tre pannelli (Chi sei, Stile, Cosa mostri) invece di 15 controlli in un solo scroll.
 * L'anteprima resta in alto; "Salva" compare solo se è cambiato qualcosa ed è nel punto fisso in basso.
 */
export default function ProfiloModifica() {
  const { me, refresh } = useSession();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [badges, setBadges] = useState<BadgeView[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [area, setArea] = useState('');
  const [sports, setSports] = useState<SportId[]>(['running']);
  const [privacy, setPrivacy] = useState<PrivacySettings>({ showStats: true, showClubs: true, showUpcoming: true, shareActivity: true });
  const [style, setStyle] = useState<ProfileStyle>(BASE_STYLE);
  const [panel, setPanel] = useState<Panel>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');

  useEffect(() => {
    call<ProfileView>('getProfile', null).then((p) => {
      setProfile(p);
      setDisplayName(p.user.displayName);
      setUsername(p.user.username);
      setBio(p.user.bio);
      setArea(p.user.area);
      setSports(p.user.sports.length ? p.user.sports : ['running']);
      if (p.privacy) setPrivacy(p.privacy);
      setStyle({ ...BASE_STYLE, ...(p.user.style ?? {}) });
    });
    call<BadgeView[] | null>('listBadges', null).then((b) => setBadges((b ?? []).filter((x) => x.earned)), () => {});
  }, []);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setGeneral('');
  };

  async function checkUsername(v: string) {
    const u = v.toLowerCase();
    touch(setUsername)(u);
    setErrors((e) => ({ ...e, username: '' }));
    if (u && u !== me?.username && !(await auth.usernameAvailable(u).catch(() => true))) setErrors((e) => ({ ...e, username: 'Questo username è già preso: provane un altro.' }));
  }

  function toggleBadge(id: string) {
    const cur = style.featuredBadges;
    if (cur.includes(id)) touch(setStyle)({ ...style, featuredBadges: cur.filter((x) => x !== id) });
    else if (cur.length < 3) touch(setStyle)({ ...style, featuredBadges: [...cur, id] });
  }

  async function save() {
    if (displayName.trim().length < 2) {
      setPanel('who');
      return setErrors({ displayName: 'Il nome deve avere almeno 2 lettere.' });
    }
    if (errors.username) return setPanel('who');
    setBusy(true);
    setGeneral('');
    try {
      await call<Me>('updateProfile', { displayName: displayName.trim(), username: username.trim(), avatar: me?.avatar ?? null, bio: bio.trim(), sports, area: area.trim(), privacy, style });
      await refresh();
      router.back();
    } catch (e: any) {
      if (e?.fields) {
        setErrors(e.fields);
        if (e.fields.displayName || e.fields.username || e.fields.bio) setPanel('who');
      }
      setGeneral(humanError(e, 'Non sono riuscito a salvare il profilo. Riprova.'));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <Loading />;
  const preview: ProfileView = { ...profile, user: { ...profile.user, displayName: displayName || profile.user.displayName, username, bio, area, sports, style }, badges: profile.badges ? { ...profile.badges, featured: style.featuredBadges.map((id) => badges.find((b) => b.id === id)).filter((b): b is BadgeView => !!b) } : null };

  const Entry = ({ icon, title, hint, p }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; p: Panel }) => (
    <Pressable onPress={() => setPanel(p)} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={color.accent} />
      <View style={{ flex: 1 }}>
        <Text style={t.title}>{title}</Text>
        <Text style={t.small} numberOfLines={1}>
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
    </Pressable>
  );

  return (
    <Screen glow="brand" footer={dirty ? <><Button title="Salva il profilo" iconName="checkmark" onPress={save} busy={busy} />{general ? <Banner tone="error" text={general} /> : null}</> : undefined}>
      <Stack.Screen options={{ title: 'Il tuo profilo' }} />
      <View style={{ borderRadius: R.card, overflow: 'hidden', paddingHorizontal: S.xl, paddingBottom: S.lg, backgroundColor: color.surface }}>
        <ProfileHeader p={preview} style={style} />
      </View>
      <Text style={t.small}>Così ti vedono gli altri.</Text>

      <View>
        <Entry icon="person-outline" title="Chi sei" hint={`${displayName || 'Nome'} · @${username || 'username'}`} p="who" />
        <Divider inset={34} />
        <Divider inset={34} />
        <Entry icon="eye-outline" title="Cosa mostri agli altri" hint="Statistiche, club, uscite e feed" p="privacy" />
      </View>
      {general && !dirty ? <Banner tone="error" text={general} /> : null}

      <Sheet visible={panel === 'who'} onClose={() => setPanel(null)} title="Chi sei" footer={<Button title="Fatto" onPress={() => setPanel(null)} />}>
        <Field label="Nome" value={displayName} onChangeText={touch(setDisplayName)} maxLength={30} error={errors.displayName} autoComplete="name" textContentType="name" />
        <Field label="Username" value={username} onChangeText={checkUsername} autoCapitalize="none" autoCorrect={false} error={errors.username} hint="3–20 caratteri: lettere minuscole, numeri, punto o trattino basso." />
        <Field label="Il tuo modo di correre" value={bio} onChangeText={touch(setBio)} multiline optional maxLength={160} hint={`${bio.length}/160`} error={errors.bio} />
        <Field label="Zona" value={area} onChangeText={touch(setArea)} optional placeholder="Es. Forlì" hint="Solo una zona generale, mai un indirizzo." />
        <SportChips multi label="Sport" value={sports} onChange={touch(setSports)} />
      </Sheet>

      <Sheet visible={panel === 'style'} onClose={() => setPanel(null)} title="Stile" footer={<Button title="Fatto" onPress={() => setPanel(null)} />}>
        <Text style={t.muted}>L’accento colora solo il tuo profilo: il resto dell’app resta uguale per tutti.</Text>
        <Row gap={S.md} style={{ flexWrap: 'wrap' }}>
          {(Object.keys(PROFILE_ACCENTS) as ProfileAccent[]).map((k) => {
            const on = style.accent === k;
            return (
              <Pressable key={k} onPress={() => touch(setStyle)({ ...style, accent: k })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Accento ${PROFILE_ACCENTS[k].label}`} style={{ width: HIT + 4, height: HIT + 4, borderRadius: R.pill, borderWidth: 2, borderColor: on ? color.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: HIT - 8, height: HIT - 8, borderRadius: R.pill, backgroundColor: PROFILE_ACCENTS[k].solid }} />
              </Pressable>
            );
          })}
        </Row>
        <View style={{ gap: S.sm }}>
          <Text style={t.title}>Cornice dell’avatar</Text>
          <Pills value={style.frame} onChange={(v: AvatarFrame) => touch(setStyle)({ ...style, frame: v })} options={[{ value: 'none', label: 'Nessuna' }, { value: 'ring', label: 'Sottile' }, { value: 'double', label: 'Doppia' }]} />
        </View>
        <View style={{ gap: S.sm }}>
          <Text style={t.title}>Traguardi in evidenza · {style.featuredBadges.length}/3</Text>
          {badges.length ? (
            <Row gap={S.md} style={{ flexWrap: 'wrap' }}>
              {badges.map((b) => {
                const on = style.featuredBadges.includes(b.id);
                const full = !on && style.featuredBadges.length >= 3;
                return (
                  <Pressable key={b.id} onPress={() => toggleBadge(b.id)} disabled={full} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }} accessibilityLabel={b.name} style={{ width: 88, alignItems: 'center', gap: 4, opacity: full ? 0.4 : 1, padding: S.xs, borderRadius: R.control, borderWidth: 1, borderColor: on ? color.accent : 'transparent' }}>
                    <BadgeEmblem b={b} size={52} />
                    <Text style={[type.caption, { color: on ? color.accent : color.textSecondary, textAlign: 'center' }]}>{b.name}</Text>
                  </Pressable>
                );
              })}
            </Row>
          ) : (
            <Text style={t.muted}>Quando otterrai dei traguardi potrai sceglierne fino a tre.</Text>
          )}
        </View>
        <LinkText title="Torna allo stile base" onPress={() => touch(setStyle)(BASE_STYLE)} />
      </Sheet>

      <Sheet visible={panel === 'privacy'} onClose={() => setPanel(null)} title="Cosa mostri agli altri" footer={<Button title="Fatto" onPress={() => setPanel(null)} />}>
        <SwitchRow label="Statistiche e traguardi" value={privacy.showStats} onChange={(v) => touch(setPrivacy)({ ...privacy, showStats: v })} />
        <SwitchRow label="I tuoi club" value={privacy.showClubs} onChange={(v) => touch(setPrivacy)({ ...privacy, showClubs: v })} />
        <SwitchRow label="Uscite a cui parteciperai" value={privacy.showUpcoming} onChange={(v) => touch(setPrivacy)({ ...privacy, showUpcoming: v })} />
        <SwitchRow label="Qualità riconosciute dai compagni" hint="Le qualità consolidate della Fama." value={privacy.showRecognitions !== false} onChange={(v) => touch(setPrivacy)({ ...privacy, showRecognitions: v })} />
        <SwitchRow label="Le tue attività nel feed" hint="Se la spegni, non compari nel feed né nella partecipazione del club." value={privacy.shareActivity} onChange={(v) => touch(setPrivacy)({ ...privacy, shareActivity: v })} />
        {!privacy.showStats ? <Banner text="Con le statistiche nascoste, anche i traguardi restano privati." /> : null}
      </Sheet>
    </Screen>
  );
}
