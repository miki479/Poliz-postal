import { formatPace, utcToZoned, zonedToUtcIso } from '../shared/time.ts';
import type { EventView } from '../shared/types.ts';

const LOCALE = 'it-IT';

export function fmtDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}
export function fmtDayShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}
export function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export function dayNumber(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, day: 'numeric' }).format(new Date(iso));
}
export function monthShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, month: 'short' }).format(new Date(iso)).replace('.', '');
}
export function fmtDateTimeShort(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export { relativeFromNow } from '../shared/relativeTime.ts';

export function fmtKm(km: number): string {
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(km)} km`;
}
export { formatPace };

export function eventPath(e: Pick<EventView, 'id'>): string {
  return `/uscita/${e.id}`;
}

/** Link da condividere: per le uscite private include il token d'accesso. */
export function eventShareUrl(e: Pick<EventView, 'id' | 'visibility' | 'inviteToken'>): string {
  const base = `${window.location.origin}/uscita/${e.id}`;
  return e.visibility === 'private' && e.inviteToken ? `${base}?t=${e.inviteToken}` : base;
}

export function eventShareText(e: EventView): string {
  return `${e.title} — ${fmtDay(e.startsAt, e.timezone)} alle ${fmtTime(e.startsAt, e.timezone)}. Vieni a correre con noi!`;
}

/* ---------- intervalli per i filtri (nel fuso del dispositivo) ---------- */

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

export type DayFilter = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week';

export function dayRange(kind: DayFilter, now: Date, tz: string): { from: string | null; to: string | null } {
  if (kind === 'all') return { from: null, to: null };
  const today = utcToZoned(now.toISOString(), tz).date;
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domenica
  const start = (d: string) => zonedToUtcIso(d, '00:00', tz);
  switch (kind) {
    case 'today':
      return { from: null, to: start(addDays(today, 1)) };
    case 'tomorrow':
      return { from: start(addDays(today, 1)), to: start(addDays(today, 2)) };
    case 'week':
      return { from: null, to: start(addDays(today, 7)) };
    case 'weekend': {
      const toSat = dow === 0 ? -1 : 6 - dow; // se è domenica, il weekend è iniziato ieri
      const sat = addDays(today, toSat);
      return { from: start(sat), to: start(addDays(sat, 2)) };
    }
  }
}
