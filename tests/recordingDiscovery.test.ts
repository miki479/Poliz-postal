import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import type { MapInsights } from '../shared/mapInsights.ts';
import type { TrackPoint } from '../shared/types.ts';

interface Node { type: unknown; props: Record<string, any> }
const node = (type: unknown, props: Record<string, any>): Node => ({ type, props });
const empty = (): MapInsights => ({ heat: [], routes: [], workouts: [], basis: null, gear: null, hasSharedTrace: false });
function all(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const value = tree as Node;
  return [value, ...all(value.props.children)];
}
function text(tree: Node): string {
  return all(tree).filter((n) => n.type === 'Text').map((n) => n.props.children).flat(Infinity).filter((v) => typeof v === 'string').join(' ');
}

/** Esegue RecordingMap vero con hook persistenti; viene simulata solo la parte nativa della mappa. */
function recordingMap(options: { data?: MapInsights; platform?: 'ios' | 'android'; pending?: Promise<MapInsights> } = {}) {
  const slots: any[] = []; let cursor = 0; let tree: Node; let pendingEffects: Array<() => void> = [];
  const native = { fitToCoordinates: vi.fn(), animateToRegion: vi.fn() };
  const request = vi.fn(() => options.pending ?? Promise.resolve(options.data ?? empty()));
  const react = {
    Fragment: 'Fragment',
    useCallback: (fn: () => unknown) => fn,
    useState(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [slots[i], (next: unknown) => { slots[i] = typeof next === 'function' ? (next as (value: unknown) => unknown)(slots[i]) : next; }];
    },
    useRef(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const i = cursor++; const previous = slots[i];
      if (previous && previous.deps.length === deps.length && deps.every((value, k) => Object.is(value, previous.deps[k]))) return;
      slots[i] = { deps, cleanup: previous?.cleanup };
      pendingEffects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); });
    },
  };
  const imports: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { Platform: { OS: options.platform ?? 'ios' }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'react-native-maps': { default: 'MapView', Circle: 'Circle', Polyline: 'Polyline' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'expo-router': { router: { push: vi.fn() } },
    '@/components/ui': { Button: 'Button', IconButton: 'IconButton', Panel: 'Panel', Pills: 'Pills', Row: 'Row', Sheet: 'Sheet', Skeleton: 'Skeleton', SwitchRow: 'SwitchRow', t: {} },
    '@/constants/theme': { color: { surface: '#111', overlay: '#222', accent: '#34C4CA', brandText: '#8662EF' }, R: {}, S: { xs: 4, sm: 8, md: 12 }, type: {} },
    '@/lib/api': { call: request },
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/components/RecordingDiscovery.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  let props: { track?: TrackPoint[]; height?: number; showLocation?: boolean } = {};
  const render = (next = props): Node => {
    props = next; cursor = 0; tree = exports.RecordingMap(props);
    const map = all(tree).find((n) => n.type === 'MapView')!;
    map.props.ref.current = native;
    return tree;
  };
  const flushEffects = () => { const effects = pendingEffects; pendingEffects = []; effects.forEach((effect) => effect()); };
  const settle = async () => { flushEffects(); await Promise.resolve(); render(); flushEffects(); };
  const find = (type: string) => all(tree).find((n) => n.type === type)!;
  render();
  return { render, flushEffects, settle, find, request, native, nodes: () => all(tree), text: () => text(tree) };
}

it('attende onMapReady e adatta la camera solo alle coordinate vere della registrazione', async () => {
  const track = [{ lat: 44.2211, lng: 12.0422, t: 0 }, { lat: 44.2233, lng: 12.0444, t: 60 }];
  const app = recordingMap();
  app.render({ track, showLocation: true });
  await app.settle();
  expect(app.native.fitToCoordinates).not.toHaveBeenCalled();
  expect(app.native.animateToRegion).not.toHaveBeenCalled();
  const map = app.find('MapView');
  expect(map.props.userInterfaceStyle).toBe('dark'); expect(map.props.mapType).toBe('mutedStandard');
  expect(map.props.showsUserLocation).toBe(true);
  map.props.onMapReady();
  expect(app.native.fitToCoordinates).toHaveBeenCalledWith([{ latitude: 44.2211, longitude: 12.0422 }, { latitude: 44.2233, longitude: 12.0444 }], { edgePadding: { top: 30, left: 30, right: 30, bottom: 30 }, animated: false });
  map.props.onMapReady(); expect(app.native.fitToCoordinates).toHaveBeenCalledTimes(1);
  expect(app.find('Polyline').props.coordinates).toEqual([{ latitude: 44.2211, longitude: 12.0422 }, { latitude: 44.2233, longitude: 12.0444 }]);
});

it('se i percorsi arrivano dopo che la mappa è pronta adatta la camera al risultato reale', async () => {
  let resolve!: (data: MapInsights) => void;
  const pending = new Promise<MapInsights>((ok) => { resolve = ok; });
  const app = recordingMap({ pending }); app.flushEffects();
  app.find('MapView').props.onMapReady();
  expect(app.native.fitToCoordinates).not.toHaveBeenCalled();
  resolve({ ...empty(), routes: [{ id: 'route', name: 'Parco', geometry: [{ lat: 45.1, lng: 9.1 }, { lat: 45.2, lng: 9.2 }], distanceKm: 4, favoriteCount: 1, reason: 'Percorso pubblico' }] });
  await app.settle();
  expect(app.native.fitToCoordinates.mock.calls[0][0]).toEqual([{ latitude: 45.1, longitude: 9.1 }, { latitude: 45.2, longitude: 9.2 }]);
});

it('consente il cambio stile e attiva heatmap/percorso solo dai dati ricevuti', async () => {
  const data = { ...empty(), heat: [{ lat: 45.12, lng: 9.12, weight: 3 }, { lat: 45.13, lng: 9.13, weight: 7 }], routes: [{ id: 'route', name: 'Parco', geometry: [{ lat: 45.1, lng: 9.1 }, { lat: 45.2, lng: 9.2 }], distanceKm: 4, favoriteCount: 1, reason: 'Percorso pubblico' }] };
  const app = recordingMap({ data, platform: 'android' }); await app.settle();
  expect(app.find('MapView').props.mapType).toBe('standard'); expect(app.find('MapView').props.userInterfaceStyle).toBe('dark');
  expect(app.nodes().filter((n) => n.type === 'Circle' || n.type === 'Polyline')).toEqual([]);
  app.find('IconButton').props.onPress(); app.render(); expect(app.find('Sheet').props.visible).toBe(true);
  const styles = app.nodes().find((n) => n.type === 'Pills' && n.props.options[0].value === 'night')!;
  styles.props.onChange('satellite'); app.render(); expect(app.find('MapView').props.mapType).toBe('satellite');
  const heat = app.nodes().find((n) => n.type === 'Pills' && n.props.options[0].value === 'off')!;
  heat.props.onChange('week'); app.render(); await app.settle();
  expect(app.request).toHaveBeenLastCalledWith('mapInsights', { period: 'week' });
  expect(app.nodes().filter((n) => n.type === 'Circle')).toHaveLength(6);
  expect(app.nodes().filter((n) => n.type === 'Circle').every((n) => data.heat.some((cell) => n.props.center.latitude === cell.lat && n.props.center.longitude === cell.lng))).toBe(true);
  app.find('SwitchRow').props.onChange(true); app.render();
  expect(app.find('Polyline').props.coordinates).toEqual([{ latitude: 45.1, longitude: 9.1 }, { latitude: 45.2, longitude: 9.2 }]);
});

it('senza dati non crea coordinate, tracce o calore dimostrativi e mostra gli stati vuoti', async () => {
  const app = recordingMap(); await app.settle();
  expect(app.find('MapView').props.initialRegion).toBeUndefined();
  app.find('MapView').props.onMapReady();
  expect(app.native.fitToCoordinates).not.toHaveBeenCalled(); expect(app.native.animateToRegion).not.toHaveBeenCalled();
  const heat = app.nodes().find((n) => n.type === 'Pills' && n.props.options[0].value === 'off')!;
  heat.props.onChange('global'); app.render(); await app.settle();
  app.find('SwitchRow').props.onChange(true); app.render();
  expect(app.nodes().filter((n) => n.type === 'Circle' || n.type === 'Polyline')).toEqual([]);
  expect(app.text()).toContain('abbastanza contributi condivisi');
  expect(app.text()).toContain('Nessun percorso con salvataggi');
});

it('il foglio con tastiera mantiene il footer fuori dallo scroll e consente i tocchi sui controlli', () => {
  class Value { interpolate() { return 0; } }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    react: { useRef: (current: unknown) => ({ current }), useEffect() {} },
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Animated: { Value, View: 'AnimatedView' }, StyleSheet: { create: (styles: unknown) => styles } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@/constants/theme': { color: {}, C: {}, S: { sm: 8, md: 12, lg: 16 }, R: {}, M: {}, type: {} },
    '@/lib/useReduceMotion': { useReduceMotion: () => true },
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/components/ui.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  const done = node('Button', { title: 'Conferma', onPress: vi.fn() });
  const sheet = exports.Sheet({ visible: true, title: 'Ritmo', children: 'Input', footer: done, avoidKeyboard: true, onClose() {} });
  expect(sheet.props.animationType).toBe('none');
  const keyboard = all(sheet).find((n) => n.type === 'KeyboardAvoidingView')!;
  expect(keyboard.props).toMatchObject({ enabled: true, behavior: 'padding' });
  const content = all(sheet).find((n) => n.type === 'AnimatedView')!;
  const scroll = all(content).find((n) => n.type === 'ScrollView')!;
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(content.props.children.at(-1).props.children).toBe(done);
  expect(content.props.style.paddingBottom).toBeGreaterThan(34);
});
