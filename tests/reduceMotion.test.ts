import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';

async function setup() {
  vi.resetModules();
  const store = await import('../mobile/src/lib/reduceMotion.ts');
  let resolve!: (value: boolean) => void;
  let reject!: () => void;
  let event!: (value: boolean) => void;
  const source = {
    isReduceMotionEnabled: vi.fn(() => new Promise<boolean>((ok, fail) => { resolve = ok; reject = fail; })),
    addEventListener: vi.fn((_name: string, fn: (value: boolean) => void) => { event = fn; return { remove() {} }; }),
  };
  const ready = store.initializeReduceMotion(source);
  return { store, source, ready, resolve, reject, event: (value: boolean) => event(value) };
}

/** Esegue il vero componente, simulando solo il driver nativo: registra i punti iniziali e finali. */
function calendar(reduce: boolean) {
  const values: number[] = [];
  const effects: Array<() => unknown> = [];
  const runs: Array<{ from: number; to: number; duration: number; delay?: number }> = [];
  class Value {
    constructor(public value: number) { values.push(value); }
    setValue(value: number) { this.value = value; }
    interpolate() { return 0; }
  }
  const code = ts.transpileModule(readFileSync('mobile/src/components/PlanCalendar.tsx', 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    react: { useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, () => {}], useEffect: (fn: () => unknown) => effects.push(fn) },
    'react-native': {
      Animated: { Value, timing: (v: Value, c: { toValue: number; duration: number; delay?: number }) => ({ start: () => runs.push({ from: v.value, to: c.toValue, duration: c.duration, delay: c.delay }), stop() {} }), parallel: (xs: Array<{ start(): void }>) => ({ start: () => xs.forEach((x) => x.start()), stop() {} }) },
      Easing: { out: (x: unknown) => x, back: () => 0 }, useWindowDimensions: () => ({ width: 375 }),
    },
    '@/components/ui': { useReduceMotion: () => reduce },
    '@/constants/theme': { color: { storyInk: '#fff' }, R: {}, S: {}, type: {} },
    '@/lib/format': { addDaysIso: (_s: string, i: number) => `2026-10-${19 + i}`, WEEKDAYS_SHORT: [] },
  };
  const exports: Record<string, any> = {};
  new Function('require', 'exports', code)((name: string) => imports[name] ?? {}, exports);
  exports.PlanCalendar({ weekStart: '2026-10-19', sessions: [] });
  effects.forEach((fn) => fn());
  return { values, runs };
}

describe('Preferenza movimento condivisa e ingresso calendario', () => {
  it('prima della risposta resta false e il calendario parte da zero', async () => {
    const { store, resolve, ready } = await setup();
    expect(store.getReduceMotion()).toBe(false);
    const c = calendar(store.getReduceMotion());
    expect(c.values.slice(0, 8)).toEqual(Array(8).fill(0));
    expect(c.runs.slice(0, 8)).toEqual([
      { from: 0, to: 1, duration: 520, delay: undefined },
      ...Array.from({ length: 7 }, (_, i) => ({ from: 0, to: 1, duration: 650, delay: 380 + i * 70 })),
    ]);
    resolve(false); await ready;
    expect(calendar(store.getReduceMotion()).runs[0].from).toBe(0);
  });
  it('riusa true già noto al montaggio, senza animare il calendario', async () => {
    const { store, resolve, ready } = await setup();
    resolve(true); await ready;
    const c = calendar(store.getReduceMotion());
    expect(c.values.slice(0, 8)).toEqual(Array(8).fill(1));
    expect(c.runs).toEqual([]);
  });
  it('legge una sola volta e un evento prevale sulla risposta iniziale tardiva', async () => {
    const { store, source, event, resolve, ready } = await setup();
    void store.initializeReduceMotion(source);
    const listener = vi.fn(); const off = store.subscribeReduceMotion(listener);
    event(true); resolve(false); await ready;
    expect(store.getReduceMotion()).toBe(true);
    event(false);
    expect(store.getReduceMotion()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    off(); event(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(source.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(source.addEventListener).toHaveBeenCalledTimes(1);
  });
  it('un errore iniziale non impedisce i successivi aggiornamenti', async () => {
    const { store, reject, ready, event } = await setup();
    reject(); await ready;
    expect(store.getReduceMotion()).toBe(false);
    event(true); expect(store.getReduceMotion()).toBe(true);
  });
});
