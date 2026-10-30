import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';

it('la barra Expo 58 usa emitter/navigateToTab e il comando Registra apre la route esistente', () => {
  const node = (type: unknown, props: any) => ({ type, props });
  const push = vi.fn();
  const Tabs = Object.assign('Tabs', { Screen: 'Screen' });
  class Value { interpolate() { return 0; } }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { Fragment: 'Fragment', useEffect() {}, useState: (initial: () => unknown) => [initial(), vi.fn()] },
    'react-native': { Animated: { Value }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 20 }) },
    'expo-router': { Tabs, router: { push } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '@/lib/session': { useSession: () => ({ me: null }) },
    '@/components/ui': { Avatar: 'Avatar' },
    '@/lib/useReduceMotion': { useReduceMotion: () => false },
    '@/constants/theme': { color: {}, R: {}, S: { xs: 4, sm: 8 }, type: {} },
  };
  const recordExports: Record<string, any> = {};
  const recordCode=ts.transpileModule(readFileSync('mobile/src/components/RecordTabBar.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports',recordCode)((name:string)=>imports[name]??{},recordExports);
  imports['@/components/RecordTabBar']=recordExports;
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/app/(tabs)/_layout.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  const layout = exports.default();
  const navigateToTab = vi.fn(); const emit = vi.fn(() => ({ defaultPrevented: false }));
  const state = { index: 0, routes: ['index', 'esplora', 'medaglie', 'profilo'].map((name) => ({ name, key: `${name}-key` })) };
  const element = layout.props.tabBar({ state, emitter: { emit }, navigateToTab });
  const bar = element.type(element.props);
  const entries = bar.props.children.props.children;
  entries[0].props.children[1].props.onPress();
  expect(navigateToTab).not.toHaveBeenCalled();
  entries[1].props.children[1].props.onPress();
  expect(navigateToTab).toHaveBeenCalledWith('esplora-key');
  const record = entries[2].props.children[0];
  const button = record.type(record.props); button.props.onPress();
  expect(push).toHaveBeenCalledWith('/registra');
  expect(entries.filter(Boolean)).toHaveLength(4);
  expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'esplora-key', canPreventDefault: true });
});
