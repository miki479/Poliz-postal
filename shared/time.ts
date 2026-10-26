/** Utilità per fusi orari basate solo su Intl (nessuna dipendenza). */

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('it-IT', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
}

function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Converte data "YYYY-MM-DD" e ora "HH:mm" locali al fuso `tz` in ISO UTC. */
export function zonedToUtcIso(date: string, time: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t || !isValidTimezone(tz)) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Due passaggi per gestire correttamente i cambi ora legale.
  let utc = guess - offsetMinutes(guess, tz) * 60000;
  utc = guess - offsetMinutes(utc, tz) * 60000;
  const check = new Date(utc);
  if (Number.isNaN(check.getTime())) return null;
  // Rifiuta date inesistenti (es. 31 febbraio): rileggendo nel fuso si deve ottenere lo stesso giorno.
  const back = utcToZoned(check.toISOString(), tz);
  if (back.date !== date) return null;
  return check.toISOString();
}

export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Lunedì 00:00 della settimana corrente nel fuso indicato, come ISO UTC. */
export function startOfWeekIso(now: Date, tz: string): string {
  const { date } = utcToZoned(now.toISOString(), tz);
  const [y, m, d] = date.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lunedì
  const monday = new Date(Date.UTC(y, m - 1, d - dow));
  const mDate = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  return zonedToUtcIso(mDate, '00:00', tz) ?? monday.toISOString();
}

export function formatPace(secPerKm: number): string {
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/** "5:30" o "5.30" → secondi/km. */
export function parsePace(text: string): number | null {
  const m = /^\s*(\d{1,2})\s*[:.]\s*([0-5]\d)\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
