import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Avatar, Banner, IconButton, Loading, Row, Sheet, t, useReduceMotion } from '@/components/ui';
import { color, HIT, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { relativeFromNow } from '@/lib/format';
import type { SocialCounts } from '@shared/social.ts';
import type { UserPublic } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
type CommentRow = { id: string; text: string; createdAt: string; user: UserPublic; mine: boolean; canDelete: boolean };

/** Commenti di un elemento: lista, scrittura e cancellazione (autore o proprietario). */
export function CommentsSheet({ itemId, visible, onClose, onCount }: { itemId: string; visible: boolean; onClose: () => void; onCount: (n: number) => void }) {
  const [list, setList] = useState<CommentRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => call<CommentRow[]>('listComments', itemId).then((l) => { setList(l); onCount(l.length); }, (e) => setErr(humanError(e, 'Errore.')));
  useEffect(() => {
    if (visible) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, itemId]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await call('addComment', itemId, text.trim());
      setText('');
      await load();
    } catch (e) {
      setErr(humanError(e, 'Non inviato.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Commenti"
      footer={
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Row gap={S.sm}>
            <TextInput value={text} onChangeText={setText} placeholder="Scrivi un commento" placeholderTextColor={color.textTertiary} maxLength={300} multiline accessibilityLabel="Scrivi un commento" style={{ flex: 1, minHeight: HIT, maxHeight: 120, borderRadius: R.control, borderWidth: 1, borderColor: color.controlBorder, backgroundColor: color.surfaceElevated, color: color.text, paddingHorizontal: S.md, paddingVertical: S.sm, ...type.body }} />
            <IconButton name="send" label="Invia commento" color={text.trim() ? color.accent : color.textTertiary} disabled={!text.trim() || busy} onPress={send} />
          </Row>
        </KeyboardAvoidingView>
      }>
      {err ? <Banner tone="error" text={err} /> : null}
      {!list ? (
        <Loading />
      ) : list.length ? (
        list.map((c) => (
          <Row key={c.id} style={{ alignItems: 'flex-start' }}>
            <Avatar name={c.user.displayName} hue={c.user.hue} uri={c.user.avatar} size={32} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={t.small}>
                <Text style={{ color: color.text, fontWeight: '700' }}>{c.user.displayName}</Text> · {relativeFromNow(c.createdAt)}
              </Text>
              <Text style={t.body}>{c.text}</Text>
            </View>
            {c.canDelete ? <IconButton name="trash-outline" size={18} color={color.textTertiary} label="Elimina commento" onPress={() => Alert.alert('Eliminare il commento?', undefined, [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: () => call('deleteComment', c.id).then(load) }])} /> : null}
          </Row>
        ))
      ) : (
        <Text style={t.muted}>Ancora nessun commento: scrivi il primo.</Text>
      )}
    </Sheet>
  );
}

/**
 * Scintilla ⚡ al posto del "mi piace": un incoraggiamento veloce. Risposta immediata (ottimistica) con
 * ritorno allo stato reale se il server rifiuta; vibrazione leggera; piccolo scatto dell'icona.
 */
/** Piccole scintille che si disperdono dall'icona quando dai una scintilla. */
function SparkBurst() {
  const t0 = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(t0, { toValue: 1, duration: 520, useNativeDriver: true }).start(); }, [t0]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 19, height: 19 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return <Animated.View key={i} style={{ position: 'absolute', left: 8, top: 8, width: 4, height: 4, borderRadius: 2, backgroundColor: color.warning, opacity: t0.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] }), transform: [{ translateX: t0.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 20] }) }, { translateY: t0.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 20] }) }, { scale: t0.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }] }} />;
      })}
    </View>
  );
}

/** Testo che, quando cambia, sfila verso l'alto come un contachilometri: il vecchio esce, il nuovo sale. */
function RollText({ text, style }: { text: string; style: object }) {
  const reduce = useReduceMotion();
  const prev = useRef(text);
  const [old, setOld] = useState<string | null>(null);
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prev.current === text) return;
    if (reduce) { prev.current = text; return; }
    setOld(prev.current); prev.current = text; y.setValue(0);
    Animated.timing(y, { toValue: 1, duration: 260, useNativeDriver: true }).start(() => setOld(null));
  }, [text, reduce, y]);
  return (
    <View style={{ overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.Text style={[style, old !== null && { opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{text}</Animated.Text>
      {old !== null ? <Animated.Text style={[style, { position: 'absolute', opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }]}>{old}</Animated.Text> : null}
    </View>
  );
}

export function SocialBar({ itemId, initial, own }: { itemId: string; initial: SocialCounts; own?: boolean }) {
  const [c, setC] = useState(initial);
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const busy = useRef(false);
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => setC(initial), [initial]);

  async function spark() {
    if (own || busy.current) return;
    busy.current = true;
    const next = !c.sparked;
    const before = c;
    setC({ ...c, sparked: next, sparks: c.sparks + (next ? 1 : -1) });
    if (next) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!reduce) { pop.setValue(0.7); Animated.spring(pop, { toValue: 1, friction: 3, tension: 220, useNativeDriver: true }).start(); setBurst((n) => n + 1); }
    }
    try {
      setC(await call<SocialCounts>('toggleSpark', itemId, next));
    } catch {
      setC(before);
    } finally {
      busy.current = false;
    }
  }

  async function showSparkers() {
    if (!own || !c.sparks) return;
    const l = await call<UserPublic[]>('sparkersOf', itemId).catch(() => []);
    Alert.alert('Scintille da', l.map((u) => u.displayName).join(', ') || '—');
  }

  return (
    <Row gap={S.xxl ?? 32}>
      <Pressable onPress={own ? showSparkers : spark} accessibilityRole="button" accessibilityState={{ selected: c.sparked }} accessibilityLabel={own ? `${c.sparks} scintille ricevute` : c.sparked ? `Hai dato una scintilla. ${c.sparks} in tutto. Tocca per toglierla` : `Dai una scintilla. ${c.sparks} finora`} style={({ pressed }) => [{ minHeight: HIT, minWidth: HIT, flexDirection: 'row', alignItems: 'center', gap: 6 }, pressed && { opacity: 0.6 }]}>
        <View>
          {burst > 0 ? <SparkBurst key={burst} /> : null}
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Ionicons name={c.sparked ? 'flash' : 'flash-outline'} size={19} color={c.sparked ? color.warning : color.textSecondary} />
        </Animated.View>
        </View>
        <RollText style={[t.small, c.sparked && { color: color.warning, fontWeight: '700' }]} text={own ? (c.sparks ? `${c.sparks} ${c.sparks === 1 ? 'scintilla' : 'scintille'}` : 'Nessuna scintilla') : c.sparks ? `Scintilla (${c.sparks})` : 'Scintilla'} />
      </Pressable>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Commenti: ${c.comments}`} style={({ pressed }) => [{ minHeight: HIT, minWidth: HIT, flexDirection: 'row', alignItems: 'center', gap: 6 }, pressed && { opacity: 0.6 }]}>
        <Ionicons name="chatbubble-outline" size={17} color={color.textSecondary} />
        <Text style={t.small}>{c.comments ? `Commenta (${c.comments})` : 'Commenta'}</Text>
      </Pressable>
      <CommentsSheet itemId={itemId} visible={open} onClose={() => setOpen(false)} onCount={(n) => setC((x) => ({ ...x, comments: n }))} />
    </Row>
  );
}
