import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ActivityStyle } from '@/constants/activityColors';

/**
 * Figure di corsa e camminata: stesso tratto (2), stessi estremi arrotondati, stessa griglia 24×24.
 * La camminata è eretta e simmetrica; la corsa ha busto inclinato in avanti, braccia flesse e falcata ampia.
 * Sono vettori (nessuna immagine) e prendono il colore passato: vanno bene su sfondo chiaro e scuro.
 *
 * Derivate dalle stesse linee (nessun disegno a parte, così restano coerenti):
 *  - trail: il corridore, un po' più piccolo, che sale su un pendio;
 *  - corsa + camminata: le due figure affiancate, chi cammina a sinistra e chi corre a destra.
 *
 * `pose` (facoltativa) serve solo alle illustrazioni animate: 0 è la figura di sempre, 1 è il passo successivo
 * con gambe e braccia scambiate. Corsa: dalla falcata aperta alla spinta (ginocchio avanti alto, gamba dietro distesa);
 * camminata: gamba tesa avanti e gamba piegata dietro. Alternandole la figura corre o cammina.
 */
export type Glyph = 'run' | 'walk' | 'trail' | 'run_walk';
export type Pose = 0 | 1;

/** Gambe e braccia per posa; testa e busto non cambiano. La posa 0 è identica alla figura originale. */
const RUN_LIMBS: Record<Pose, readonly string[]> = {
  0: ['M10.5 13.5 L15 15 L14 20.5', 'M10.5 13.5 L7.5 17.5 L3.5 17', 'M13.2 8.8 L17 10.5 L19.5 8', 'M13.2 8.8 L9.5 9.5 L7 12.5'],
  1: ['M10.5 13.5 L14.4 13.9 L13.1 18.4', 'M10.5 13.5 L8.6 17.7 L6.1 20.6', 'M13.2 8.8 L16.3 11 L18.6 9.4', 'M13.2 8.8 L10.1 10.3 L8.3 13.1'],
};
const RUN_TORSO = 'M14 7.5 L10.5 13.5';
const RUN_HEAD = { cx: 16, cy: 4 };

const WALK_LIMBS: Record<Pose, readonly string[]> = {
  0: ['M12 14 L9.5 21', 'M12 14 L15 17.5 L15 21', 'M12.4 9 L9.5 12.5', 'M12.4 9 L15.5 12'],
  1: ['M12 14 L14.6 21', 'M12 14 L10.4 17.6 L8.4 20.3', 'M12.4 9 L15.1 12.4', 'M12.4 9 L9.9 12.3'],
};
const WALK_TORSO = 'M12.5 7.5 L12 14';
const WALK_HEAD = { cx: 12.5, cy: 4 };

/* ---------- figure derivate: stesse linee, scalate e spostate una volta sola ---------- */

const r2 = (n: number) => Math.round(n * 100) / 100;
interface Fit {
  s: number;
  dx: number;
  dy: number;
}
/** Applica scala e spostamento alle coppie "x y" di un tracciato fatto solo di M/L. */
const fitPath = (d: string, f: Fit) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${r2(Number(x) * f.s + f.dx)} ${r2(Number(y) * f.s + f.dy)}`);
const fitPoint = (p: { cx: number; cy: number }, f: Fit) => ({ cx: r2(p.cx * f.s + f.dx), cy: r2(p.cy * f.s + f.dy) });

interface Figure {
  head: { cx: number; cy: number };
  r: number;
  torso: string;
  limbs: Record<Pose, readonly string[]>;
}
function fitFigure(head: { cx: number; cy: number }, torso: string, limbs: Record<Pose, readonly string[]>, f: Fit, r: number): Figure {
  return { head: fitPoint(head, f), r, torso: fitPath(torso, f), limbs: { 0: limbs[0].map((d) => fitPath(d, f)), 1: limbs[1].map((d) => fitPath(d, f)) } };
}

/** Trail: corridore al 78% che sale verso destra; il piede d'appoggio tocca il pendio. */
const TRAIL_FIT: Fit = { s: 0.78, dx: 2.5, dy: 1.8 };
const TRAIL_RUNNER = fitFigure(RUN_HEAD, RUN_TORSO, RUN_LIMBS, TRAIL_FIT, 1.8);
const TRAIL_SLOPE = 'M2 22.5 L22 16.5';

/** Corsa + camminata: due figure al 75%, separate da uno spazio libero, piedi sulla stessa linea. */
const PAIR_WALKER = fitFigure(WALK_HEAD, WALK_TORSO, WALK_LIMBS, { s: 0.75, dx: -4.1, dy: 5.75 }, 1.5);
const PAIR_RUNNER = fitFigure(RUN_HEAD, RUN_TORSO, RUN_LIMBS, { s: 0.75, dx: 7.17, dy: 6 }, 1.5);

function Lines({ fig, c, pose }: { fig: Figure; c: string; pose: Pose }) {
  return (
    <>
      <Circle cx={fig.head.cx} cy={fig.head.cy} r={fig.r} fill={c} stroke="none" />
      <Path d={fig.torso} />
      {fig.limbs[pose].map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </>
  );
}

function Run({ size, c, pose = 0 }: { size: number; c: string; pose?: Pose }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={RUN_HEAD.cx} cy={RUN_HEAD.cy} r={2} fill={c} stroke="none" />
      <Path d={RUN_TORSO} />
      {RUN_LIMBS[pose].map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </Svg>
  );
}

function Walk({ size, c, pose = 0 }: { size: number; c: string; pose?: Pose }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={WALK_HEAD.cx} cy={WALK_HEAD.cy} r={2} fill={c} stroke="none" />
      <Path d={WALK_TORSO} />
      {WALK_LIMBS[pose].map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </Svg>
  );
}

function Trail({ size, c, pose = 0 }: { size: number; c: string; pose?: Pose }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={TRAIL_SLOPE} />
      <Lines fig={TRAIL_RUNNER} c={c} pose={pose} />
    </Svg>
  );
}

function RunWalk({ size, c, pose = 0 }: { size: number; c: string; pose?: Pose }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Lines fig={PAIR_WALKER} c={c} pose={pose} />
      <Lines fig={PAIR_RUNNER} c={c} pose={pose} />
    </Svg>
  );
}

export function SportGlyph({ glyph, size = 20, color, pose = 0 }: { glyph: Glyph; size?: number; color: string; pose?: Pose }) {
  if (glyph === 'walk') return <Walk size={size} c={color} pose={pose} />;
  if (glyph === 'trail') return <Trail size={size} c={color} pose={pose} />;
  if (glyph === 'run_walk') return <RunWalk size={size} c={color} pose={pose} />;
  return <Run size={size} c={color} pose={pose} />;
}

/** Icona di un'attività: figura vettoriale per corsa, camminata, trail e corsa + camminata, Ionicons per le altre categorie. */
export function ActivityGlyph({ style, size = 20, color }: { style: ActivityStyle; size?: number; color: string }) {
  if (style.glyph) return <SportGlyph glyph={style.glyph} size={size} color={color} />;
  return <Ionicons name={style.icon} size={size} color={color} />;
}
