/** Nessun valore implicito e nessun arrotondamento alla tacca dello slider. */
export function paceFromFields(minutes: string, seconds: string): number | null {
  if (!/^\d{1,2}$/.test(minutes.trim()) || !/^\d{1,2}$/.test(seconds.trim())) return null;
  const min = Number(minutes); const sec = Number(seconds); const total = min * 60 + sec;
  return sec < 60 && total >= 120 && total <= 900 ? total : null;
}
