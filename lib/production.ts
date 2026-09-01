export type TeamId = 'ms' | 'ga';
export type ShiftSlot = 'morning' | 'afternoon';

export type ProductCounts = {
  steel25: number;
  plastic20: number;
  bib10: number;
};

export type StoppageEntry = {
  id: string;
  label: string;
  minutes: number;
};

export type ShiftEntry = ProductCounts & {
  pauseTaken: boolean;
  staffCount: number;
  stoppageMinutes?: number;
  stoppages?: StoppageEntry[];
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
  standardHours: number;
  productionIndex: number;
  challengeHours: number;
  challengeStandardHours: number;
  challengeProductionIndex: number;
  timeBalanceMinutes: number;
  personHours: number;
  shifts: number;
  pauses: number;
  stoppageMinutes: number;
  stoppageCount: number;
  handoverMinutes: number;
  recoveredMinutes: number;
  reducedStaff: number;
  wins: number;
};

export const TEAMS: Record<TeamId, { name: string; short: string; people: string }> = {
  ms: { name: 'Michele & Simone', short: 'M&S', people: 'Michele · Simone' },
  ga: { name: 'Gabriele & Arthur', short: 'G&A', people: 'Gabriele · Arthur' },
};

export const PRODUCTS = [
  { key: 'steel25' as const, label: 'Acciaio', detail: '25 litri', target: 120, accent: 'steel' },
  { key: 'plastic20' as const, label: 'Plastica', detail: '20 litri', target: 33, accent: 'plastic' },
  { key: 'bib10' as const, label: 'Bag in box', detail: '10 litri', target: 260, accent: 'bag' },
];

export const PRODUCTION_TARGETS = {
  steel25TwoHeads: 120,
  steel25OneHead: 65,
  plastic20: 33,
  bib10: 260,
} as const;

export const EMPTY_SHIFT: ShiftEntry = {
  steel25: 0,
  plastic20: 0,
  bib10: 0,
  pauseTaken: false,
  staffCount: 4,
  stoppageMinutes: 0,
  stoppages: [],
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

export function shiftStoppages(shift: ShiftEntry): StoppageEntry[] {
  const entries = Array.isArray(shift.stoppages)
    ? shift.stoppages
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.label === 'string' && Number.isFinite(entry.minutes) && entry.minutes > 0)
      .map((entry) => ({ ...entry, minutes: Math.max(1, Math.round(entry.minutes)) }))
    : [];
  if (entries.length) return entries;

  const legacyMinutes = Math.max(0, Math.round(Number(shift.stoppageMinutes) || 0));
  return legacyMinutes ? [{ id: 'legacy-total', label: 'Fermate registrate', minutes: legacyMinutes }] : [];
}

export function shiftStoppageMinutes(shift: ShiftEntry) {
  return shiftStoppages(shift).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function shiftHours(slot: ShiftSlot, date: string, pauseTaken: boolean, stoppageMinutes = 0) {
  const base = slot === 'morning' ? 8 : 6.75;
  const fridayReduction = isFriday(date) ? 1 : 0;
  const pauseReduction = pauseTaken ? 0.5 : 0;
  const stoppageReduction = Math.max(0, Number(stoppageMinutes) || 0) / 60;
  return Math.max(0, base - fridayReduction - pauseReduction - stoppageReduction);
}

export function shiftUnits(shift: ProductCounts) {
  return shift.steel25 + shift.plastic20 + shift.bib10;
}

export function shiftStandardHours(shift: ShiftEntry) {
  const steel25Target = shift.staffCount < 4
    ? PRODUCTION_TARGETS.steel25OneHead
    : PRODUCTION_TARGETS.steel25TwoHeads;
  return (
    shift.steel25 / steel25Target
    + shift.plastic20 / PRODUCTION_TARGETS.plastic20
    + shift.bib10 / PRODUCTION_TARGETS.bib10
  );
}

export function shiftProductionIndex(shift: ShiftEntry, netHours: number) {
  return netHours > 0 ? (shiftStandardHours(shift) / netHours) * 100 : 0;
}

export function shiftTimeBalanceMinutes(shift: ShiftEntry, netHours: number) {
  return (shiftStandardHours(shift) - netHours) * 60;
}

export function recordHandover(record: ProductionRecord) {
  const morningStops = shiftStoppageMinutes(record.morning);
  const afternoonStops = shiftStoppageMinutes(record.afternoon);
  const morningScheduledHours = shiftHours('morning', record.date, record.morning.pauseTaken);
  const morningAvailableHours = shiftHours('morning', record.date, record.morning.pauseTaken, morningStops);
  const afternoonAvailableHours = shiftHours('afternoon', record.date, record.afternoon.pauseTaken, afternoonStops);
  const morningStandardHours = shiftStandardHours(record.morning);
  const afternoonStandardHours = shiftStandardHours(record.afternoon);
  const totalStandardHours = morningStandardHours + afternoonStandardHours;

  // La produzione giornaliera spetta prima al mattino fino alle sue ore disponibili.
  // Il pomeriggio completa il resto e il tempo non usato viene considerato pulizia.
  const morningScheduledTargetHours = Math.min(totalStandardHours, morningScheduledHours);
  const morningEvaluationHours = Math.min(totalStandardHours, morningAvailableHours);
  const afternoonEvaluationHours = Math.min(afternoonStandardHours, afternoonAvailableHours);
  const plannedAfternoonHours = Math.max(0, totalStandardHours - morningScheduledHours);
  const morningBalanceMinutes = (morningStandardHours - morningEvaluationHours) * 60;
  const afternoonBalanceMinutes = (afternoonStandardHours - afternoonEvaluationHours) * 60;
  const morningScheduleBalanceMinutes = (morningStandardHours - morningScheduledTargetHours) * 60;
  const afternoonScheduleBalanceMinutes = (afternoonStandardHours - plannedAfternoonHours) * 60;
  const handedOverMinutes = Math.max(0, -morningScheduleBalanceMinutes);
  const recoveredMinutes = Math.min(handedOverMinutes, Math.max(0, afternoonScheduleBalanceMinutes));
  const morningLoad = morningAvailableHours > 0 ? morningStandardHours / morningAvailableHours : 0;
  const afternoonLoad = afternoonAvailableHours > 0 ? afternoonStandardHours / afternoonAvailableHours : 0;
  const challengeComparable = morningLoad >= 0.5 && afternoonLoad >= 0.5;

  return {
    morningProductionIndex: morningAvailableHours > 0 ? (morningStandardHours / morningAvailableHours) * 100 : 0,
    afternoonProductionIndex: afternoonAvailableHours > 0 ? (afternoonStandardHours / afternoonAvailableHours) * 100 : 0,
    challengeComparable,
    morningEvaluationHours,
    afternoonEvaluationHours,
    morningAvailableHours,
    afternoonAvailableHours,
    morningStandardHours,
    afternoonStandardHours,
    morningBalanceMinutes,
    afternoonBalanceMinutes,
    morningScheduleBalanceMinutes,
    afternoonScheduleBalanceMinutes,
    handedOverMinutes,
    recoveredMinutes,
    remainingMinutes: Math.max(0, handedOverMinutes - recoveredMinutes),
    machineDelayMinutes: Math.min(handedOverMinutes, morningStops),
  };
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
    standardHours: 0,
    productionIndex: 0,
    challengeHours: 0,
    challengeStandardHours: 0,
    challengeProductionIndex: 0,
    timeBalanceMinutes: 0,
    personHours: 0,
    shifts: 0,
    pauses: 0,
    stoppageMinutes: 0,
    stoppageCount: 0,
    handoverMinutes: 0,
    recoveredMinutes: 0,
    reducedStaff: 0,
    wins: 0,
  };
}

export function buildReport(records: ProductionRecord[], month: string) {
  const relevant = records.filter((record) => record.date.startsWith(month));
  const compared = relevant.filter((record) => !record.isSingleShift);
  const teams: Record<TeamId, TeamReport> = { ms: emptyReport('ms'), ga: emptyReport('ga') };
  let draws = 0;
  let challengeCount = 0;
  let unbalanced = 0;

  for (const record of compared) {
    const handover = recordHandover(record);
    if (handover.challengeComparable) challengeCount += 1;
    else unbalanced += 1;
    teams[teamForSlot(record, 'morning')].handoverMinutes += handover.handedOverMinutes;
    teams[teamForSlot(record, 'afternoon')].recoveredMinutes += handover.recoveredMinutes;
    const dayIndexes: Partial<Record<TeamId, number>> = {};
    for (const slot of ['morning', 'afternoon'] as const) {
      const team = teamForSlot(record, slot);
      const shift = record[slot];
      const stoppageMinutes = shiftStoppageMinutes(shift);
      const hours = slot === 'morning' ? handover.morningAvailableHours : handover.afternoonAvailableHours;
      const units = shiftUnits(shift);
      const standardHours = shiftStandardHours(shift);
      const report = teams[team];
      report.steel25 += shift.steel25;
      report.plastic20 += shift.plastic20;
      report.bib10 += shift.bib10;
      report.units += units;
      report.hours += hours;
      report.standardHours += standardHours;
      if (handover.challengeComparable) {
        report.challengeHours += hours;
        report.challengeStandardHours += standardHours;
      }
      report.timeBalanceMinutes += slot === 'morning' ? handover.morningBalanceMinutes : handover.afternoonBalanceMinutes;
      report.personHours += hours * shift.staffCount;
      report.shifts += 1;
      if (shift.pauseTaken) report.pauses += 1;
      report.stoppageMinutes += stoppageMinutes;
      report.stoppageCount += shiftStoppages(shift).length;
      if (shift.staffCount < 4) report.reducedStaff += 1;
      dayIndexes[team] = slot === 'morning' ? handover.morningProductionIndex : handover.afternoonProductionIndex;
    }

    if (handover.challengeComparable) {
      const msIndex = dayIndexes.ms ?? 0;
      const gaIndex = dayIndexes.ga ?? 0;
      if (Math.abs(msIndex - gaIndex) < 0.01) draws += 1;
      else if (msIndex > gaIndex) teams.ms.wins += 1;
      else teams.ga.wins += 1;
    }
  }

  for (const team of Object.values(teams)) {
    team.productionIndex = team.hours > 0 ? (team.standardHours / team.hours) * 100 : 0;
    team.challengeProductionIndex = team.challengeHours > 0 ? (team.challengeStandardHours / team.challengeHours) * 100 : 0;
  }

  const winner: TeamId | null = !challengeCount || teams.ms.challengeProductionIndex === teams.ga.challengeProductionIndex
    ? null
    : teams.ms.challengeProductionIndex > teams.ga.challengeProductionIndex ? 'ms' : 'ga';
  const loser: TeamId | null = winner === 'ms' ? 'ga' : winner === 'ga' ? 'ms' : null;
  const advantage = winner && loser
    ? teams[loser].challengeProductionIndex > 0
      ? ((teams[winner].challengeProductionIndex / teams[loser].challengeProductionIndex) - 1) * 100
      : Number.POSITIVE_INFINITY
    : 0;
  const volumeLeader: TeamId | null = teams.ms.standardHours === teams.ga.standardHours
    ? null
    : teams.ms.standardHours > teams.ga.standardHours ? 'ms' : 'ga';

  return {
    relevant,
    compared,
    excluded: relevant.length - compared.length,
    teams,
    winner,
    advantage,
    volumeLeader,
    challengeCount,
    unbalanced,
    draws,
  };
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits }).format(value);
}

export function formatMinutes(value: number) {
  const rounded = Math.round(Math.abs(value));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
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
      && (shift?.stoppageMinutes === undefined || Number.isFinite(shift.stoppageMinutes))
      && (shift?.stoppages === undefined || (Array.isArray(shift.stoppages) && shift.stoppages.every((entry) => entry && typeof entry.id === 'string' && typeof entry.label === 'string' && Number.isFinite(entry.minutes))))
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
