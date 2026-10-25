/**
 * Generatore di piani: deterministico e basato ESCLUSIVAMENTE sulle risposte dell'utente.
 * Nessuna AI, nessuna fonte esterna, nessun dato fisiologico dedotto. I piani sono generali e prudenti:
 * progressione graduale, giorni liberi e settimane di scarico. Non sono prescrizioni mediche.
 */
import { pickExercises } from './exercises.ts';
import type { Intensity, PlanGoal, PlanWizardInput, Segment, SessionInput, SessionKind } from './types.ts';

/**
 * Punti di estensione previsti:
 *  - rafforzamento muscolare: `includeStrength` + `pickExercises` (exercises.ts) producono sessioni 'strength';
 *  - flessibilità e mobilità: `includeMobility` aggiunge brevi sessioni 'mobility' facoltative.
 * Per aggiungere altri moduli (yoga, core, pliometria) basta emettere altre `SessionInput` in `generatePlan`.
 */
export const PLAN_DISCLAIMER =
  'Programma generale e prudente, non una prescrizione medica. Ascolta il tuo corpo: riduci o interrompi la sessione se senti dolore, capogiri o malessere, e se hai dubbi di salute parlane con il tuo medico prima di iniziare.';

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};

/** Tabella run/walk per principianti: (minuti di corsa, minuti di camminata, ripetizioni) per settimana. */
const RUN_WALK: Array<[number, number, number]> = [
  [1, 2, 8], [2, 2, 6], [3, 2, 5], [4, 2, 4], [5, 2, 4], [6, 2, 3], [8, 2, 3], [10, 2, 2], [15, 2, 2], [20, 1, 1], [25, 0, 1], [30, 0, 1],
];

const isDeload = (week: number) => week > 1 && week % 4 === 0;

function runWalk(week: number, maxMin: number, warm: number, cool: number): { segments: Segment[]; total: number; title: string } {
  const [run, walk, reps0] = RUN_WALK[Math.min(week - 1, RUN_WALK.length - 1)];
  let reps = reps0;
  // Rispetta la durata massima scelta dall'utente.
  while (reps > 1 && warm + cool + reps * (run + walk) > maxMin) reps--;
  const segs: Segment[] = [{ kind: 'warmup', label: 'Camminata di riscaldamento', durationSec: warm * 60, reps: 1 }];
  if (walk === 0) segs.push({ kind: 'run', label: 'Corsa continua a ritmo facile', durationSec: run * 60, reps });
  else {
    segs.push({ kind: 'run', label: 'Corsa leggera', durationSec: run * 60, reps });
    segs.push({ kind: 'walk', label: 'Camminata di recupero', durationSec: walk * 60, reps });
  }
  segs.push({ kind: 'cooldown', label: 'Camminata di defaticamento', durationSec: cool * 60, reps: 1 });
  return { segments: segs, total: warm + cool + reps * (run + walk), title: `${run} min corsa / ${walk} min camminata × ${reps}` };
}

const blank = (date: string, kind: SessionKind, title: string, over: Partial<SessionInput>): SessionInput => ({
  date,
  time: null,
  kind,
  title,
  description: '',
  durationMin: 30,
  distanceKm: null,
  intensity: 'low',
  paceSecPerKm: null,
  warmupMin: 5,
  cooldownMin: 5,
  segments: [],
  exercises: [],
  notes: '',
  ...over,
});

const TALK = 'Ritmo a cui riesci a parlare a frasi complete.';
const TIPS = [
  'Spalle rilassate e sguardo avanti.',
  'Passi brevi e frequenti: meglio leggeri che lunghi.',
  'Respira con calma, a ritmo con i passi.',
  'Bevi con regolarità nelle ore prima e dopo.',
  'Se senti dolore (non fatica), fermati e cammina.',
  'Scegli un percorso che ti piace: la costanza viene dal divertimento.',
];
const tip = (w: number, i = 0) => TIPS[(w + i) % TIPS.length];

export function generatePlan(input: PlanWizardInput): { sessions: SessionInput[]; warnings: string[] } {
  const warnings: string[] = [];
  const race = input.goal === 'race_5k' || input.goal === 'race_10k' || input.goal === 'half_marathon';
  // Obiettivi di gara e "stare in forma" riusano le strutture esistenti con varianti e riduzione finale.
  const effGoal: PlanGoal = input.goal === 'race_5k' || input.goal === 'race_10k' ? 'pace' : input.goal === 'half_marathon' ? 'distance' : input.goal === 'general_fitness' ? 'endurance' : input.goal;
  input = { ...input, goal: effGoal };
  const days = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const maxMin = Math.min(180, Math.max(20, input.maxMinutes));
  const level = input.level;
  const strengthWanted = input.includeStrength || input.goal === 'strength_support';
  const maxSessions = level === 'beginner' ? 4 : level === 'intermediate' ? 5 : 6;
  const n = Math.min(days.length, maxSessions);
  if (days.length > maxSessions) warnings.push(`Per lasciare spazio al recupero il piano usa al massimo ${maxSessions} sessioni a settimana.`);
  if (!days.length) return { sessions: [], warnings: ['Scegli almeno un giorno disponibile.'] };

  const strengthCount = strengthWanted && n >= 2 ? (input.goal === 'strength_support' && n >= 4 ? 2 : 1) : 0;
  const runCount = Math.max(1, n - strengthCount);
  // Distribuisce le sessioni sui giorni scelti, lasciando liberi i giorni in più.
  const chosen = pickSpread(days, n);
  const longDay = chosen[chosen.length - 1]; // il giorno più avanti nella settimana ospita la sessione più lunga
  const sessions: SessionInput[] = [];

  for (let w = 1; w <= input.weeks; w++) {
    const weekStart = addDays(input.startDate, (w - 1) * 7);
    const taper = race && w === input.weeks && input.weeks >= 4; // ultima settimana prima della gara: volume ridotto
    const deload = isDeload(w) || taper;
    const factor = taper ? 0.7 : deload ? 0.8 : 1 + 0.07 * (w - 1 - Math.floor((w - 1) / 4));
    const strengthDays = chosen.filter((d) => d !== longDay && d !== chosen[chosen.indexOf(longDay) - 1]).slice(0, strengthCount);
    const strengthSet = new Set(strengthDays.length === strengthCount ? strengthDays : chosen.filter((d) => d !== longDay).slice(0, strengthCount));
    let runIndex = 0;

    for (const d of chosen) {
      const date = addDays(weekStart, d - 1);
      if (strengthSet.has(d)) {
        const dur = Math.min(maxMin, level === 'beginner' ? 30 : 45);
        sessions.push(
          blank(date, 'strength', 'Forza di supporto alla corsa', {
            description: 'Gambe, glutei, core e schiena per sostenere la corsa. Scegli carichi che ti permettano di mantenere una buona tecnica, con 2–3 ripetizioni di margine.',
            durationMin: dur,
            intensity: 'moderate',
            warmupMin: 5,
            cooldownMin: 5,
            exercises: pickExercises(input.equipment, level, level === 'beginner' ? 4 : 6, w),
            notes: deload ? 'Settimana di scarico: riduci carico o serie.' : '',
          }),
        );
        continue;
      }
      const isLong = d === longDay && runCount >= 2;
      runIndex++;
      const made = runSession(input.goal, level, w, date, maxMin, factor, deload, isLong, runIndex, runCount);
      if (taper) for (const m of made) m.notes = (m.notes ? m.notes + ' ' : '') + 'Settimana di rifinitura: arriva alla gara fresco.';
      sessions.push(...made);
      // Mobilità facoltativa dopo le uscite più impegnative (modulo flessibilità).
      if (input.includeMobility && (isLong || made.some((m) => m.intensity === 'high'))) {
        sessions.push(blank(date, 'mobility', 'Mobilità e allungamento', { description: 'Dieci minuti di mobilità per anche, caviglie e schiena dopo la corsa. Facoltativa.', durationMin: 10, intensity: 'low', warmupMin: 0, cooldownMin: 0 }));
      }
    }
    // Un giorno libero in più → mobilità facoltativa per i principianti.
    const spare = days.filter((d) => !chosen.includes(d));
    if (spare.length && level === 'beginner') {
      const d = spare[0];
      sessions.push(blank(addDays(weekStart, d - 1), 'mobility', 'Mobilità e stretching', { description: 'Esercizi leggeri di mobilità. Facoltativo: salta pure se sei stanco.', durationMin: 15, intensity: 'low', warmupMin: 0, cooldownMin: 0 }));
    }
  }
  return { sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)), warnings };
}

function pickSpread(days: number[], n: number): number[] {
  if (n >= days.length) return days;
  // Sceglie giorni ben distanziati, privilegiando l'ultimo giorno disponibile.
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(days[Math.round((i * (days.length - 1)) / Math.max(1, n - 1))]);
  return [...new Set(out)];
}

function runSession(goal: PlanGoal, level: PlanWizardInput['level'], w: number, date: string, maxMin: number, factor: number, deload: boolean, isLong: boolean, idx: number, runCount: number): SessionInput[] {
  const note = deload ? 'Settimana di scarico: volume ridotto per recuperare.' : '';
  if (goal === 'start_running' || (level === 'beginner' && w <= 12 && goal !== 'pace' && goal !== 'distance')) {
    const rw = runWalk(deload ? Math.max(1, w - 1) : w, maxMin, 5, 5);
    return [blank(date, 'run_walk', rw.title, { description: `Alterna corsa leggera e camminata. ${TALK} Se serve, allunga la camminata.`, durationMin: rw.total, segments: rw.segments, warmupMin: 5, cooldownMin: 5, intensity: 'low', notes: note })];
  }
  const base = level === 'beginner' ? 25 : level === 'intermediate' ? 35 : 45;
  const baseKm = level === 'beginner' ? 3 : level === 'intermediate' ? 6 : 10;
  const dur = (m: number) => Math.min(maxMin, Math.round((m * factor) / 5) * 5);

  if (isLong) {
    const longDur = Math.min(maxMin, Math.round((base * 1.6 * factor) / 5) * 5);
    const km = goal === 'distance' ? Math.round(baseKm * (1 + 0.1 * (w - 1 - Math.floor((w - 1) / 4))) * (deload ? 0.8 : 1) * 10) / 10 : null;
    return [blank(date, 'run_long', goal === 'distance' && km ? `Lungo da ${km} km` : 'Corsa lunga facile', { description: `Corsa più lunga della settimana a ritmo facile. ${TALK}`, durationMin: Math.max(20, longDur), distanceKm: km, intensity: 'low', notes: note })];
  }
  if (goal === 'pace' && idx === 2 && level !== 'beginner') {
    const reps = Math.min(8, 4 + Math.floor(w / 2));
    const work = level === 'advanced' ? 3 : 2;
    const segs: Segment[] = [
      { kind: 'warmup', label: 'Riscaldamento facile', durationSec: 600, reps: 1 },
      { kind: 'work', label: 'Ripetuta a ritmo sostenuto ma controllato', durationSec: work * 60, reps: deload ? Math.max(3, reps - 2) : reps },
      { kind: 'recovery', label: 'Recupero in corsa lenta o camminata', durationSec: 120, reps: deload ? Math.max(3, reps - 2) : reps },
      { kind: 'cooldown', label: 'Defaticamento', durationSec: 600, reps: 1 },
    ];
    const total = 20 + (deload ? Math.max(3, reps - 2) : reps) * (work + 2);
    return [blank(date, 'run_intervals', `Ripetute ${deload ? Math.max(3, reps - 2) : reps} × ${work} min`, { description: 'Ripetute a sforzo impegnativo ma sostenibile (circa 7–8 su 10). Recupera davvero tra una e l\'altra.', durationMin: Math.min(maxMin, total), segments: segs, intensity: 'high', warmupMin: 10, cooldownMin: 10, notes: note })];
  }
  if (goal === 'pace' && idx === 3) {
    return [blank(date, 'run_progressive', 'Progressivo', { description: 'Parti facile e accelera gradualmente nell\'ultimo terzo, senza arrivare al massimo.', durationMin: dur(base), intensity: 'moderate', notes: note })];
  }
  if (goal === 'endurance' && idx === 2) {
    return [blank(date, 'aerobic', 'Resistenza aerobica moderata', { description: `Sforzo costante e moderato (circa 5–6 su 10). Può essere corsa, camminata veloce o altra attività aerobica.`, durationMin: dur(base + 5), intensity: 'moderate', notes: note })];
  }
  const variant = pickVariant(goal, level, w, idx, deload);
  if (variant === 'strides') {
    const segs: Segment[] = [
      { kind: 'warmup', label: 'Corsa facile', durationSec: Math.max(15, dur(base) - 8) * 60, reps: 1 },
      { kind: 'work', label: 'Allungo di 20 secondi, sciolto', durationSec: 20, reps: 6 },
      { kind: 'recovery', label: 'Cammina o trotterella 40 secondi', durationSec: 40, reps: 6 },
    ];
    return [blank(date, 'run_easy', 'Corsa facile con allunghi', { description: `Corsa facile (${TALK}) e, alla fine, 6 allunghi brevi e rilassati: non scatti, solo falcata più sciolta. ${tip(w, idx)}`, durationMin: dur(base), segments: segs, intensity: 'low', notes: note })];
  }
  if (variant === 'fartlek') {
    const reps = deload ? 4 : Math.min(8, 5 + Math.floor(w / 3));
    const segs: Segment[] = [
      { kind: 'warmup', label: 'Riscaldamento facile', durationSec: 600, reps: 1 },
      { kind: 'work', label: "Un minuto un po' più veloce (sforzo 6–7/10)", durationSec: 60, reps },
      { kind: 'recovery', label: 'Due minuti facili', durationSec: 120, reps },
      { kind: 'cooldown', label: 'Defaticamento facile', durationSec: 420, reps: 1 },
    ];
    return [blank(date, 'run_intervals', `Fartlek ${reps} × 1 min`, { description: `Gioco di ritmi: alterna un minuto più vivace a due minuti facili. Non serve cronometrare il passo: vai a sensazione. ${tip(w, idx)}`, durationMin: Math.min(maxMin, 17 + reps * 3), segments: segs, intensity: 'moderate', warmupMin: 10, cooldownMin: 7, notes: note })];
  }
  if (variant === 'hills') {
    const reps = deload ? 4 : Math.min(8, 4 + Math.floor(w / 3));
    const segs: Segment[] = [
      { kind: 'warmup', label: 'Riscaldamento facile', durationSec: 600, reps: 1 },
      { kind: 'work', label: 'Salita di 45 secondi, sforzo deciso ma controllato', durationSec: 45, reps },
      { kind: 'recovery', label: 'Scendi camminando o in corsa lenta', durationSec: 90, reps },
      { kind: 'cooldown', label: 'Defaticamento facile', durationSec: 420, reps: 1 },
    ];
    return [blank(date, 'run_intervals', `Salite ${reps} × 45 s`, { description: `Ripetute in salita dolce: rinforzano gambe e falcata. Se non hai salite, usa un ponte o un sovrappasso, oppure fai fartlek. ${tip(w, idx)}`, durationMin: Math.min(maxMin, 17 + reps * 3), segments: segs, intensity: 'moderate', warmupMin: 10, cooldownMin: 7, notes: note })];
  }
  if (variant === 'tempo') {
    const mid = deload ? 10 : Math.min(30, 10 + 2 * Math.floor(w / 2));
    const segs: Segment[] = [
      { kind: 'warmup', label: 'Riscaldamento facile', durationSec: 600, reps: 1 },
      { kind: 'work', label: 'Ritmo costante e comodamente duro (6–7/10)', durationSec: mid * 60, reps: 1 },
      { kind: 'cooldown', label: 'Defaticamento facile', durationSec: 600, reps: 1 },
    ];
    return [blank(date, 'run_continuous', `Ritmo costante ${mid} min`, { description: `Un blocco continuo a ritmo sostenuto ma sostenibile: riesci a dire poche parole alla volta. ${tip(w, idx)}`, durationMin: Math.min(maxMin, 20 + mid), segments: segs, intensity: 'moderate', warmupMin: 10, cooldownMin: 10, notes: note })];
  }
  if (variant === 'progressive') {
    return [blank(date, 'run_progressive', 'Progressivo', { description: `Tre parti uguali: facile, un po' più svelto, deciso ma controllato. ${tip(w, idx)}`, durationMin: dur(base), intensity: 'moderate', notes: note })];
  }
  if (variant === 'recovery') {
    return [blank(date, 'recovery_active', 'Recupero attivo', { description: 'Trotto molto lento o camminata veloce per sciogliere le gambe. Deve essere piacevole: sforzo 2–3 su 10.', durationMin: Math.min(maxMin, Math.max(20, Math.round((base * 0.7) / 5) * 5)), intensity: 'low', warmupMin: 0, cooldownMin: 0, notes: note })];
  }
  const kind: SessionKind = idx % 2 === 0 && runCount > 2 ? 'run_continuous' : 'run_easy';
  return [blank(date, kind, kind === 'run_easy' ? 'Corsa facile' : 'Corsa continua', { description: (kind === 'run_easy' ? `Ritmo facile e rilassato. ${TALK}` : 'Corsa continua a ritmo comodo ma costante.') + ' ' + tip(w, idx), durationMin: dur(base), intensity: (kind === 'run_easy' ? 'low' : 'moderate') as Intensity, notes: note })];
}

type Variant = 'easy' | 'strides' | 'fartlek' | 'hills' | 'tempo' | 'progressive' | 'recovery';

/** Ruota le sessioni di qualità per avere varietà, senza accumulare intensità: negli scarichi niente qualità. */
function pickVariant(goal: PlanGoal, level: PlanWizardInput['level'], w: number, idx: number, deload: boolean): Variant {
  if (level === 'beginner' && goal !== 'pace') return idx % 2 === 0 ? 'strides' : 'easy';
  if (deload) return idx % 2 === 0 ? 'recovery' : 'easy';
  const pool: Variant[] = goal === 'distance' ? ['easy', 'progressive', 'strides', 'easy', 'tempo'] : goal === 'pace' ? ['tempo', 'hills', 'fartlek', 'strides'] : ['fartlek', 'easy', 'hills', 'strides', 'progressive', 'tempo'];
  const v = pool[(w + idx) % pool.length];
  return level === 'beginner' && (v === 'tempo' || v === 'hills') ? 'fartlek' : v;
}
