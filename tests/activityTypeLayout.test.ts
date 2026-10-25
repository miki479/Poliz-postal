import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';

type Element = { type: unknown; props: Record<string, any> };
const sports = ['running', 'walking', 'trail', 'run_walk', 'other'];
function renderChoices(width: number, fontScale: number) {
  const node = (type: unknown, props: Element['props']) => ({ type, props });
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { View: 'View', StyleSheet: { create: (value: unknown) => value }, useWindowDimensions: () => ({ width, fontScale }) },
    '@/constants/eventStyle': { EVENT_SPORTS: sports },
    '@/constants/theme': { color: {}, S: { sm: 8, xl: 20 }, R: { card: 16 } },
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('mobile/src/components/event/TypePicker.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  const onChange = vi.fn();
  const tree = exports.TypeCards({ value: 'run_walk', onChange }) as Element;
  const rows = tree.props.children as Element[];
  const choices = rows.map((row) => [row.props.children].flat(Infinity).filter((item) => item?.props?.sport) as Element[]);
  return { choices, onChange };
}

it('a 375 px mantiene cinque opzioni e passa a due colonne con testo ingrandito', () => {
  expect(renderChoices(375, 1).choices.map((row) => row.length)).toEqual([3, 2]);
  const { choices, onChange } = renderChoices(375, 1.4);
  expect(choices.map((row) => row.length)).toEqual([2, 2, 1]);
  expect(choices.flat().map((item) => item.props.sport)).toEqual(sports);
  const mixed = choices.flat().find((item) => item.props.sport === 'run_walk')!;
  expect(mixed.props.on).toBe(true);
  mixed.props.onPress();
  expect(onChange).toHaveBeenCalledWith('run_walk');
  expect(renderChoices(320, 1).choices.map((row) => row.length)).toEqual([2, 2, 1]);
  expect(renderChoices(375, 2).choices.map((row) => row.length)).toEqual([1, 1, 1, 1, 1]);
});
