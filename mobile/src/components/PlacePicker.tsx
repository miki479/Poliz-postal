import { Ionicons } from '@expo/vector-icons';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { Panel, useReduceMotion } from '@/components/ui';
import { color, HIT, M, R, S, type } from '@/constants/theme';
import { ext, type GeoPlace } from '@/lib/api';

/** Nome corto leggibile: "Forlì, Emilia-Romagna" invece dell'indirizzo completo del provider. */
export function shortPlace(name: string): string {
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  const rest = parts.filter((p) => !/^\d{4,6}$/.test(p));
  return [rest[0], rest.length > 3 ? rest[rest.length - 3] : rest[1]].filter(Boolean).join(', ');
}

/**
 * Tipo di luogo, se il server lo fornisce (campo facoltativo `kind`, dal tipo di indirizzo del servizio geografico).
 * Senza il campo non si inventa nulla: la seconda riga mostra solo dove si trova.
 */
const KIND_LABEL: Record<string, string> = {
  city: 'Città',
  town: 'Città',
  village: 'Paese',
  hamlet: 'Frazione',
  suburb: 'Quartiere',
  quarter: 'Quartiere',
  neighbourhood: 'Quartiere',
  municipality: 'Comune',
  province: 'Provincia',
  county: 'Provincia',
  state: 'Regione',
  region: 'Regione',
  country: 'Nazione',
  road: 'Via',
  pedestrian: 'Via pedonale',
  square: 'Piazza',
  park: 'Parco',
  railway: 'Stazione',
  station: 'Stazione',
  stadium: 'Stadio',
  track: 'Pista',
  sports_centre: 'Centro sportivo',
  peak: 'Vetta',
  beach: 'Spiaggia',
};

/**
 * Due righe da un nome completo: il luogo e dove si trova ("Parco Sempione" / "Milano · Lombardia").
 * I codici postali e la nazione restano fuori dalla seconda riga quando c'è altro da dire.
 */
export function placeLines(p: GeoPlace): { title: string; detail: string } {
  const parts = p.name.split(',').map((x) => x.trim()).filter((x) => x && !/^\d{4,6}$/.test(x));
  const title = parts[0] ?? p.name;
  const rest = parts.slice(1);
  const where = rest.length >= 3 ? [rest[rest.length - 3], rest[rest.length - 2]] : rest;
  const kindRaw = (p as GeoPlace & { kind?: unknown }).kind;
  const kind = typeof kindRaw === 'string' ? KIND_LABEL[kindRaw] : undefined;
  return { title, detail: [kind, ...where].filter(Boolean).join(' · ') };
}

type State = 'idle' | 'short' | 'busy' | 'empty' | 'unavailable' | 'error';

/** Ingresso morbido del riquadro risultati (dissolvenza e piccolo spostamento); con "Riduci movimento" appare subito. */
function useAppear(key: string) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(1));
  // Prima del disegno: il riquadro nuovo non compare per un istante già pieno.
  useLayoutEffect(() => {
    if (reduce) return v.setValue(1);
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: M.local, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [key, reduce, v]);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] };
}

/**
 * Selezione di una località REALE. La ricerca parte solo su invio o sulla lente (la policy del servizio geografico vieta
 * l'autocompletamento a ogni tasto); i risultati arrivano dal server (Nominatim, con cache e limiti).
 * Solo un risultato scelto diventa "verificato": nome canonico e coordinate. Un testo libero non lo è mai.
 * Se il servizio non è attivo, `onUnavailable` lo segnala e il chiamante decide come procedere (mai fingere la verifica).
 */
export function PlacePicker({ label, value, onChange, onUnavailable, placeholder = 'Cerca una città o una località' }: { label: string; value: GeoPlace | null; onChange: (p: GeoPlace | null) => void; onUnavailable?: () => void; placeholder?: string }) {
  const reduce = useReduceMotion();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [state, setState] = useState<State>('idle');
  const [asked, setAsked] = useState('');
  const pop = useRef(new Animated.Value(1)).current;
  const popAnim = useRef<Animated.CompositeAnimation | null>(null);
  // Chiuso il foglio (o smontato il campo) durante il piccolo rimbalzo di conferma, l'animazione si ferma.
  useEffect(() => () => popAnim.current?.stop(), []);
  const input = useRef<TextInputInstance>(null);
  // Una risposta arrivata dopo una nuova ricerca (o dopo aver svuotato il campo) non sovrascrive quella giusta.
  const seq = useRef(0);
  const note =
    state === 'empty'
      ? `Nessun risultato per “${asked}”`
      : state === 'error'
        ? 'Non riesco a cercare adesso. Riprova tra poco.'
        : state === 'unavailable'
          ? 'La ricerca dei luoghi non è attiva in questo momento.'
          : null;
  // Il riquadro entra quando cambia ciò che mostra, non a ogni passaggio di stato (niente sfarfallio durante la ricerca).
  const appear = useAppear(`${asked}|${results.length}|${note ?? ''}`);

  // Autocompletamento: si cerca da soli mentre si scrive, senza dover premere Invio sulla tastiera.
  const searchRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || term === asked) return;
    const t = setTimeout(() => void searchRef.current(), 450);
    return () => clearTimeout(t);
  }, [q, asked]);

  async function search() {
    const term = q.trim();
    if (term.length < 3) return setState('short');
    const n = ++seq.current;
    setState('busy');
    try {
      const r = await ext.geo.search(term);
      if (n !== seq.current) return;
      setAsked(term);
      setResults(r.results.slice(0, 6));
      setState(r.results.length ? 'idle' : 'empty');
    } catch (e) {
      if (n !== seq.current) return;
      const msg = String((e as Error)?.message ?? '');
      const unavailable = /non è configurata|non raggiungibile|limite giornaliero/i.test(msg);
      setAsked(term);
      setResults([]);
      setState(unavailable ? 'unavailable' : 'error');
      if (unavailable) onUnavailable?.();
    }
  }

  searchRef.current = search;

  function clear() {
    seq.current++;
    setAsked('');
    setQ('');
    setResults([]);
    setState('idle');
    input.current?.focus();
  }

  function pick(p: GeoPlace) {
    onChange(p);
    setResults([]);
    setQ('');
    setState('idle');
    popAnim.current?.stop();
    if (reduce) return pop.setValue(1);
    pop.setValue(0.92);
    popAnim.current = Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true });
    popAnim.current.start();
  }

  if (value) {
    return (
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Text style={[type.subhead, { color: color.textSecondary, marginBottom: S.xs }]}>{label}</Text>
        <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`${shortPlace(value.name)}, località verificata. Tocca per cambiarla`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, padding: S.md, borderRadius: R.card, backgroundColor: color.accentTint, borderWidth: 1, borderColor: color.accent, opacity: pressed ? 0.75 : 1 })}>
          <Ionicons name="location" size={22} color={color.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
              {shortPlace(value.name)}
            </Text>
            <Text style={[type.caption, { color: color.textSecondary }]} numberOfLines={1}>
              Località verificata · tocca per cambiarla
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={22} color={color.accent} />
        </Pressable>
      </Animated.View>
    );
  }

  const canSearch = q.trim().length >= 3;
  const showPanel = results.length > 0 || note !== null;

  return (
    <View style={{ gap: S.sm }}>
      <Text style={[type.subhead, { color: color.textSecondary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingLeft: S.xs, paddingRight: S.xs, borderRadius: R.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder }}>
        <View style={{ width: HIT - 4, height: HIT, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no">
          <Ionicons name="search" size={20} color={q ? color.accent : color.textSecondary} />
        </View>
        <TextInput
          ref={input}
          value={q}
          onChangeText={(v) => {
            setQ(v);
            if (state === 'short' && v.trim().length >= 3) setState('idle');
          }}
          onSubmitEditing={() => void search()}
          placeholder={placeholder}
          placeholderTextColor={color.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={label}
          accessibilityHint="Scrivi almeno 3 lettere: i suggerimenti compaiono da soli"
          style={{ flex: 1, color: color.text, ...type.body, paddingVertical: S.md }}
        />
        {state === 'busy' ? (
          <View style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={color.accent} accessibilityLabel="Ricerca in corso" />
          </View>
        ) : q ? (
          <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Cancella la ricerca" hitSlop={4} style={({ pressed }) => ({ width: HIT - 8, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close-circle" size={20} color={color.textSecondary} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void search()}
          disabled={!canSearch || state === 'busy'}
          accessibilityRole="button"
          accessibilityLabel="Cerca"
          accessibilityState={{ disabled: !canSearch }}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.pill, justifyContent: 'center', marginLeft: S.xs, backgroundColor: canSearch ? (pressed ? color.accentPressed : color.accent) : color.surfaceElevated })}
        >
          <Text style={[type.subhead, { fontWeight: '700', color: canSearch ? color.onAccent : color.textTertiary }]}>Cerca</Text>
        </Pressable>
      </View>
      {state === 'short' ? <Text style={[type.footnote, { color: color.textSecondary }]}>Scrivi almeno 3 lettere.</Text> : null}
      {showPanel ? (
        <Animated.View style={appear}>
          <Panel style={{ overflow: 'hidden' }}>
            {results.map((r, i) => {
              const l = placeLines(r);
              return (
                <Fragment key={`${r.lat},${r.lng},${i}`}>
                  {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.separator, marginLeft: 52 }} /> : null}
                  <Pressable
                    onPress={() => pick(r)}
                    accessibilityRole="button"
                    accessibilityLabel={[l.title, l.detail].filter(Boolean).join(', ')}
                    accessibilityHint="Sceglie questa località"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingHorizontal: S.lg, paddingVertical: S.sm, backgroundColor: pressed ? color.surfacePressed : 'transparent' })}>
                    <Ionicons name="location" size={20} color={color.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                        {l.title}
                      </Text>
                      {l.detail ? (
                        <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={1}>
                          {l.detail}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </Fragment>
              );
            })}
            {note ? (
              <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: results.length ? StyleSheet.hairlineWidth : 0, borderTopColor: color.separator, gap: 2 }} accessibilityLiveRegion="polite">
                <Text style={[type.footnote, { color: color.textSecondary }]}>{note}</Text>
                {state === 'empty' ? <Text style={[type.footnote, { color: color.textTertiary }]}>Controlla il nome o prova con la città più vicina.</Text> : null}
              </View>
            ) : null}
          </Panel>
        </Animated.View>
      ) : null}
    </View>
  );
}
