import { formatPace, parsePace, utcToZoned, zonedToUtcIso, deviceTimezone, startOfWeekIso } from '@shared/time.ts';
import type { Level, SessionKind, SportId } from '@shared/types.ts';

export { formatPace, parsePace, utcToZoned, zonedToUtcIso, deviceTimezone, startOfWeekIso };

const LOCALE = 'it-IT';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDay = (iso: string, tz: string) => cap(new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)));
export const fmtDayShort = (iso: string, tz: string) => cap(new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)));
export const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtDate = (iso: string) => new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
export const fmtDateTimeShort = (iso: string) => new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const dayNumber = (iso: string, tz: string) => new Intl.DateTimeFormat(LOCALE, { timeZone: tz, day: 'numeric' }).format(new Date(iso));
export const monthShort = (iso: string, tz: string) => new Intl.DateTimeFormat(LOCALE, { timeZone: tz, month: 'short' }).format(new Date(iso)).replace('.', '');

export function relativeFromNow(iso: string, now = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 60000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diff / 60), 'hour');
  return rtf.format(Math.round(diff / 1440), 'day');
}

export const fmtKm = (km: number) => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(km)} km`;
export const fmtPace = (sec: number | null) => (sec ? `${formatPace(sec)}/km` : '');

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`;
}
export function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const SPORT_LABEL: Record<SportId, string> = { running: 'Corsa', walking: 'Camminata', trail: 'Trail', run_walk: 'Corsa + camminata', other: 'Altro', cycling: 'Ciclismo', padel: 'Padel', football5: 'Calcetto' };
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Principiante', easy: 'Tranquillo', medium: 'Intermedio', hard: 'Sostenuto', advanced: 'Avanzato' };
export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'beginner', label: 'Principiante', hint: 'Per chi inizia' },
  { id: 'easy', label: 'Tranquillo', hint: 'Si chiacchiera correndo' },
  { id: 'medium', label: 'Intermedio', hint: 'Ritmo costante' },
  { id: 'hard', label: 'Sostenuto', hint: 'Per chi è allenato' },
  { id: 'advanced', label: 'Avanzato', hint: 'Per chi è molto allenato' },
];
/** Tipi selezionabili, nello stesso ordine del server (shared/sports.ts). */
export const SPORTS_ENABLED: Array<{ id: SportId; label: string }> = (['running', 'walking', 'trail', 'run_walk', 'other'] as const).map((id) => ({ id, label: SPORT_LABEL[id] }));

export const KIND_LABEL: Record<SessionKind, string> = {
  run_easy: 'Corsa facile',
  run_continuous: 'Corsa continua',
  run_intervals: 'Ripetute',
  run_progressive: 'Progressivo',
  run_long: 'Lungo',
  run_free: 'Corsa libera',
  run_walk: 'Corsa e camminata',
  aerobic: 'Aerobico',
  strength: 'Forza',
  rest: 'Riposo',
  recovery_active: 'Recupero attivo',
  mobility: 'Mobilità',
};

export const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function eventShareText(title: string, startsAt: string, tz: string): string {
  return `${title} — ${fmtDay(startsAt, tz)} alle ${fmtTime(startsAt, tz)}. Vieni a correre con noi su RUNNGO!`;
}

/** Valore e unità separati, per mostrare l'unità più piccola del numero. */
export function kmParts(km: number): [string, string] {
  return [new Intl.NumberFormat(LOCALE, { maximumFractionDigits: km < 10 ? 2 : 1 }).format(km), 'km'];
}
export function paceParts(sec: number): [string, string] {
  return [formatPace(sec), '/km'];
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Oggi · 19:30", "Domani · 08:30", "Sab 25 ott · 08:30" nel fuso dell'uscita. */
export function whenLabel(iso: string, tz: string, now = new Date()): string {
  const d = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = fmtTime(iso, tz);
  if (sameDay(d, now)) return `Oggi · ${time}`;
  if (sameDay(d, tomorrow)) return `Domani · ${time}`;
  return `${fmtDayShort(iso, tz)} · ${time}`;
}

/** "oggi", "ieri", "3 giorni fa" o la data. */
export function dayAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'oggi';
  if (sameDay(d, y)) return 'ieri';
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  return days < 7 ? `${days} giorni fa` : fmtDate(iso);
}

export const hoursUntil = (iso: string, now = new Date()) => (Date.parse(iso) - now.getTime()) / 3_600_000;

export const CHALLENGE_TYPE_LABEL: Record<import('@shared/types.ts').ChallengeType, string> = {
  most_runs: 'Più uscite',
  most_distance: 'Più distanza',
  most_active_days: 'Più giorni attivi',
  collective_distance: 'Obiettivo di gruppo',
  personal_goal: 'Obiettivo personale',
};
export const CHALLENGE_PHASE_LABEL: Record<import('@shared/types.ts').ChallengePhase, string> = { upcoming: 'In arrivo', running: 'In corso', closing: 'In chiusura', ended: 'Conclusa', cancelled: 'Annullata' };
