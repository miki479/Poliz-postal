import type { Segment } from './types.ts';
export const BEGINNER_SOURCE = {
  name: 'NHS Couch to 5K',
  url: 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/',
  checked: '2026-10-26',
};
export interface GuidedRun {
  id: string;
  week: number;
  run: number;
  title: string;
  durationSec: number;
  segments: Segment[];
}
// Durate pubblicate dal NHS, espresse in secondi. Indici alterni: corsa / camminata.
const repeat = (run: number, walk: number, n: number) => [...Array.from({ length: n }, () => [run, walk]).flat(), run];
const repeatWeek = (pattern: number[]) => [pattern, pattern, pattern];
const WEEKS: number[][][] = [
  repeatWeek(repeat(60, 90, 7)),
  repeatWeek(repeat(90, 120, 5)),
  repeatWeek([90, 90, 180, 180, 90, 90, 180]),
  repeatWeek([180, 90, 300, 150, 180, 90, 300]),
  [[300, 180, 300, 180, 300], [480, 300, 480], [1200]],
  [[300, 180, 480, 180, 300], [600, 180, 600], [1500]],
  repeatWeek([1500]),
  repeatWeek([1680]),
  repeatWeek([1800]),
];
export function beginnerRun(week: number, run: number): GuidedRun {
  if (!Number.isInteger(week) || !Number.isInteger(run) || week < 1 || week > 9 || run < 1 || run > 3)
    throw new Error('Seduta guidata non valida.');
  const segments: Segment[] = [
    { kind: 'warmup', label: 'Cammina per riscaldarti', durationSec: 300, reps: 1 },
    ...WEEKS[week - 1][run - 1].map((durationSec, i): Segment => ({
      kind: i % 2 === 0 ? 'run' : 'walk',
      label: i % 2 === 0 ? 'Corsa a un passo comodo' : 'Camminata di recupero',
      durationSec,
      reps: 1,
    })),
    { kind: 'cooldown', label: 'Cammina per defaticare', durationSec: 300, reps: 1 },
  ];
  return {
    id: `nhs-c25k-${week}-${run}`,
    week,
    run,
    title: `Inizia a correre · settimana ${week}, seduta ${run}`,
    durationSec: segments.reduce((n, s) => n + s.durationSec, 0),
    segments,
  };
}
export function guidedRunById(id: unknown): GuidedRun | null {
  if (typeof id !== 'string') return null;
  const m = /^nhs-c25k-([1-9])-([1-3])$/.exec(id);
  return m ? beginnerRun(Number(m[1]), Number(m[2])) : null;
}
export function guidedStep(segments: Segment[], elapsedSec: number) {
  let start = 0;
  const flat: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const first = segments[i];
    if (first.reps > 1 && segments[i + 1]?.reps === first.reps && first.kind === 'run' && segments[i + 1].kind === 'walk') {
      const second = segments[++i];
      for (let j = 0; j < first.reps; j++) flat.push({ ...first, reps: 1 }, { ...second, reps: 1 });
    } else for (let j = 0; j < Math.max(1, first.reps); j++) flat.push({ ...first, reps: 1 });
  }
  for (let i = 0; i < flat.length; i++) {
    const end = start + flat[i].durationSec;
    if (elapsedSec < end)
      return {
        index: i,
        total: flat.length,
        segment: flat[i],
        remainingSec: Math.max(0, Math.ceil(end - Math.max(0, elapsedSec))),
        next: flat[i + 1] ?? null,
        done: false,
      };
    start = end;
  }
  return { index: flat.length, total: flat.length, segment: null, remainingSec: 0, next: null, done: true };
}
