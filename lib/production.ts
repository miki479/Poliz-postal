export type TeamId = 'ms' | 'ga';
export type ShiftSlot = 'morning' | 'afternoon';

export type ProductCounts = {
  steel25: number;
  plastic20: number;
  bib10: number;
};

export type ShiftEntry = ProductCounts & {
  pauseTaken: boolean;
  staffCount: number;
};

export type ProductionRecord = {
  id: string;
  date: string;
  isSingleShift: boolean;
  morningTeam: TeamId;
  morning: ShiftEntry;
  afternoon: ShiftEntry;
  createdAt: string;
  updatedAt: string;
};

export type TeamReport = ProductCounts & {
  team: TeamId;
  units: number;
  hours: number;
  rate: number;
  personHours: number;
  perPersonHour: number;
  shifts: number;
  pauses: number;
  reducedStaff: number;
  wins: number;
};

export const TEAMS: Record<TeamId, { name: string; short: string; people: string }> = {
  ms: { name: 'Michele & Simone', short: 'M&S', people: 'Michele · Simone' },
  ga: { name: 'Gabriele & Arthur', short: 'G&A', people: 'Gabriele · Arthur' },
};

export const PRODUCTS = [
  { key: 'steel25' as const, label: 'Acciaio', detail: '25 litri', accent: 'steel' },
  { key: 'plastic20' as const, label: 'Plastica', detail: '20 litri', accent: 'plastic' },
  { key: 'bib10' as const, label: 'Bag in box', detail: '10 litri', accent: 'bag' },
];

export const EMPTY_SHIFT: ShiftEntry = {
  steel25: 0,
  plastic20: 0,
  bib10: 0,
  pauseTaken: false,
  staffCount: 4,
};

export function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localMonthInput(date = new Date()) {
  return localDateInput(date).slice(0, 7);
}

export function dateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isFriday(date: string) {
  return dateFromInput(date).getDay() === 5;
}

export function isWeekend(date: string) {
  const day = dateFromInput(date).getDay();
  return day === 0 || day === 6;
}

export function shiftHours(slot: ShiftSlot, date: string, pauseTaken: boolean) {
  const base = slot === 'morning' ? 8 : 6.75;
  const fridayReduction = isFriday(date) ? 1 : 0;
  const pauseReduction = pauseTaken ? 0.5 : 0;
  return Math.max(0, base - fridayReduction - pauseReduction);
}

export function shiftUnits(shift: ProductCounts) {
  return shift.steel25 + shift.plastic20 + shift.bib10;
}

export function teamForSlot(record: ProductionRecord, slot: ShiftSlot): TeamId {
  if (slot === 'morning') return record.morningTeam;
  return record.morningTeam === 'ms' ? 'ga' : 'ms';
}

function emptyReport(team: TeamId): TeamReport {
  return {
    team,
    steel25: 0,
    plastic20: 0,
    bib10: 0,
    units: 0,
    hours: 0,
    rate: 0,
    personHours: 0,
    perPersonHour: 0,
    shifts: 0,
    pauses: 0,
    reducedStaff: 0,
    wins: 0,
  };
}

export function buildReport(records: ProductionRecord[], month: string) {
  const relevant = records.filter((record) => record.date.startsWith(month));
  const compared = relevant.filter((record) => !record.isSingleShift);
  const teams: Record<TeamId, TeamReport> = { ms: emptyReport('ms'), ga: emptyReport('ga') };
  let draws = 0;

  for (const record of compared) {
    const dayRates: Partial<Record<TeamId, number>> = {};
    for (const slot of ['morning', 'afternoon'] as const) {
      const team = teamForSlot(record, slot);
      const shift = record[slot];
      const hours = shiftHours(slot, record.date, shift.pauseTaken);
      const units = shiftUnits(shift);
      const report = teams[team];
      report.steel25 += shift.steel25;
      report.plastic20 += shift.plastic20;
      report.bib10 += shift.bib10;
      report.units += units;
      report.hours += hours;
      report.personHours += hours * shift.staffCount;
      report.shifts += 1;
      if (shift.pauseTaken) report.pauses += 1;
      if (shift.staffCount < 4) report.reducedStaff += 1;
      dayRates[team] = hours > 0 ? units / hours : 0;
    }

    const msRate = dayRates.ms ?? 0;
    const gaRate = dayRates.ga ?? 0;
    if (Math.abs(msRate - gaRate) < 0.01) draws += 1;
    else if (msRate > gaRate) teams.ms.wins += 1;
    else teams.ga.wins += 1;
  }

  for (const team of Object.values(teams)) {
    team.rate = team.hours > 0 ? team.units / team.hours : 0;
    team.perPersonHour = team.personHours > 0 ? team.units / team.personHours : 0;
  }

  const winner: TeamId | null = teams.ms.rate === teams.ga.rate ? null : teams.ms.rate > teams.ga.rate ? 'ms' : 'ga';
  const loser: TeamId | null = winner === 'ms' ? 'ga' : winner === 'ga' ? 'ms' : null;
  const advantage = winner && loser
    ? teams[loser].rate > 0
      ? ((teams[winner].rate / teams[loser].rate) - 1) * 100
      : Number.POSITIVE_INFINITY
    : 0;

  return {
    relevant,
    compared,
    excluded: relevant.length - compared.length,
    teams,
    winner,
    advantage,
    draws,
  };
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits }).format(value);
}

export function formatDate(date: string, style: 'long' | 'short' = 'long') {
  return new Intl.DateTimeFormat('it-IT', style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(dateFromInput(date));
}

export function formatMonth(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex - 1, 1));
}

export function recordIsValid(value: unknown): value is ProductionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ProductionRecord>;
  if (typeof record.id !== 'string' || typeof record.date !== 'string') return false;
  if (record.morningTeam !== 'ms' && record.morningTeam !== 'ga') return false;
  if (typeof record.isSingleShift !== 'boolean') return false;
  return ['morning', 'afternoon'].every((slot) => {
    const shift = record[slot as ShiftSlot];
    return Boolean(shift)
      && ['steel25', 'plastic20', 'bib10', 'staffCount'].every((key) => Number.isFinite(shift?.[key as keyof ShiftEntry]))
      && typeof shift?.pauseTaken === 'boolean';
  });
}

export function createRecord(date = localDateInput()): ProductionRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    date,
    isSingleShift: false,
    morningTeam: 'ms',
    morning: { ...EMPTY_SHIFT },
    afternoon: { ...EMPTY_SHIFT },
    createdAt: now,
    updatedAt: now,
  };
}
