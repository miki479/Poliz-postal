/**
 * Briefing dopo l'allenamento: fatti calcolati dai dati (piano, storico personale, confronto anonimo con gli altri)
 * più un riepilogo scritto con regole fisse. Il Coach AI, se disponibile, può riscriverlo in modo più naturale ma
 * riceve SOLO questi fatti: non inventa numeri e non vede mai nomi, email o dati Strava/da file.
 */
import { isRunKind } from './exercises.ts';
import type { DbState, Id, PlannedSession, WorkoutLog } from './types.ts';

export interface BriefFacts {
  evidence?: 'gps' | 'imported' | 'declared';
  title: string;
  distanceKm: number | null;
  durationMin: number;
  paceSecPerKm: number | null;
  rpe: number | null;
  vsPlan: null | {
    sessionTitle: string;
    plannedMin: number;
    plannedKm: number | null;
    durationDeltaPct: number;
    distanceDeltaPct: number | null;
    asPlanned: boolean;
  };
  vsHistory: null | { count: number; avgPaceSecPerKm: number | null; paceDeltaSec: number | null; avgKm: number | null; kmDeltaPct: number | null };
  vsOthers: null | { runners: number; fasterThanPct: number; medianPaceSecPerKm: number; medianKm: number };
  next: Array<{ date: string; title: string; durationMin: number; kind: string }>;
}

const DAY = 86_400_000;
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);
const fmtPace = (s: number) => { const rounded = Math.round(s); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}/km`; };

function paceOf(l: WorkoutLog): number | null {
  return l.distanceKm && l.distanceKm >= 0.5 ? l.durationSec / l.distanceKm : null;
}

export function analyzeWorkout(db: DbState, log: WorkoutLog, now = new Date()): BriefFacts {
  const mine = log.userId;
  const logs = Object.values(db.workoutLogs);
  const isRun = isRunKind(log.kind);
  const pace = paceOf(log);

  const planned: PlannedSession | undefined = log.plannedSessionId ? db.sessions[log.plannedSessionId] : undefined;
  let vsPlan: BriefFacts['vsPlan'] = null;
  if (planned && planned.durationMin > 0) {
    const dd = pct(log.durationSec / 60, planned.durationMin);
    const kd = planned.distanceKm && log.distanceKm ? pct(log.distanceKm, planned.distanceKm) : null;
    vsPlan = { sessionTitle: planned.title, plannedMin: planned.durationMin, plannedKm: planned.distanceKm, durationDeltaPct: dd, distanceDeltaPct: kd, asPlanned: Math.abs(dd) <= 15 && (kd === null || Math.abs(kd) <= 15) };
  }

  const prev = logs
    .filter((l) => l.userId === mine && l.id !== log.id && isRunKind(l.kind) === isRun && l.startedAt < log.startedAt && l.startedAt > new Date(Date.parse(log.startedAt) - 60 * DAY).toISOString())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 5);
  let vsHistory: BriefFacts['vsHistory'] = null;
  if (prev.length) {
    const paces = prev.map(paceOf).filter((x): x is number => x !== null);
    const kms = prev.map((l) => l.distanceKm).filter((x): x is number => x !== null);
    const avgP = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
    const avgK = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null;
    vsHistory = {
      count: prev.length,
      avgPaceSecPerKm: avgP ? Math.round(avgP) : null,
      paceDeltaSec: avgP && pace ? Math.round(pace - avgP) : null,
      avgKm: avgK ? Math.round(avgK * 10) / 10 : null,
      kmDeltaPct: avgK && log.distanceKm ? pct(log.distanceKm, avgK) : null,
    };
  }

  // Confronto anonimo: stessi tipi di uscita (distanza simile) di ALTRI utenti negli ultimi 30 giorni. Servono almeno 5 runner.
  let vsOthers: BriefFacts['vsOthers'] = null;
  if (isRun && pace && log.distanceKm) {
    const lo = log.distanceKm * 0.5;
    const hi = log.distanceKm * 1.5;
    const since = new Date(Date.parse(log.startedAt) - 30 * DAY).toISOString();
    const byUser = new Map<Id, { pace: number; km: number }>();
    for (const l of logs) {
      // Solo allenamenti che i loro autori hanno scelto di condividere con i compagni: niente dati non condivisi nel confronto.
      if (l.userId === mine || !l.shared || !isRunKind(l.kind) || l.startedAt < since || l.startedAt > now.toISOString()) continue;
      const p = paceOf(l);
      if (!p || !l.distanceKm || l.distanceKm < lo || l.distanceKm > hi) continue;
      if (!byUser.has(l.userId)) byUser.set(l.userId, { pace: p, km: l.distanceKm }); // una sola uscita per runner: nessuno pesa di più
    }
    if (byUser.size >= 5) {
      const arr = [...byUser.values()];
      vsOthers = { runners: arr.length, fasterThanPct: Math.round((arr.filter((o) => o.pace > pace).length / arr.length) * 100), medianPaceSecPerKm: Math.round(median(arr.map((o) => o.pace))), medianKm: Math.round(median(arr.map((o) => o.km)) * 10) / 10 };
    }
  }

  const today = log.startedAt.slice(0, 10);
  const next = Object.values(db.sessions)
    .filter((s) => s.userId === mine && s.id !== log.plannedSessionId && s.date > today && (s.status === 'planned' || s.status === 'rescheduled'))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((s) => ({ date: s.date, title: s.title, durationMin: s.durationMin, kind: s.kind }));

  return { evidence: log.origin === 'strava' || log.origin === 'file' ? 'imported' : log.track?.length && log.distanceSource === 'gps' && !log.edited ? 'gps' : 'declared', title: log.title, distanceKm: log.distanceKm, durationMin: Math.round(log.durationSec / 60), paceSecPerKm: pace ? Math.round(pace) : null, rpe: log.rpe, vsPlan, vsHistory, vsOthers, next };
}

/** Riepilogo scritto con regole fisse (funziona anche senza AI). */
export function factsToText(f: BriefFacts): string {
  const out: string[] = [];
  const where = f.distanceKm ? `${f.distanceKm.toString().replace('.', ',')} km in ${f.durationMin} min${f.paceSecPerKm ? ` (${fmtPace(f.paceSecPerKm)})` : ''}` : `${f.durationMin} minuti`;
  let verdict = f.evidence === 'declared' ? `Hai dichiarato ${where}. Senza una traccia o un’attività importata non posso verificare lo svolgimento.` : `Hai completato ${where}.`;
  if (f.rpe !== null) verdict += f.rpe >= 9 ? ' Lo sforzo percepito è stato molto alto.' : f.rpe >= 7 ? ' Sforzo percepito impegnativo.' : f.rpe <= 4 ? ' Sforzo percepito leggero: hai margine.' : ' Sforzo percepito nella norma.';
  out.push(verdict);

  if (f.vsPlan) {
    const p = f.vsPlan;
    out.push(p.asPlanned ? `Sei in linea con il piano (“${p.sessionTitle || 'sessione'}”, ${p.plannedMin} min).` : p.durationDeltaPct > 0 ? `Hai fatto ${p.durationDeltaPct}% più a lungo del previsto (${p.plannedMin} min): bene l’impegno, ma non aumentare il carico troppo in fretta.` : `Sei stato ${Math.abs(p.durationDeltaPct)}% sotto la durata prevista (${p.plannedMin} min): capita, l’importante è la costanza.`);
  }
  if (f.vsHistory?.paceDeltaSec != null && f.vsHistory.avgPaceSecPerKm) {
    const d = f.vsHistory.paceDeltaSec;
    out.push(Math.abs(d) < 5 ? `Passo stabile rispetto alle ultime ${f.vsHistory.count} uscite (media ${fmtPace(f.vsHistory.avgPaceSecPerKm)}).` : d < 0 ? `Più veloce di ${Math.abs(d)} s/km rispetto alla tua media recente (${fmtPace(f.vsHistory.avgPaceSecPerKm)}).` : `Passo più tranquillo rispetto alle ultime attività (media ${fmtPace(f.vsHistory.avgPaceSecPerKm)}).`);
  } else if (!f.vsHistory) out.push('È la prima uscita di questo tipo che registro: dalla prossima potrò confrontarla con le precedenti.');
  if (f.vsOthers) out.push(`Su uscite di distanza simile condivise da altri ${f.vsOthers.runners} runner (passo mediano ${fmtPace(f.vsOthers.medianPaceSecPerKm)}), il tuo passo è più rapido del ${f.vsOthers.fasterThanPct}%. Il passo non misura l’impegno: è solo un riferimento.`);

  const n = f.next[0];
  let advice: string;
  if (f.rpe !== null && f.rpe >= 9) advice = 'Prossima volta: tienila facile e dai priorità al recupero, anche con una camminata.';
  else if (f.vsPlan && !f.vsPlan.asPlanned && f.vsPlan.durationDeltaPct > 15) advice = 'Prossima volta: rientra nei tempi del piano per non accumulare troppa fatica.';
  else if (f.rpe !== null && f.rpe <= 4 && f.vsPlan?.asPlanned) advice = 'Prossima volta: se ti senti bene puoi aggiungere qualche minuto a ritmo facile, senza superare il +10% settimanale.';
  else advice = 'Prossima volta: mantieni ritmo e durata del piano, senza forzare.';
  if (n) advice += ` Ti aspetta “${n.title || 'la prossima sessione'}” il ${n.date.slice(8)}/${n.date.slice(5, 7)} (${n.durationMin} min).`;
  out.push(advice);
  return out.join('\n');
}

/** Blocco di fatti passato al Coach AI: solo numeri, niente identificativi. */
export function factsToContext(f: BriefFacts): string {
  const L: string[] = ['DATI ALLENAMENTO (calcolati dal server, non inventare altri numeri):'];
  L.push(`- Fonte: ${f.evidence ?? 'declared'}. Se dichiarata, non affermare che l’allenamento è stato verificato o realmente svolto. Non dedurre lo svolgimento dalla sola spunta del piano.`);
  L.push(`- Appena concluso: ${f.distanceKm ?? 'distanza n.d.'} km, ${f.durationMin} min${f.paceSecPerKm ? `, passo ${fmtPace(f.paceSecPerKm)}` : ''}${f.rpe !== null ? `, fatica percepita ${f.rpe}/10` : ''}.`);
  if (f.vsPlan) L.push(`- Piano: previsti ${f.vsPlan.plannedMin} min${f.vsPlan.plannedKm ? ` e ${f.vsPlan.plannedKm} km` : ''}; durata ${f.vsPlan.durationDeltaPct >= 0 ? '+' : ''}${f.vsPlan.durationDeltaPct}% rispetto al previsto; ${f.vsPlan.asPlanned ? 'in linea' : 'fuori dalla tolleranza del 15%'}.`);
  if (f.vsHistory) L.push(`- Ultime ${f.vsHistory.count} uscite simili: passo medio ${f.vsHistory.avgPaceSecPerKm ? fmtPace(f.vsHistory.avgPaceSecPerKm) : 'n.d.'}${f.vsHistory.paceDeltaSec !== null ? ` (oggi ${f.vsHistory.paceDeltaSec >= 0 ? '+' : ''}${f.vsHistory.paceDeltaSec} s/km)` : ''}.`);
  else L.push('- Nessuna uscita precedente simile nello storico.');
  if (f.vsOthers) L.push(`- Confronto anonimo con ${f.vsOthers.runners} altri runner su distanze simili: più veloce del ${f.vsOthers.fasterThanPct}% (passo mediano ${fmtPace(f.vsOthers.medianPaceSecPerKm)}).`);
  else L.push('- Confronto con gli altri: dati insufficienti, non citarlo.');
  if (f.next.length) L.push(`- Prossime sessioni del piano: ${f.next.map((n) => `${n.date} ${n.title || n.kind} (${n.durationMin} min)`).join('; ')}.`);
  else L.push('- Nessuna sessione futura nel piano.');
  return L.join('\n');
}
