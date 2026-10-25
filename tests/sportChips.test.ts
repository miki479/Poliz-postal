import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';
import { styleOfSport } from '../mobile/src/constants/activityColors.ts';
import { ENABLED_SPORTS } from '../shared/sports.ts';

it('i cinque sport conservano colori, icone e selezione con chip e testo a capo', () => {
  const node = (type: unknown, props: any) => ({ type, props });
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' },
    '@/components/SportIcon': { ActivityGlyph: 'Glyph' },
    '@/constants/activityColors': { styleOfSport },
    '@/constants/theme': { color: {}, HIT: 44, R: { pill: 99 }, S: { sm: 8, md: 12 }, type: {} },
    '@/lib/format': { SPORTS_ENABLED: ENABLED_SPORTS },
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/components/SportChips.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name], exports);
  const change = vi.fn();
  const tree = exports.SportChips({ label: 'Sport', value: 'running', onChange: change });
  const group = tree.props.children[1];
  expect(group.props.style.flexWrap).toBe('wrap');
  expect(group.props.children).toHaveLength(5);
  for (const chip of group.props.children) {
    const style = chip.props.style({ pressed: false });
    expect(style.maxWidth).toBe('100%');
    expect(style.height).toBeUndefined();
    const [glyph, text] = chip.props.children;
    expect(glyph.type).toBe('Glyph');
    expect(text.props.style[1].flexShrink).toBe(1);
    expect(text.props.numberOfLines).toBeUndefined();
    chip.props.onPress();
    const sport = change.mock.lastCall![0];
    expect(glyph.props.style).toEqual(styleOfSport(sport));
  }
  expect(change.mock.calls.map(([id]) => id)).toEqual(['running', 'walking', 'trail', 'run_walk', 'other']);
});
