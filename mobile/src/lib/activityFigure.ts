/** Geometria comune: proporzioni umane costanti, articolazioni continue e reticolo 24×24. */
export type FigureGlyph = 'run' | 'walk' | 'trail' | 'run_walk';
export interface FigurePoint { x: number; y: number }
export interface FigureGeometry { head: FigurePoint; torso: string; shorts: string; backArm: string; frontArm: string; backLeg: string; frontLeg: string }
export const FIGURE_REST_PHASE = 1.1;
const TAU = Math.PI * 2;
function clamp(n: number, min: number, max: number) { 'worklet'; return Math.max(min, Math.min(max, n)); }
function lerp(a: number, b: number, f: number) { 'worklet'; return a + (b - a) * f; }
function point(x: number, y: number): FigurePoint { 'worklet'; return { x, y }; }
function at(p: FigurePoint, angle: number, length: number): FigurePoint { 'worklet'; return point(p.x + Math.sin(angle) * length, p.y + Math.cos(angle) * length); }
function coord(p: FigurePoint): string { 'worklet'; return `${p.x.toFixed(3)} ${p.y.toFixed(3)}`; }
/*
 * Pose prese dagli SVG dell'utente (omini a tratto unico, giunti arrotondati). Coordinate originali del disegno (circa 170 × 160),
 * riportate sul reticolo 24×24 da map(). Il movimento è il passaggio continuo tra la posa disegnata (A) e la stessa con
 * braccia e gambe scambiate (B): un passo completo.
 */
type Pt = readonly [number, number];
interface Pose { head: Pt; torso: [Pt, Pt]; armF: [Pt, Pt, Pt]; armB: [Pt, Pt, Pt]; legF: [Pt, Pt, Pt]; legB: [Pt, Pt, Pt] }
const RUN: Pose = { head: [115, 40], torso: [[110, 50], [85, 95]], armF: [[102, 62], [125, 75], [115, 95]], armB: [[102, 62], [75, 70], [60, 85]], legF: [[85, 95], [115, 120], [135, 155]], legB: [[85, 95], [60, 115], [40, 110]] };
const WALK: Pose = { head: [90, 38], torso: [[90, 48], [90, 98]], armF: [[90, 60], [108, 80], [120, 95]], armB: [[90, 60], [72, 80], [65, 95]], legF: [[90, 98], [115, 130], [128, 155]], legB: [[90, 98], [68, 130], [52, 155]] };
const SCALE = 0.15;
const CENTER: Record<'run' | 'walk', Pt> = { run: [87, 92], walk: [90, 91.5] };

function mix(a: Pt, b: Pt, f: number): Pt { 'worklet'; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
function line(points: Pt[], dy: number): string {
  'worklet';
  return points.map((q, i) => `${i ? 'L' : 'M'}${(12 + (q[0] - 90) * SCALE).toFixed(3)} ${(12 + (q[1] - 92) * SCALE + dy).toFixed(3)}`).join('');
}
function lerpChain(a: Pt[], b: Pt[], f: number): Pt[] { 'worklet'; return a.map((q, i) => mix(q, b[i], f)); }

/** run=0 camminata, run=1 corsa; i valori intermedi mescolano le due pose. */
export function figureGeometry(run: number, phase = FIGURE_REST_PHASE, intensity = 0.75): FigureGeometry {
  'worklet';
  const gait = clamp(Number.isFinite(run) ? run : 1, 0, 1);
  const effort = 0.7 + 0.3 * clamp(Number.isFinite(intensity) ? intensity : 0.75, 0, 1);
  const theta = Number.isFinite(phase) ? phase % TAU : FIGURE_REST_PHASE;
  // 0 = posa disegnata, 1 = posa con arti scambiati; l'ampiezza cresce con l'impegno
  // la figura resta a lungo sulle due pose disegnate e passa in fretta dall'una all'altra (niente posa "ripiegata" a metà)
  const wave = Math.sin(theta);
  const swap = clamp(0.5 + 0.5 * Math.tanh(2.6 * wave) / Math.tanh(2.6), 0, 1);
  const dy = Math.cos(theta * 2) * lerp(0.1, 0.28, gait);
  const blend = (r: Pt[], w: Pt[]) => lerpChain(w, r, gait);
  const armF = blend(RUN.armF, WALK.armF), armB = blend(RUN.armB, WALK.armB), legF = blend(RUN.legF, WALK.legF), legB = blend(RUN.legB, WALK.legB);
  const torso = blend(RUN.torso, WALK.torso);
  const headRaw = mix(WALK.head, RUN.head, gait);
  const aF = lerpChain(armF, armB, swap), aB = lerpChain(armB, armF, swap), lF = lerpChain(legF, legB, swap), lB = lerpChain(legB, legF, swap);
  return {
    head: point(12 + (headRaw[0] - 90) * SCALE, 12 + (headRaw[1] - 92) * SCALE + dy),
    torso: line(torso, dy),
    shorts: 'M0 0',
    backArm: line(aB, dy),
    frontArm: line(aF, dy),
    backLeg: line(lB, dy),
    frontLeg: line(lF, dy),
  };
}
/** Frequenza illustrativa derivata dalla scelta, mai una misura di cadenza dell'atleta. */
export function figureMotion(glyph: FigureGlyph, pace?: number | null, level = 2) {
  const walk = glyph === 'walk';
  const slow = walk ? 900 : glyph === 'trail' ? 780 : glyph === 'run_walk' ? 840 : 540;
  const fast = walk ? 420 : glyph === 'trail' ? 300 : glyph === 'run_walk' ? 360 : 210;
  const intensity = pace != null && Number.isFinite(pace) && pace > 0 ? clamp((slow - pace) / (slow - fast), 0, 1) : clamp(level / 4, 0, 1);
  return { run: walk ? 0 : glyph === 'run_walk' ? 0.5 : 1, intensity, stepsPerSecond: walk ? 1.15 + intensity * 0.65 : 1.85 + intensity * 1.25 };
}
