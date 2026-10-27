export type DatePart = 'date' | 'time';
/** The calendar and the clock edit independent parts of the same local date. */
export function mergeDatePart(value: Date, part: DatePart, chosen: Date): Date {
  const next = new Date(value);
  if (part === 'date') next.setFullYear(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
  else next.setHours(chosen.getHours(), chosen.getMinutes(), 0, 0);
  return next;
}
