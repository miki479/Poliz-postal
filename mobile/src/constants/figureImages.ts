import type { SportId } from '@shared/types.ts';

/** Disegni a contorno (bianco su trasparente, da colorare con tintColor): corsa con le linee di vento, camminata e trail con lo zaino. */
const RUN = require('../../assets/images/fig-run.png') as number;
const HIKE = require('../../assets/images/fig-hike.png') as number;

export const FIGURE_IMAGE: Partial<Record<SportId, { src: number; ratio: number }>> = {
  running: { src: RUN, ratio: 315 / 245 },
  run_walk: { src: RUN, ratio: 315 / 245 },
  walking: { src: HIKE, ratio: 135 / 205 },
  trail: { src: HIKE, ratio: 135 / 205 },
};

/** Un\'uscita è sempre di gruppo: sulle schede delle uscite di corsa compare il gruppo di corridori. */
const GROUP = require('../../assets/images/fig-group.png') as number;
export const SCENE_FIGURE: Partial<Record<SportId, { src: number; ratio: number }>> = {
  ...FIGURE_IMAGE,
  running: { src: GROUP, ratio: 672 / 507 },
  run_walk: { src: GROUP, ratio: 672 / 507 },
};

/** Figure a colori per i tipi di allenamento del piano (dal set fornito). */
export const SESSION_FIGURE: Record<string, { src: number; ratio: number }> = {
  easy: { src: require('../../assets/images/fig/easy.png') as number, ratio: 0.741 },
  fartlek: { src: require('../../assets/images/fig/fartlek.png') as number, ratio: 0.902 },
  hills: { src: require('../../assets/images/fig/hills.png') as number, ratio: 0.804 },
  intervals: { src: require('../../assets/images/fig/intervals.png') as number, ratio: 0.839 },
  long: { src: require('../../assets/images/fig/long.png') as number, ratio: 0.775 },
  other: { src: require('../../assets/images/fig/other.png') as number, ratio: 0.852 },
  pilates: { src: require('../../assets/images/fig/pilates.png') as number, ratio: 1.411 },
  strength: { src: require('../../assets/images/fig/strength.png') as number, ratio: 0.956 },
  stretch: { src: require('../../assets/images/fig/stretch.png') as number, ratio: 0.996 },
  tempo: { src: require('../../assets/images/fig/tempo.png') as number, ratio: 0.765 },
  training: { src: require('../../assets/images/fig/training.png') as number, ratio: 0.974 },
  yoga: { src: require('../../assets/images/fig/yoga.png') as number, ratio: 0.417 },
};
