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
