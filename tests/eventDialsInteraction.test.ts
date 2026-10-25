import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as levels from '../shared/eventLevel.ts';
import { paceFromFields } from '../mobile/src/lib/paceInput.ts';

type Node = { type: unknown; props: Record<string, any> };
function harness() {
  let cursor = 0; const slots: unknown[] = [];
  const state = (initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  class Value { setValue() {} interpolate() { return 0; } stopAnimation() {} }
  const node = (type: unknown, props: Node['props']) => ({ type, props });
  const textType = { lineHeight: 20, fontSize: 15 };
  const imports: Record<string, unknown> = {
    react: { useState: state, useRef: (initial: unknown) => state(() => ({ current: initial }))[0], useEffect() {}, useLayoutEffect: (fn: () => void) => fn() },
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { Animated: { Value, View: 'AnimatedView', timing: () => ({ start() {} }), spring: () => ({ start() {} }) }, Easing: {}, PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) }, Pressable: 'Pressable', Text: 'Text', View: 'View', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, StyleSheet: { create: (value: unknown) => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, top: 0, left: 0, right: 0 }) },
    'expo-router': { useIsFocused: () => true },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-haptics': { selectionAsync: () => Promise.resolve() }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'react-native-svg': { default: 'Svg', Path: 'Path' },
    '@/components/event/colors': { alpha: (c: string) => c, mix: (c: string) => c },
    '@/components/event/SectionTitle': { SectionTitle: 'SectionTitle' },
    '@/components/SportIcon': { ActivityGlyph: 'Glyph', AnimatedActivityFigure: 'MovingFigure' },
    '@/components/ui': { Banner: 'Banner', Button: 'Button', Field: 'Field', IconButton: 'IconButton', useReduceMotion: () => false },
    '@/constants/activityColors': { styleOfSport: () => ({ solid: '#35C6CF', glyph: 'run' }) },
    '@/constants/theme': { color: {}, HIT: 44, M: {}, R: {}, S: {}, type: { title2: textType, footnote: textType, subhead: textType } },
    '@/lib/paceInput': { paceFromFields }, '@shared/eventLevel.ts': levels,
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/components/EventDials.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  return { render: (name: string, props: unknown) => { cursor = 0; return exports[name](props) as Node; } };
}
function find(node: Node, predicate: (node: Node) => boolean): Node {
  if (predicate(node)) return node;
  const children = [node.props.children].flat(Infinity).filter(Boolean) as Node[];
  for (const child of children) if (typeof child === 'object' && child.props) {
    try { return find(child, predicate); } catch { /* continua sugli altri nodi */ }
  }
  throw new Error('Controllo non trovato');
}

it('il tap sulla card ritmo apre il pannello e conferma 5:30 senza dipendere dal tasto Invio', () => {
  const h = harness(); const onChange = vi.fn();
  const props = { sport: 'running', value: null, km: null, onChange };
  const render = () => h.render('PaceDial', props);
  let tree = render();
  expect(find(tree, (n) => n.type === 'Modal').props.visible).toBe(false);
  find(tree, (n) => n.type === 'Pressable' && n.props.accessibilityLabel?.startsWith('Ritmo:')).props.onPress();
  tree = render(); expect(find(tree, (n) => n.type === 'Modal').props.visible).toBe(true);
  expect(find(tree, (n) => n.type === 'KeyboardAvoidingView').props.behavior).toBe('padding');
  find(tree, (n) => n.type === 'Field' && n.props.label === 'Minuti').props.onChangeText('5');
  tree = render(); find(tree, (n) => n.type === 'Field' && n.props.label === 'Secondi').props.onChangeText('30');
  tree = render(); find(tree, (n) => n.type === 'Button' && n.props.title === 'Conferma ritmo').props.onPress();
  expect(onChange).toHaveBeenCalledWith(330);
  expect(find(render(), (n) => n.type === 'Modal').props.visible).toBe(false);
});

it('il livello prende il trascinamento orizzontale e lascia libero lo scroll verticale', () => {
  const h = harness(); const onChange = vi.fn();
  const props = { sport: 'running', level: 2, auto: true, onChange, onReset: vi.fn() };
  const render = () => h.render('LevelBar', props);
  let tree = render();
  find(tree, (n) => !!n.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 200 } } });
  tree = render();
  const bar = find(tree, (n) => n.props.accessibilityLabel === 'Livello dell’uscita');
  expect(bar.props.onMoveShouldSetPanResponderCapture({}, { dx: 20, dy: 2 })).toBe(true);
  expect(bar.props.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: 20 })).toBe(false);
  bar.props.onPanResponderGrant({ nativeEvent: { pageX: 30 } });
  bar.props.onPanResponderMove({ nativeEvent: { pageX: 190 } });
  bar.props.onPanResponderRelease();
  expect(onChange).toHaveBeenCalledWith(4);
});
