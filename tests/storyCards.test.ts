import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';

type Element = { type: unknown; props: Record<string, any> };
const node = (type: unknown, props: Element['props']) => ({ type, props });
function load(file: string, imports: Record<string, unknown>, expose = '') {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code + expose)((name: string) => imports[name] ?? {}, exports);
  return exports;
}
function descendants(tree: Element): Element[] {
  return [tree, ...[tree.props.children].flat(Infinity).filter((x) => x && typeof x === 'object' && x.props).flatMap(descendants)];
}
const theme = { color: {}, R: {}, S: { md: 12, xl: 20 }, GUTTER: 20, type: { headline: { lineHeight: 22 }, caption: { lineHeight: 16 } } };

it('Profilo collega la griglia al componente dei racconti mantenendo log, stato visto e proporzioni', () => {
  const mod = load('mobile/src/app/(tabs)/profilo.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { View: 'View', useWindowDimensions: () => ({ width: 375 }) },
    '@/components/StoryCard': { StoryCard: 'StoryCard' },
    '@/constants/achievements': { BADGE_KINDS: { beyond_limit: { tone: { solid: '#35C6CF' } } } },
    '@/constants/theme': theme,
  }, '\nexports.StoryGrid = StoriesTab;');
  const logs = [{ id: 'first' }, { id: 'second' }];
  const tree = mod.StoryGrid({ logs, seen: new Set(['story:first']) });
  const cards = descendants(tree).filter((x) => x.type === 'StoryCard');
  expect(cards.map((x) => [x.props.log.id, x.props.seen, x.props.width])).toEqual([['first', true, 161], ['second', false, 161]]);
  expect(cards.every((x) => x.props.all === logs)).toBe(true);
});

function story(options: { focused?: boolean; visible?: boolean; fontScale?: number; drawable?: boolean; measured?: boolean } = {}) {
  const push = vi.fn();
  const { focused = true, visible = true, fontScale = 1, drawable = true, measured = true } = options;
  const mod = load('mobile/src/components/StoryCard.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    react: { useMemo: (fn: () => unknown) => fn(), useEffect() {} },
    'react-native': { View: 'View', Text: 'Text', useWindowDimensions: () => ({ fontScale }) },
    'expo-router': { router: { push }, useIsFocused: () => focused },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'react-native-reanimated': { useSharedValue: () => ({ get: () => 0, set() {} }) },
    '@/components/RouteTrace': { RouteTrace: 'RouteTrace', isDrawableTrack: () => drawable },
    '@/components/Motion': { useVisible: () => ({ visible, ref: {}, onLayout() {} }) },
    '@/components/SportIcon': { AnimatedActivityFigure: 'Figure', ActivityGlyph: 'Glyph' },
    '@/components/ui': { PressableScale: 'Pressable', useReduceMotion: () => false },
    '@/constants/theme': theme,
    '@/lib/format': { dayAgo: () => 'ieri', fmtDate: () => '24 ott 2026', fmtClock: () => '30:00', fmtKm: () => '5 km' },
    '@/lib/storyPalette': { alpha: (x: string) => x, mix: (x: string) => x, storyPalette: () => ({ styles: [{ glyph: 'run' }], label: 'Corsa', variant: 'trace' }) },
  });
  const log = { id: 'real-run', title: 'Corsa al parco', track: [{ lat: 45, lng: 9, t: 0 }, { lat: 45.01, lng: 9, t: 1 }], distanceKm: measured ? 5 : null, durationSec: measured ? 1800 : 0 };
  return { tree: mod.StoryCard({ log, all: [log], width: 161 }), push, log };
}

it('racconto mostra traccia e misure reali, conserva la navigazione e lascia spazio al testo ingrandito', () => {
  const { tree, push, log } = story();
  const nodes = descendants(tree);
  expect(nodes.find((x) => x.type === 'RouteTrace')?.props.track).toBe(log.track);
  expect(nodes.some((x) => x.type === 'Text' && x.props.children === '5 km · 30:00')).toBe(true);
  nodes.find((x) => x.type === 'Pressable')!.props.onPress();
  expect(push).toHaveBeenCalledWith({ pathname: '/allenamento/storie/[id]', params: { id: 'real-run' } });
  expect(story({ fontScale: 1.5 }).tree.props.style.height).toBeGreaterThan(tree.props.style.height);
  expect(descendants(story({ focused: false }).tree).some((x) => x.type === 'RouteTrace')).toBe(false);
  expect(descendants(story({ visible: false }).tree).some((x) => x.type === 'RouteTrace')).toBe(false);
  expect(descendants(story({ drawable: false, measured: false }).tree).some((x) => x.type === 'RouteTrace')).toBe(false);
  expect(descendants(story({ drawable: false, measured: false }).tree).filter((x) => x.type === 'Text')).toHaveLength(2);
});
