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

/** Icone Runngo minimali (bianco semitrasparente, 256 px): si colorano con tintColor secondo il tema. */
export const SESSION_FIGURE: Record<string, { src: number; ratio: number }> = {
  run: { src: require('../../assets/images/icons/run.png') as number, ratio: 1 },
  easy: { src: require('../../assets/images/icons/easy.png') as number, ratio: 1 },
  tempo: { src: require('../../assets/images/icons/tempo.png') as number, ratio: 1 },
  short: { src: require('../../assets/images/icons/short.png') as number, ratio: 1 },
  repeats: { src: require('../../assets/images/icons/repeats.png') as number, ratio: 1 },
  intervals: { src: require('../../assets/images/icons/intervals.png') as number, ratio: 1 },
  hills: { src: require('../../assets/images/icons/hills.png') as number, ratio: 1 },
  trail: { src: require('../../assets/images/icons/trail.png') as number, ratio: 1 },
  long: { src: require('../../assets/images/icons/long.png') as number, ratio: 1 },
  fartlek: { src: require('../../assets/images/icons/fartlek.png') as number, ratio: 1 },
  fartlekvar: { src: require('../../assets/images/icons/fartlekvar.png') as number, ratio: 1 },
  race: { src: require('../../assets/images/icons/race.png') as number, ratio: 1 },
  strength: { src: require('../../assets/images/icons/strength.png') as number, ratio: 1 },
  stretch: { src: require('../../assets/images/icons/stretch.png') as number, ratio: 1 },
  training: { src: require('../../assets/images/icons/training.png') as number, ratio: 1 },
  other: { src: require('../../assets/images/icons/other.png') as number, ratio: 1 },
  walk: { src: require('../../assets/images/icons/walk.png') as number, ratio: 1 },
  fastwalk: { src: require('../../assets/images/icons/fastwalk.png') as number, ratio: 1 },
  group: { src: require('../../assets/images/icons/group.png') as number, ratio: 1 },
};

