/** Welcome slides must never advance while someone is reading with assistive technology or outside the app. */
export function canPlayWelcome(input: { active: boolean; reducedMotion: boolean; screenReader: boolean; paused: boolean }): boolean {
  return input.active && !input.reducedMotion && !input.screenReader && !input.paused;
}
