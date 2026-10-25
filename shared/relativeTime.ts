/** Italiano essenziale senza Intl: compatibile anche con i motori senza RelativeTimeFormat. */
export function relativeFromNow(iso: string, now = new Date()): string {
  const delta = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(delta)) return '';
  const minutes = Math.floor(Math.abs(delta) / 60_000);
  if (minutes === 0) return 'adesso';
  const future = delta > 0;
  const phrase = (amount: number, unit: string) => future ? `tra ${amount} ${unit}` : `${amount} ${unit} fa`;
  if (minutes < 60) return phrase(minutes, 'min');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return phrase(hours, 'h');
  const days = Math.floor(hours / 24);
  if (days === 1) return future ? 'domani' : 'ieri';
  return phrase(days, 'giorni');
}
