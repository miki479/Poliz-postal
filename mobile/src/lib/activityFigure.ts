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
function arm(shoulder: FigurePoint, phase: number, run: number, effort: number): string {
  'worklet';
  const swing = Math.sin(phase) * lerp(0.38, 0.86, run) * effort;
  const bend = lerp(0.35, 1.85, run);
  const elbow = at(shoulder, swing, 2.8); const wrist = at(elbow, swing + bend, 2.45);
  return `M${coord(shoulder)} Q${coord(at(shoulder, swing, 1.4))} ${coord(elbow)} Q${coord(at(elbow, swing + bend, 1.2))} ${coord(wrist)}`;
}
function leg(hip: FigurePoint, phase: number, run: number, effort: number): string {
  'worklet';
  const wave = Math.sin(phase); const thigh = wave * lerp(0.42, 0.95, run) * effort;
  const bend = lerp(0.12, 0.3, run) + Math.max(0, -wave) * lerp(0.4, 1.4, run);
  const knee = at(hip, thigh, 3.6); const ankle = at(knee, thigh - bend, 3.55);
  const toe = point(ankle.x + 1.35, ankle.y - 0.12);
  return `M${coord(hip)} Q${coord(at(hip, thigh, 1.8))} ${coord(knee)} Q${coord(at(knee, thigh - bend, 1.8))} ${coord(ankle)} L${coord(toe)}`;
}
/** run=0 camminata, run=1 corsa; i valori intermedi sono posture valide. */
export function figureGeometry(run: number, phase = FIGURE_REST_PHASE, intensity = 0.75): FigureGeometry {
  'worklet';
  const gait = clamp(Number.isFinite(run) ? run : 1, 0, 1);
  const effort = 0.7 + 0.3 * clamp(Number.isFinite(intensity) ? intensity : 0.75, 0, 1);
  const theta = Number.isFinite(phase) ? phase % TAU : FIGURE_REST_PHASE;
  const rise = Math.cos(theta * 2) * lerp(0.08, 0.32, gait);
  const hip = point(lerp(11.5, 10.75, gait), 12.8 + rise);
  const shoulder = point(lerp(11.8, 13, gait), 7.35 + rise);
  const head = point(lerp(12.1, 14.1, gait), 3.6 + rise);
  const neck = point(lerp(11.9, 13.4, gait), 5.8 + rise);
  const torso = `M${neck.x - 0.65} ${neck.y} Q${shoulder.x - 1.2} ${shoulder.y - 0.45} ${hip.x - 0.7} ${hip.y} Q${hip.x} ${hip.y + 0.65} ${hip.x + 0.9} ${hip.y + 0.1} L${shoulder.x + 1.25} ${shoulder.y + 0.2} Q${shoulder.x + 1.15} ${shoulder.y - 0.9} ${neck.x + 0.65} ${neck.y} Z`;
  const shorts = `M${hip.x - 1.05} ${hip.y - 1.2} Q${hip.x} ${hip.y - 0.8} ${hip.x + 1.1} ${hip.y - 1.1} L${hip.x + 1.35} ${hip.y + 1.2} L${hip.x - 1.2} ${hip.y + 1.1} Z`;
  return { head, torso, shorts, backArm: arm(shoulder, theta, gait, effort), frontArm: arm(shoulder, theta + Math.PI, gait, effort), backLeg: leg(hip, theta + Math.PI, gait, effort), frontLeg: leg(hip, theta, gait, effort) };
}
/** Frequenza illustrativa derivata dalla scelta, mai una misura di cadenza dell'atleta. */
export function figureMotion(glyph: FigureGlyph, pace?: number | null, level = 2) {
  const walk = glyph === 'walk';
  const slow = walk ? 900 : glyph === 'trail' ? 780 : glyph === 'run_walk' ? 840 : 540;
  const fast = walk ? 420 : glyph === 'trail' ? 300 : glyph === 'run_walk' ? 360 : 210;
  const intensity = pace != null && Number.isFinite(pace) && pace > 0 ? clamp((slow - pace) / (slow - fast), 0, 1) : clamp(level / 4, 0, 1);
  return { run: walk ? 0 : glyph === 'run_walk' ? 0.5 : 1, intensity, stepsPerSecond: walk ? 1.15 + intensity * 0.65 : 1.85 + intensity * 1.25 };
}
