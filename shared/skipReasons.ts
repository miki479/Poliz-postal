export const SKIP_REASONS = {
  time: 'Non ho tempo',
  injury: 'Infortunio o dolore',
  illness: 'Non sto bene',
  tired: 'Sono stanco',
  vacation: 'Sono in vacanza',
  other: 'Altro',
} as const;
export type SkipReason = keyof typeof SKIP_REASONS;
