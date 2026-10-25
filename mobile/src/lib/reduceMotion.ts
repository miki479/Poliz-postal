/** Preferenza unica per l'intera sessione: false finché il sistema non risponde. */
let current = false;
let started: Promise<void> | undefined;
const listeners = new Set<() => void>();
export const getReduceMotion = () => current;
export const subscribeReduceMotion = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

interface Source {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(event: 'reduceMotionChanged', fn: (value: boolean) => void): { remove(): void };
}

/** Chiamato dal layout una sola volta. Il listener vive quanto l'app, non quanto una schermata. */
export function initializeReduceMotion(source: Source): Promise<void> {
  if (started) return started;
  let changed = false;
  const update = (value: boolean) => {
    if (value === current) return;
    current = value;
    listeners.forEach((fn) => fn());
  };
  source.addEventListener('reduceMotionChanged', (value) => { changed = true; update(value); });
  started = source.isReduceMotionEnabled().then((value) => {
    if (!changed) update(value);
  }, () => {});
  return started;
}
