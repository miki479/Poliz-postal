import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const node = (type: unknown, props: any) => ({ type, props });
const theme = { color: { accent: '#34C4CA', brand: '#8662EF', bg: '#101418', separator: '#222', controlBorder: '#555' }, GUTTER: 20, HIT: 44, S: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }, R: {}, M: {}, type: {} };
function renderModule(path: string, imports: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const base = {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    react: { useRef: (current: unknown) => ({ current }), useEffect() {}, useLayoutEffect() {}, useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()] },
    '@/constants/theme': theme,
    ...imports,
  };
  new Function('require', 'exports', code)((name: keyof typeof base) => base[name] ?? {}, exports);
  return exports;
}

it('il footer del wizard occupa spazio reale e non copre più data/ora o ultimo campo', () => {
  const frame = renderModule('mobile/src/components/event/EventFrame.tsx', {
    'react-native': { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text', StyleSheet: { hairlineWidth: 1 } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    '@/components/event/Stepper': { Stepper: 'Stepper' },
  });
  const tree = frame.EventFrame({ title: 'Crea un’uscita', steps: ['Attività', 'Dettagli'], index: 0, onBack() {}, onCancel() {}, footer: 'Avanti', children: 'Data e ora' });
  const [header, scroll, footer] = tree.props.children;
  expect(header.props.style.paddingTop).toBeGreaterThanOrEqual(44);
  expect(scroll.type).toBe('ScrollView');
  expect(scroll.props.style.flex).toBe(1);
  expect(footer.props.style.position).toBeUndefined();
  expect(footer.props.style.flexShrink).toBe(0);
  expect(footer.props.style.paddingBottom).toBeGreaterThan(34);
  expect(scroll.props.contentContainerStyle.paddingBottom).toBeLessThan(100);
});

it('gli avatar mantengono un cerchio e le stesse dimensioni con foto, iniziale e cornici', () => {
  const component = renderModule('mobile/src/components/AvatarCircle.tsx', { 'react-native': { View: 'View', Image: 'Image', Text: 'Text' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' } });
  for (const size of [26, 40, 84]) for (const frame of ['none', 'ring', 'double']) {
    const avatar = component.AvatarCircle({ name: 'Anna', hue: 180, size, frame });
    expect(avatar.props.style).toMatchObject({ width: size, height: size, borderRadius: size / 2 });
    const inner = avatar.props.children;
    expect(inner.props.style.width).toBe(inner.props.style.height);
    expect(inner.props.style.borderRadius).toBe(inner.props.style.width / 2);
    expect(inner.props.style.overflow).toBe('hidden');
  }
});

it('il pulsante Cerca avvia la ricerca località senza invio della tastiera', async () => {
  const search = vi.fn().mockResolvedValue({ results: [] });
  class Value { interpolate() { return 0; } }
  const component = renderModule('mobile/src/components/PlacePicker.tsx', {
    react: { useRef: (current: unknown) => ({ current }), useEffect() {}, useLayoutEffect() {}, useState: (initial: unknown) => [initial === '' ? 'Forlì' : typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()] },
    'react-native': { View: 'View', Pressable: 'Pressable', Text: 'Text', TextInput: 'Input', Animated: { Value }, StyleSheet: { hairlineWidth: 1 } },
    '@/components/ui': { useReduceMotion: () => true, Panel: 'Panel' },
    '@/lib/api': { ext: { geo: { search } } },
  });
  const tree = component.PlacePicker({ label: 'Città', value: null, onChange() {} });
  const field = tree.props.children[1];
  const button = field.props.children.find((child: any) => child?.props?.accessibilityLabel === 'Cerca località');
  expect(button.props.disabled).toBe(false);
  button.props.onPress();
  await Promise.resolve();
  expect(search).toHaveBeenCalledWith('Forlì');
});
