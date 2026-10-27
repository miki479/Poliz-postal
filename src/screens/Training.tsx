import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Flag, Info, Pause, Play, Plus, Sparkles, Square, Trash2, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EQUIPMENT_LABEL, isRunKind, KIND_LABEL, kindGroup } from '../../shared/exercises.ts';
import { PLAN_DISCLAIMER } from '../../shared/planGenerator.ts';
import { deviceTimezone, formatPace, parsePace, utcToZoned } from '../../shared/time.ts';
import type { EquipmentId, Intensity, LoggedSet, PlanGoal, PlanLevel, PlanWizardInput, PlannedSession, Segment, SessionInput, SessionKind, WorkoutLogInput } from '../../shared/types.ts';
import type { StrengthPoint, WeekSummary } from '../../shared/training.ts';
import { validateSessionInput as vs } from '../../shared/training.ts';
import { BarChart } from '../components/BarChart.tsx';
import { ExerciseEditor, fmtDurSec, flattenSegments, GROUP_CLASS, KindBadge, SegmentEditor, SegmentList, STATUS_LABEL } from '../components/TrainingBits.tsx';
import { fmtKm } from '../format.ts';
import { errText, useSession } from '../session.tsx';
import { Button, ConfirmSheet, EmptyState, ErrorState, Field, ListSkeleton, Sheet, Switch, useAsync, useToast } from '../ui.tsx';

const DAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const todayKey = () => utcToZoned(new Date().toISOString(), deviceTimezone()).date;
const dayLabel = (day: string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00Z`));
const pending = (s: PlannedSession) => s.status === 'planned' || s.status === 'rescheduled';

export function SessionRow({ s }: { s: PlannedSession }) {
  const st = STATUS_LABEL[s.status];
  return (
    <Link to={`/piano/sessione/${s.id}`} className={`session ${s.status === 'completed' ? 'done' : ''}`} aria-label={`${s.title}, ${KIND_LABEL[s.kind]}, ${s.durationMin} minuti, ${st.label}`}>
      <KindBadge kind={s.kind} />
      <span className="grow" style={{ minWidth: 0 }}>
        <strong className="truncate" style={{ display: 'block' }}>{s.title}</strong>
        <span className="muted xs">{KIND_LABEL[s.kind]}{s.durationMin ? ` · ${s.durationMin} min` : ''}{s.distanceKm ? ` · ${fmtKm(s.distanceKm)}` : ''}{s.time ? ` · ${s.time}` : ''}</span>
      </span>
      <span className={`chip ${st.cls}`}>{st.label}</span>
    </Link>
  );
}

/* ====================== Piano settimanale ====================== */

export function Plan() {
  const { backend } = useSession();
  const tz = deviceTimezone();
  const today = todayKey();
  const [week, setWeek] = useState(mondayOf(today));
  const [day, setDay] = useState(today);
  const end = addDays(week, 6);
  const sessions = useAsync(() => backend.listSessions({ from: week, to: end }), [week]);
  const summary = useAsync(() => backend.weekSummary(week, tz), [week]);
  const upcoming = useAsync(() => backend.listSessions({ from: today, to: addDays(today, 30) }), []);
  const plans = useAsync(() => backend.listPlans(), []);
  const [delPlan, setDelPlan] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => { if (day < week || day > end) setDay(week); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => { const m = new Map<string, PlannedSession[]>(); for (const s of sessions.data ?? []) m.set(s.date, [...(m.get(s.date) ?? []), s]); return m; }, [sessions.data]);
  const next = (upcoming.data ?? []).find((s) => pending(s) && kindGroup(s.kind) !== 'recovery') ?? null;
  const sum: WeekSummary | null = summary.data;
  const pct = sum && sum.planned.minutes > 0 ? Math.min(100, Math.round((sum.completed.minutes / sum.planned.minutes) * 100)) : 0;

  return (
    <div className="page">
      <Link to="/profilo" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Profilo</Link>
      <header className="topbar"><h1 className="display h1">Allenamento</h1><Link to={`/piano/sessione/nuova?date=${day}`} className="btn btn-primary btn-sm"><Plus size={16} aria-hidden="true" /> Sessione</Link></header>

      {next ? (
        <section className="card hero" aria-label="Prossimo allenamento">
          <span className="chip accent" style={{ alignSelf: 'flex-start' }}>Prossimo allenamento</span>
          <div className="row"><KindBadge kind={next.kind} size={48} /><div className="grow"><strong style={{ fontSize: 'var(--fs-lg)' }}>{next.title}</strong><br /><span className="muted small first-up">{dayLabel(next.date)}{next.time ? ` · ${next.time}` : ''} · {next.durationMin} min</span></div></div>
          <Link to={`/piano/sessione/${next.id}?avvia=1`} className="btn btn-primary btn-block"><Play size={18} aria-hidden="true" /> Inizia allenamento</Link>
        </section>
      ) : !upcoming.loading && (
        <section className="card hero">
          <h2 className="section-title">Costruisci il tuo piano</h2>
          <p className="muted small">Rispondi a poche domande e ottieni un programma settimanale prudente e modificabile, oppure aggiungi le sessioni a mano. Nessuna AI, nessun costo.</p>
          <Link to="/piano/procedura" className="btn btn-primary btn-block"><Sparkles size={18} aria-hidden="true" /> Procedura guidata</Link>
        </section>
      )}

      <section className="stack-sm" aria-label="Settimana">
        <div className="row between">
          <button className="icon-btn" aria-label="Settimana precedente" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></button>
          <button className="pill" onClick={() => { setWeek(mondayOf(today)); setDay(today); }} aria-label="Vai a questa settimana">{week === mondayOf(today) ? 'Questa settimana' : `Dal ${week.split('-').reverse().slice(0, 2).join('/')}`}</button>
          <button className="icon-btn" aria-label="Settimana successiva" onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></button>
        </div>
        <div className="week-strip" role="group" aria-label="Giorni">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(week, i);
            const list = byDay.get(d) ?? [];
            return (
              <button key={d} className={`week-day ${d === today ? 'today' : ''}`} aria-pressed={d === day} onClick={() => setDay(d)} aria-label={`${dayLabel(d)}: ${list.length ? `${list.length} sessioni` : 'nessuna sessione'}`}>
                <span className="dn">{DAYS[i]}</span><span className="dd">{d.slice(8)}</span>
                <span className="dots" aria-hidden="true">{list.slice(0, 3).map((s) => <i key={s.id} className={`dot ${GROUP_CLASS[kindGroup(s.kind)]}`} style={{ opacity: s.status === 'completed' ? 1 : 0.55 }} />)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack" aria-labelledby="dayh">
        <h2 className="section-title first-up" id="dayh">{dayLabel(day)}</h2>
        {sessions.loading && !sessions.data ? <ListSkeleton rows={1} /> : sessions.error ? <ErrorState message={sessions.error.message} onRetry={sessions.reload} /> : (byDay.get(day) ?? []).length ? (byDay.get(day) ?? []).map((s) => <SessionRow key={s.id} s={s} />) : (
          <div className="empty" style={{ padding: 'var(--s-5)' }}><p className="muted small">Giorno libero: il riposo fa parte dell'allenamento.</p><Link to={`/piano/sessione/nuova?date=${day}`} className="btn btn-outline btn-sm">Aggiungi una sessione</Link></div>
        )}
      </section>

      <section className="card" aria-labelledby="sumh">
        <h2 className="section-title" id="sumh">Riepilogo della settimana</h2>
        {summary.loading && !sum ? <ListSkeleton rows={1} /> : sum && (
          <>
            {sum.planned.count === 0 && sum.completed.count === 0 ? <p className="muted small">Nessuna sessione pianificata o registrata in questa settimana.</p> : (
              <>
                <div className="row between small"><span>Minuti svolti / pianificati</span><span className="num" style={{ fontSize: '1.3rem' }}>{sum.completed.minutes} / {sum.planned.minutes}</span></div>
                <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avanzamento della settimana"><i style={{ width: `${pct}%` }} /></div>
                <div className="stats">
                  <div className="stat"><span className="v">{sum.planned.count}</span><span className="l">Pianificate</span></div>
                  <div className="stat"><span className="v">{sum.completed.count}</span><span className="l">Registrate</span></div>
                  <div className="stat"><span className="v">{sum.skipped}</span><span className="l">Saltate</span></div>
                </div>
              </>
            )}
            <p className="small muted">Carico percepito: {sum.perceivedLoad !== null ? <strong style={{ color: 'var(--text)' }}>{sum.perceivedLoad}</strong> : 'nessun dato'} <span className="xs">(minuti × fatica 1–10 che inserisci tu)</span></p>
            <div className="tags"><span className="chip">Programmate: {sum.sources.plannedSessions}</span><span className="chip">Registrate a mano: {sum.sources.manualLogs} ({fmtKm(sum.sources.manualKm)})</span><span className="chip">Importate: {sum.sources.importedActivities} ({fmtKm(sum.sources.importedKm)})</span></div>
          </>
        )}
      </section>

      <div className="row wrap">
        <Link to="/piano/progressi" className="btn btn-outline grow"><TrendingUp size={18} aria-hidden="true" /> Progressi</Link>
        <Link to="/piano/routine" className="btn btn-outline grow"><Dumbbell size={18} aria-hidden="true" /> Routine di forza</Link>
        <Link to="/piano/procedura" className="btn btn-outline grow"><Sparkles size={18} aria-hidden="true" /> Nuovo piano guidato</Link>
      </div>

      {plans.data && plans.data.length > 0 && (
        <section className="card" aria-labelledby="plh">
          <h2 className="section-title" id="plh">I tuoi piani</h2>
          {plans.data.map((p) => (
            <div key={p.id} className="row between">
              <span className="small"><strong>{p.name}</strong><br /><span className="muted xs">{p.weeks} settimane dal {p.startDate.split('-').reverse().join('/')}{p.archived ? ' · archiviato' : ''}</span></span>
              <button className="icon-btn" aria-label={`Elimina il piano ${p.name}`} onClick={() => setDelPlan(p.id)}><Trash2 size={18} /></button>
            </div>
          ))}
        </section>
      )}
      <p className="hint"><Info size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px' }} /> {PLAN_DISCLAIMER}</p>

      {delPlan && <ConfirmSheet title="Eliminare il piano?" danger confirmLabel="Elimina" onClose={() => setDelPlan(null)} onConfirm={async () => { try { const r = await backend.deletePlan(delPlan); toast('ok', `Piano eliminato (${r.removedSessions} sessioni non svolte rimosse). Le completate restano nello storico.`); setDelPlan(null); plans.reload(); sessions.reload(); summary.reload(); upcoming.reload(); } catch (e) { toast('err', errText(e)); } }}><p>Verranno rimosse le sessioni non ancora svolte. Quelle completate restano nel tuo storico.</p></ConfirmSheet>}
    </div>
  );
}

/* ====================== Form sessione ====================== */

const KIND_GROUPS: Array<[string, SessionKind[]]> = [
  ['Corsa', ['run_easy', 'run_continuous', 'run_intervals', 'run_progressive', 'run_long', 'run_free']],
  ['Corsa e camminata', ['run_walk']],
  ['Resistenza aerobica', ['aerobic']],
  ['Forza', ['strength']],
  ['Recupero', ['rest', 'recovery_active', 'mobility']],
];

export function SessionForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const existing = useAsync(() => (mode === 'edit' ? backend.getSession(id) : Promise.resolve(null)), [mode, id]);
  const routines = useAsync(() => backend.listRoutines(), []);
  const [f, setF] = useState<SessionInput | null>(mode === 'new' ? { date: params.get('date') ?? todayKey(), time: null, kind: 'run_easy', title: '', description: '', durationMin: 30, distanceKm: null, intensity: 'low', paceSecPerKm: null, warmupMin: 5, cooldownMin: 5, segments: [], exercises: [], notes: '' } : null);
  const [dist, setDist] = useState('');
  const [pace, setPace] = useState('');
  const [rw, setRw] = useState({ run: '1', walk: '2', reps: '8' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = existing.data;
    if (s && !f) { const { id: _i, userId: _u, status: _s, rescheduledFrom: _r, eventId: _e, logId: _l, createdAt: _c, updatedAt: _up, ...rest } = s; void [_i, _u, _s, _r, _e, _l, _c, _up]; setF(rest); setDist(s.distanceKm !== null ? String(s.distanceKm).replace('.', ',') : ''); setPace(s.paceSecPerKm !== null ? formatPace(s.paceSecPerKm).replace('/km', '') : ''); }
  }, [existing.data, f]);

  if (existing.error) return <div className="page no-nav"><ErrorState message={existing.error.message} onRetry={existing.reload} /></div>;
  if (!f) return <div className="page no-nav"><ListSkeleton rows={3} /></div>;
  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) => { setF((s) => (s ? { ...s, [k]: v } : s)); setErrors((e) => ({ ...e, [k]: '' })); };
  const g = kindGroup(f.kind);
  const showSegments = ['run_walk', 'run_intervals', 'run_progressive', 'aerobic', 'run_easy', 'run_continuous', 'run_long'].includes(f.kind);

  function build(): SessionInput {
    const d = dist.trim() ? Number(dist.replace(',', '.')) : null;
    const p = pace.trim() ? (parsePace(pace) ?? NaN) : null;
    return { ...f!, distanceKm: d !== null && Number.isNaN(d) ? (NaN as never) : d, paceSecPerKm: p as number | null };
  }

  async function save() {
    if (busy) return;
    const input = build();
    const v = vs(input);
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try {
      const s = mode === 'new' ? await backend.createSession(input) : await backend.updateSession(id, input);
      toast('ok', 'Sessione salvata.');
      nav(`/piano/sessione/${s.id}`, { replace: true });
    } catch (e) { const fl = (e as { fields?: Record<string, string> }).fields; if (fl) setErrors(fl); toast('err', errText(e)); } finally { setBusy(false); }
  }

  function fillRunWalk() {
    const r = Number(rw.run.replace(',', '.')), w = Number(rw.walk.replace(',', '.')), n = Number(rw.reps);
    if (!(r > 0) || !(w >= 0) || !Number.isInteger(n) || n < 1 || n > 50) return toast('err', 'Controlla minuti di corsa, camminata e ripetizioni.');
    const mk = (kind: Segment['kind'], label: string, durationSec: number, reps: number): Segment => ({ kind, label, durationSec, reps });
    const segs: Segment[] = [
      mk('warmup', 'Camminata di riscaldamento', f!.warmupMin * 60, 1),
      mk('run', 'Corsa leggera', Math.round(r * 60), n),
      ...(w > 0 ? [mk('walk', 'Camminata di recupero', Math.round(w * 60), n)] : []),
      mk('cooldown', 'Camminata di defaticamento', f!.cooldownMin * 60, 1),
    ].filter((x) => x.durationSec > 0);
    setF({ ...f!, segments: segs, durationMin: Math.round(f!.warmupMin + f!.cooldownMin + n * (r + w)), title: f!.title || `${r} min corsa / ${w} min camminata × ${n}` });
  }

  return (
    <div className="page no-nav has-action">
      <Link to={mode === 'edit' ? `/piano/sessione/${id}` : '/piano'} className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      <h1 className="display h1">{mode === 'new' ? 'Nuova sessione' : 'Modifica sessione'}</h1>
      <form className="stack" style={{ gap: 'var(--s-5)' }} noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Tipo di allenamento" htmlFor="sk" error={errors.kind}>
          <select id="sk" className="select" value={f.kind} onChange={(e) => { const k = e.target.value as SessionKind; setF((s) => (s ? { ...s, kind: k, title: s.title || KIND_LABEL[k], intensity: k === 'run_intervals' ? 'high' : kindGroup(k) === 'recovery' ? 'low' : (s.intensity ?? 'low'), durationMin: k === 'rest' ? 0 : s.durationMin || 30 } : s)); }}>
            {KIND_GROUPS.map(([l, ks]) => <optgroup key={l} label={l}>{ks.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Nome" htmlFor="st" error={errors.title}><input id="st" className="input" maxLength={80} value={f.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title} /></Field>
        <div className="form-grid">
          <Field label="Giorno" htmlFor="sd" error={errors.date}><input id="sd" type="date" className="input" value={f.date} onChange={(e) => set('date', e.target.value)} aria-invalid={!!errors.date} /></Field>
          <Field label="Ora" htmlFor="sh" optional error={errors.time}><input id="sh" type="time" className="input" value={f.time ?? ''} onChange={(e) => set('time', e.target.value || null)} /></Field>
        </div>
        {f.kind !== 'rest' && (
          <div className="form-grid">
            <Field label="Durata (min)" htmlFor="sm" error={errors.durationMin}><input id="sm" className="input" inputMode="numeric" value={String(f.durationMin)} onChange={(e) => set('durationMin', Number(e.target.value) || 0)} aria-invalid={!!errors.durationMin} /></Field>
            {(g === 'run' || g === 'walk' || g === 'aerobic') && <Field label="Distanza (km)" htmlFor="sdi" optional error={errors.distanceKm}><input id="sdi" className="input" inputMode="decimal" value={dist} onChange={(e) => { setDist(e.target.value); setErrors((x) => ({ ...x, distanceKm: '' })); }} aria-invalid={!!errors.distanceKm} /></Field>}
          </div>
        )}
        {(g === 'run' || g === 'walk' || g === 'aerobic') && f.kind !== 'rest' && (
          <div className="form-grid">
            <Field label="Intensità" htmlFor="si" optional><select id="si" className="select" value={f.intensity ?? ''} onChange={(e) => set('intensity', (e.target.value || null) as Intensity | null)}><option value="">—</option><option value="low">Bassa</option><option value="moderate">Moderata</option><option value="high">Elevata</option></select></Field>
            <Field label="Ritmo (min/km)" htmlFor="sp" optional error={errors.paceSecPerKm}><input id="sp" className="input" inputMode="numeric" placeholder="6:00" value={pace} onChange={(e) => setPace(e.target.value)} /></Field>
          </div>
        )}
        {f.kind !== 'rest' && <div className="form-grid"><Field label="Riscaldamento (min)" htmlFor="sw" error={errors.warmupMin}><input id="sw" className="input" inputMode="numeric" value={String(f.warmupMin)} onChange={(e) => set('warmupMin', Number(e.target.value) || 0)} /></Field><Field label="Defaticamento (min)" htmlFor="sc" error={errors.cooldownMin}><input id="sc" className="input" inputMode="numeric" value={String(f.cooldownMin)} onChange={(e) => set('cooldownMin', Number(e.target.value) || 0)} /></Field></div>}
        <Field label="Descrizione" htmlFor="sde" optional error={errors.description}><textarea id="sde" className="textarea" maxLength={500} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>

        {f.kind === 'run_walk' && (
          <section className="card" aria-label="Corsa e camminata alternate">
            <h2 className="section-title">Alternanza corsa / camminata</h2>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <label className="field"><span className="xs muted">Corsa (min)</span><input className="input" inputMode="decimal" value={rw.run} onChange={(e) => setRw({ ...rw, run: e.target.value })} /></label>
              <label className="field"><span className="xs muted">Camminata (min)</span><input className="input" inputMode="decimal" value={rw.walk} onChange={(e) => setRw({ ...rw, walk: e.target.value })} /></label>
              <label className="field"><span className="xs muted">Ripetizioni</span><input className="input" inputMode="numeric" value={rw.reps} onChange={(e) => setRw({ ...rw, reps: e.target.value })} /></label>
            </div>
            <Button variant="outline" onClick={fillRunWalk}>Genera i blocchi</Button>
            <p className="hint">È solo un esempio modificabile: scegli tu durate e ripetizioni, anche partendo da valori più prudenti.</p>
          </section>
        )}
        {showSegments && <section className="stack-sm" aria-label="Fasi"><h2 className="section-title">Fasi e recuperi</h2><SegmentEditor value={f.segments} onChange={(v) => set('segments', v)} />{errors.segments && <span className="error-text" role="alert">{errors.segments}</span>}</section>}
        {f.kind === 'strength' && <section className="stack-sm" aria-label="Esercizi"><h2 className="section-title">Esercizi</h2><ExerciseEditor value={f.exercises} onChange={(v) => set('exercises', v)} routines={routines.data ?? []} />{errors.exercises && <span className="error-text" role="alert">{errors.exercises}</span>}</section>}
        <Field label="Note personali" htmlFor="sn" optional error={errors.notes}><textarea id="sn" className="textarea" maxLength={500} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
      <div className="action-bar"><div><Button variant="primary" block loading={busy} onClick={save}>Salva la sessione</Button></div></div>
    </div>
  );
}

/* ====================== Dettaglio e registrazione ====================== */

type TimerState = { startedAt: number; pausedAt: number | null; pausedMs: number } | null;
const timerKey = (id: string) => `podismo-timer-${id}`;
const loadTimer = (id: string): TimerState => { try { const t = localStorage.getItem(timerKey(id)); return t ? (JSON.parse(t) as TimerState) : null; } catch { return null; } };
const saveTimer = (id: string, t: TimerState) => { try { if (t) localStorage.setItem(timerKey(id), JSON.stringify(t)); else localStorage.removeItem(timerKey(id)); } catch { /* ignora */ } };
const elapsedSec = (t: NonNullable<TimerState>, now: number) => Math.max(0, Math.floor(((t.pausedAt ?? now) - t.startedAt - t.pausedMs) / 1000));
const clock = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0') === '00' ? '' : `${Math.floor(s / 3600)}:`}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function SessionDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data: s, error, loading, reload } = useAsync(() => backend.getSession(id), [id]);
  const log = useAsync(() => (s?.logId ? backend.listWorkoutLogs({}).then((l) => l.find((x) => x.id === s.logId) ?? null) : Promise.resolve(null)), [s?.logId]);
  const [timer, setTimer] = useState<TimerState>(() => loadTimer(id));
  const [, tick] = useState(0);
  const [complete, setComplete] = useState<null | { durationSec: number; mode: 'manual' | 'timer'; startedAt: string }>(null);
  const [sheet, setSheet] = useState<null | 'move' | 'delete' | 'skip'>(null);
  const [moveDate, setMoveDate] = useState('');
  const auto = useRef(false);

  useEffect(() => { if (!timer || timer.pausedAt) return; const i = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(i); }, [timer]);
  useEffect(() => { if (s && params.get('avvia') === '1' && !auto.current && pending(s) && !timer) { auto.current = true; start(); } }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !s) return <div className="page"><ListSkeleton rows={3} /></div>;
  if (error || !s) return <div className="page"><Link to="/piano" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Piano</Link><ErrorState message={error?.message ?? 'Sessione non trovata'} onRetry={reload} /></div>;

  const group = kindGroup(s.kind);
  const start = () => { const t = { startedAt: Date.now(), pausedAt: null, pausedMs: 0 }; setTimer(t); saveTimer(id, t); };
  const pause = () => { if (!timer || timer.pausedAt) return; const t = { ...timer, pausedAt: Date.now() }; setTimer(t); saveTimer(id, t); };
  const resume = () => { if (!timer?.pausedAt) return; const t = { ...timer, pausedMs: timer.pausedMs + (Date.now() - timer.pausedAt), pausedAt: null }; setTimer(t); saveTimer(id, t); };
  const stop = () => { if (!timer) return; const sec = elapsedSec(timer, Date.now()); setComplete({ durationSec: Math.max(60, sec), mode: 'timer', startedAt: new Date(timer.startedAt).toISOString() }); };
  const el = timer ? elapsedSec(timer, Date.now()) : 0;
  const flat = flattenSegments(s.segments);
  let cur: { seg: Segment; left: number; next: Segment | null } | null = null;
  if (timer && flat.length) { let acc = 0; for (let i = 0; i < flat.length; i++) { if (el < acc + flat[i].durationSec) { cur = { seg: flat[i], left: acc + flat[i].durationSec - el, next: flat[i + 1] ?? null }; break; } acc += flat[i].durationSec; } }

  async function run<T>(fn: () => Promise<T>, ok: string) { try { await fn(); toast('ok', ok); reload(); } catch (e) { toast('err', errText(e)); } }

  return (
    <div className="page has-action">
      <div className="topbar">
        <Link to="/piano" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Piano</Link>
        {pending(s) && <Link to={`/piano/sessione/${s.id}/modifica`} className="btn btn-outline btn-sm">Modifica</Link>}
      </div>
      <header className="row" style={{ alignItems: 'flex-start' }}>
        <KindBadge kind={s.kind} size={52} />
        <div className="grow"><div className="tags"><span className={`chip ${STATUS_LABEL[s.status].cls}`}>{STATUS_LABEL[s.status].label}</span><span className="chip">{KIND_LABEL[s.kind]}</span></div>
          <h1 className="display h1" style={{ marginTop: 6 }}>{s.title}</h1>
          <p className="muted small first-up">{dayLabel(s.date)}{s.time ? ` · ${s.time}` : ''}{s.rescheduledFrom ? ` (spostata dal ${s.rescheduledFrom.split('-').reverse().slice(0, 2).join('/')})` : ''}</p></div>
      </header>

      {timer && pending(s) && (
        <section className="card hero" aria-label="Cronometro">
          <div className="timer" role="timer" aria-live="off" aria-label={`Tempo trascorso ${clock(el)}`}>{clock(el)}</div>
          {cur ? <p style={{ textAlign: 'center' }}><strong>Ora: {cur.seg.label}</strong> <span className="muted">({fmtDurSec(cur.left)} rimasti)</span>{cur.next && <><br /><span className="muted small">Poi: {cur.next.label}</span></>}</p> : flat.length > 0 && <p className="muted small" style={{ textAlign: 'center' }}>Fasi previste completate: termina quando vuoi.</p>}
          <div className="row" style={{ justifyContent: 'center' }}>
            {timer.pausedAt ? <Button variant="primary" onClick={resume}><Play size={18} aria-hidden="true" /> Riprendi</Button> : <Button variant="outline" onClick={pause}><Pause size={18} aria-hidden="true" /> Pausa</Button>}
            <Button variant="danger" onClick={stop}><Square size={18} aria-hidden="true" /> Termina</Button>
          </div>
          <p className="hint" style={{ textAlign: 'center' }}>Il cronometro conta il tempo solo con l'app aperta e non registra il percorso: alla fine inserirai tu distanza e dettagli.</p>
        </section>
      )}

      <section className="card" aria-label="Dettagli">
        <div className="stats" style={{ gridTemplateColumns: `repeat(${1 + Number(s.distanceKm !== null) + Number(s.intensity !== null || s.paceSecPerKm !== null)}, 1fr)` }}>
          <div className="stat"><span className="v">{s.durationMin}′</span><span className="l">Durata prevista</span></div>
          {s.distanceKm !== null && <div className="stat"><span className="v">{fmtKm(s.distanceKm)}</span><span className="l">Distanza obiettivo</span></div>}
          {(s.intensity !== null || s.paceSecPerKm !== null) && <div className="stat"><span className="v" style={{ fontSize: '1.4rem' }}>{s.paceSecPerKm ? formatPace(s.paceSecPerKm) : { low: 'Bassa', moderate: 'Moderata', high: 'Elevata' }[s.intensity!]}</span><span className="l">{s.paceSecPerKm ? 'Ritmo indicativo' : 'Intensità'}</span></div>}
        </div>
        {s.description && <p className="muted">{s.description}</p>}
        {s.warmupMin > 0 && s.kind !== 'run_walk' && <div className="small"><strong>Riscaldamento:</strong> {s.warmupMin} min, ritmo molto facile.</div>}
        {s.segments.length > 0 && <div><div className="label">Fasi</div><SegmentList segments={s.segments} /></div>}
        {group === 'strength' && s.exercises.length > 0 && (
          <div><div className="label">Esercizi</div>
            <ul className="seg-list">{s.exercises.map((e, i) => <li key={i}><span className="grow small"><strong>{e.name}</strong><br /><span className="muted xs">{EQUIPMENT_LABEL[e.equipment]}</span></span><span className="num">{e.sets}×{e.reps}{e.loadKg ? ` · ${e.loadKg} kg` : ''}</span></li>)}</ul>
            <p className="hint">Recuperi previsti: {[...new Set(s.exercises.map((e) => e.restSec))].join(' / ')} secondi tra le serie.</p></div>
        )}
        {s.cooldownMin > 0 && s.kind !== 'run_walk' && <div className="small"><strong>Defaticamento:</strong> {s.cooldownMin} min, ritmo molto facile e un po' di stretching.</div>}
        {s.notes && <div><div className="label">Note personali</div><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p></div>}
        <p className="hint">Se senti dolore, capogiri o malessere, riduci o interrompi la sessione.</p>
      </section>

      {s.status === 'completed' && log.data && (
        <section className="card" aria-labelledby="cmp">
          <h2 className="section-title" id="cmp">Confronto con il programma</h2>
          <table className="data-table"><thead><tr><th scope="col"></th><th scope="col">Previsto</th><th scope="col">Svolto</th></tr></thead><tbody>
            <tr><th scope="row">Durata</th><td>{s.durationMin} min</td><td>{Math.round(log.data.durationSec / 60)} min</td></tr>
            {(s.distanceKm !== null || log.data.distanceKm !== null) && <tr><th scope="row">Distanza</th><td>{s.distanceKm !== null ? fmtKm(s.distanceKm) : '—'}</td><td>{log.data.distanceKm !== null ? fmtKm(log.data.distanceKm) : '—'}</td></tr>}
            {log.data.paceSecPerKm && <tr><th scope="row">Ritmo</th><td>{s.paceSecPerKm ? formatPace(s.paceSecPerKm) : '—'}</td><td>{formatPace(log.data.paceSecPerKm)}</td></tr>}
            {log.data.rpe && <tr><th scope="row">Fatica percepita</th><td>—</td><td>{log.data.rpe}/10</td></tr>}
          </tbody></table>
          {log.data.difficulties && <p className="small muted">Difficoltà: {log.data.difficulties}</p>}
          {log.data.sets.length > 0 && <p className="small muted">{log.data.sets.filter((x) => x.done).length} serie registrate.</p>}
          <p className="hint">Valori inseriti da te. {log.data.activityId ? 'Compare anche nello storico attività.' : ''}</p>
          <Button variant="ghost" onClick={async () => { try { await backend.deleteWorkoutLog(log.data!.id); toast('ok', 'Registrazione eliminata: la sessione torna da fare.'); reload(); } catch (e) { toast('err', errText(e)); } }}>Elimina la registrazione</Button>
        </section>
      )}

      {pending(s) && isRunKind(s.kind) || s.kind === 'run_walk' ? (
        <section className="card" aria-labelledby="soc">
          <h2 className="section-title" id="soc"><Users size={18} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Insieme agli altri</h2>
          {s.eventId ? <Link to={`/uscita/${s.eventId}`} className="btn btn-outline">Vedi l'uscita di gruppo collegata</Link> : pending(s) ? <><p className="muted small">Trasforma questa sessione in un'uscita: scegli tu chi può vederla e invita gli amici con un link. Il tuo piano resta privato.</p><Link to={`/uscita/nuova?from=${s.id}`} className="btn btn-outline"><Flag size={18} aria-hidden="true" /> Organizza una corsa di gruppo</Link></> : null}
        </section>
      ) : null}

      {pending(s) && (
        <div className="row wrap">
          <Button variant="outline" onClick={() => { setMoveDate(s.date); setSheet('move'); }}><CalendarDays size={18} aria-hidden="true" /> Sposta</Button>
          <Button variant="outline" onClick={() => setSheet('skip')}>Salta</Button>
          <Button variant="outline" onClick={() => setComplete({ durationSec: s.durationMin * 60, mode: 'manual', startedAt: new Date(`${s.date}T${s.time ?? '12:00'}:00`).toISOString() })}>Registra a mano</Button>
        </div>
      )}
      {s.status === 'skipped' && <Button variant="outline" onClick={() => run(() => backend.skipSession(s.id, false), 'Sessione ripristinata.')}>Ripristina la sessione</Button>}
      <Button variant="danger" onClick={() => setSheet('delete')}><Trash2 size={18} aria-hidden="true" /> Elimina la sessione</Button>

      {pending(s) && !timer && <div className="action-bar"><div><Button variant="primary" block onClick={start}><Play size={18} aria-hidden="true" /> Inizia allenamento</Button></div></div>}

      {complete && <CompleteSheet s={s} init={complete} onClose={() => setComplete(null)} onDone={(linked) => { setComplete(null); saveTimer(id, null); setTimer(null); toast('ok', linked ? 'Registrato. Era già nello storico (importata): l\'ho collegata senza duplicarla.' : 'Allenamento registrato nello storico.'); reload(); }} />}
      {sheet === 'move' && <Sheet title="Sposta la sessione" onClose={() => setSheet(null)}><Field label="Nuovo giorno" htmlFor="mv"><input id="mv" type="date" className="input" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} data-autofocus /></Field><Button variant="primary" block onClick={async () => { await run(() => backend.moveSession(s.id, moveDate), 'Sessione spostata.'); setSheet(null); }}>Sposta</Button></Sheet>}
      {sheet === 'skip' && <ConfirmSheet title="Saltare la sessione?" confirmLabel="Salta" onClose={() => setSheet(null)} onConfirm={async () => { await run(() => backend.skipSession(s.id), 'Sessione saltata.'); setSheet(null); }}><p>Nessun problema: puoi sempre ripristinarla. Saltare ogni tanto fa parte di un piano sano.</p></ConfirmSheet>}
      {sheet === 'delete' && <ConfirmSheet title="Eliminare la sessione?" danger confirmLabel="Elimina" onClose={() => setSheet(null)} onConfirm={async () => { try { await backend.deleteSession(s.id); saveTimer(id, null); toast('ok', 'Sessione eliminata.'); nav('/piano', { replace: true }); } catch (e) { toast('err', errText(e)); } }}><p>{s.status === 'completed' ? 'La registrazione dell\'allenamento resta nello storico.' : 'L\'operazione non si può annullare.'}</p></ConfirmSheet>}
    </div>
  );
}

function CompleteSheet({ s, init, onClose, onDone }: { s: PlannedSession; init: { durationSec: number; mode: 'manual' | 'timer'; startedAt: string }; onClose: () => void; onDone: (linked: boolean) => void }) {
  const { backend } = useSession();
  const toast = useToast();
  const group = kindGroup(s.kind);
  const [min, setMin] = useState(String(Math.max(1, Math.round(init.durationSec / 60))));
  const [km, setKm] = useState(s.distanceKm !== null && init.mode === 'manual' ? String(s.distanceKm).replace('.', ',') : '');
  const [rpe, setRpe] = useState('');
  const [diff, setDiff] = useState('');
  const [notes, setNotes] = useState('');
  const [shared, setShared] = useState(false);
  const [sets, setSets] = useState<LoggedSet[]>(() => s.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, i) => ({ exercise: e.name, set: i + 1, reps: e.reps, loadKg: e.loadKg, done: true }))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const d = Number(min.replace(',', '.'));
    const input: WorkoutLogInput = { plannedSessionId: s.id, kind: s.kind, title: s.title, startedAt: init.startedAt, durationSec: Math.round(d * 60), distanceKm: km.trim() ? Number(km.replace(',', '.')) : null, rpe: rpe ? Number(rpe) : null, difficulties: diff, notes, sets: group === 'strength' ? sets : [], mode: init.mode, shared, timezone: deviceTimezone() };
    setBusy(true);
    setErrors({});
    try { const r = await backend.completeSession(s.id, input); onDone(r.linkedExisting); } catch (e) { const f = (e as { fields?: Record<string, string> }).fields; if (f) setErrors(f); else toast('err', errText(e)); } finally { setBusy(false); }
  }
  const updSet = (i: number, p: Partial<LoggedSet>) => setSets(sets.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <Sheet title="Registra l'allenamento" onClose={onClose}>
      <p className="muted small">Inserisci quello che hai fatto davvero. {init.mode === 'timer' ? 'La durata arriva dal cronometro, puoi correggerla.' : 'Valori dichiarati da te.'}</p>
      <div className="form-grid">
        <Field label="Durata effettiva (min)" htmlFor="cm" error={errors.durationSec}><input id="cm" className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} aria-invalid={!!errors.durationSec} /></Field>
        {isRunKind(s.kind) || group === 'aerobic' ? <Field label="Distanza (km)" htmlFor="ck" optional error={errors.distanceKm}><input id="ck" className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} aria-invalid={!!errors.distanceKm} /></Field> : <span />}
      </div>
      {group === 'strength' && (
        <div className="stack-sm"><div className="label">Serie eseguite</div>
          {sets.map((x, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={x.done} onChange={(e) => updSet(i, { done: e.target.checked })} aria-label={`Serie ${x.set} ${x.exercise} completata`} style={{ width: 22, height: 22, flex: 'none' }} />
              <span className="grow xs"><strong>{x.exercise}</strong> · serie {x.set}</span>
              <input className="input" style={{ width: 58, padding: '0 6px', textAlign: 'center' }} inputMode="numeric" aria-label={`Ripetizioni ${x.exercise} serie ${x.set}`} value={String(x.reps)} onChange={(e) => updSet(i, { reps: Number(e.target.value) || 0 })} />
              <input className="input" style={{ width: 66, padding: '0 6px', textAlign: 'center' }} inputMode="decimal" placeholder="kg" aria-label={`Carico ${x.exercise} serie ${x.set}`} value={x.loadKg === null ? '' : String(x.loadKg)} onChange={(e) => updSet(i, { loadKg: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
            </div>
          ))}
          {errors.sets && <span className="error-text" role="alert">{errors.sets}</span>}
        </div>
      )}
      <Field label={`Fatica percepita${rpe ? `: ${rpe}/10` : ''}`} htmlFor="cr" optional error={errors.rpe} hint="1 = molto facile, 10 = massimo sforzo."><input id="cr" type="range" min="1" max="10" className="input" style={{ padding: 0 }} value={rpe || '5'} onChange={(e) => setRpe(e.target.value)} onClick={() => !rpe && setRpe('5')} /></Field>
      <Field label="Difficoltà incontrate" htmlFor="cd2" optional><input id="cd2" className="input" maxLength={300} value={diff} onChange={(e) => setDiff(e.target.value)} /></Field>
      <Field label="Note" htmlFor="cn2" optional><input id="cn2" className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Switch label="Condividi il completamento con i compagni di club" description="Se spento resta privato e non conta in sfide e classifiche." checked={shared} onChange={setShared} />
      <Button variant="primary" block loading={busy} onClick={save}>Salva nello storico</Button>
    </Sheet>
  );
}

/* ====================== Procedura guidata ====================== */

const GOALS: Array<[PlanGoal, string, string]> = [
  ['start_running', 'Iniziare a correre', 'Alternanza corsa e camminata con progressione graduale.'],
  ['endurance', 'Migliorare la resistenza', 'Corse facili, una lunga e una sessione aerobica.'],
  ['distance', 'Aumentare la distanza', 'Una sessione lunga che cresce con prudenza.'],
  ['pace', 'Migliorare il ritmo', 'Ripetute e progressivi, con tanto recupero.'],
  ['strength_support', 'Integrare la forza', 'Corsa più due sessioni di forza a settimana.'],
];
const LEVELS: Array<[PlanLevel, string]> = [['beginner', 'Principiante'], ['intermediate', 'Intermedio'], ['advanced', 'Avanzato']];
const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function PlanWizard() {
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const nextMonday = (() => { const t = todayKey(); const m = mondayOf(t); return m < t ? addDays(m, 7) : m; })();
  const [step, setStep] = useState(1);
  const [w, setW] = useState<PlanWizardInput>({ name: 'Il mio piano', goal: 'start_running', level: 'beginner', weekdays: [2, 4, 6], maxMinutes: 45, equipment: [], preference: 'solo', includeStrength: false, startDate: nextMonday, weeks: 4 });
  const [prev, setPrev] = useState<{ sessions: SessionInput[]; warnings: string[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function preview() {
    setBusy(true);
    setErrors({});
    try { setPrev(await backend.previewPlan(w)); setStep(3); } catch (e) { const f = (e as { fields?: Record<string, string> }).fields; if (f) setErrors(f); toast('err', errText(e)); } finally { setBusy(false); }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    try { const r = await backend.createPlanFromWizard(w); toast('ok', `Piano salvato: ${r.sessions.length} sessioni. Puoi modificarle una per una.`); nav('/piano', { replace: true }); } catch (e) { toast('err', errText(e)); } finally { setBusy(false); }
  }
  const weeksList = prev ? Array.from({ length: w.weeks }, (_, i) => prev.sessions.filter((s) => s.date >= addDays(w.startDate, i * 7) && s.date < addDays(w.startDate, i * 7 + 7))) : [];

  return (
    <div className="page no-nav has-action">
      <Link to="/piano" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      <h1 className="display h1">Piano guidato</h1>
      <p className="muted small" aria-live="polite">Passo {step} di 3 · il programma si basa solo sulle tue risposte e resta modificabile.</p>

      {step === 1 && (
        <div className="stack" style={{ gap: 'var(--s-5)' }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm"><legend className="label" style={{ marginBottom: 6 }}>Qual è il tuo obiettivo?</legend>
            {GOALS.map(([k, t, d]) => <button key={k} type="button" role="radio" aria-checked={w.goal === k} className="choice" onClick={() => setW({ ...w, goal: k, includeStrength: k === 'strength_support' ? true : w.includeStrength })}><span><span className="t">{t}</span><br /><span className="muted small">{d}</span></span></button>)}
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm"><legend className="label" style={{ marginBottom: 6 }}>Livello attuale</legend>
            <div className="row wrap" role="radiogroup" aria-label="Livello">{LEVELS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={w.level === k} className="pill" style={w.level === k ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent-2)' } : undefined} onClick={() => setW({ ...w, level: k })}>{l}</button>)}</div>
            <span className="hint">Se non sei sicuro, scegli il livello più basso: potrai aumentare dopo.</span></fieldset>
          <Field label="Nome del piano" htmlFor="wn"><input id="wn" className="input" maxLength={60} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
        </div>
      )}
      {step === 2 && (
        <div className="stack" style={{ gap: 'var(--s-5)' }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm"><legend className="label" style={{ marginBottom: 6 }}>Giorni disponibili</legend>
            <div className="row wrap">{WD.map((l, i) => <button key={l} type="button" className="pill" aria-pressed={w.weekdays.includes(i + 1)} onClick={() => setW({ ...w, weekdays: toggle(w.weekdays, i + 1) })}>{l}</button>)}</div>
            {errors.weekdays && <span className="error-text" role="alert">{errors.weekdays}</span>}<span className="hint">Il piano non userà tutti i giorni: lascia sempre spazio al recupero.</span></fieldset>
          <Field label="Durata massima di una sessione (min)" htmlFor="wm" error={errors.maxMinutes}><input id="wm" className="input" inputMode="numeric" value={String(w.maxMinutes)} onChange={(e) => setW({ ...w, maxMinutes: Number(e.target.value) || 0 })} /></Field>
          <Switch label="Includi forza muscolare" description="Una sessione di forza a settimana (due se l'obiettivo è integrare la forza)." checked={w.includeStrength} onChange={(v) => setW({ ...w, includeStrength: v })} />
          {(w.includeStrength || w.goal === 'strength_support') && <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm"><legend className="label" style={{ marginBottom: 6 }}>Attrezzatura disponibile</legend><div className="row wrap">{(Object.keys(EQUIPMENT_LABEL) as EquipmentId[]).filter((e) => e !== 'bodyweight').map((e) => <button key={e} type="button" className="pill" aria-pressed={w.equipment.includes(e)} onClick={() => setW({ ...w, equipment: toggle(w.equipment, e) })}>{EQUIPMENT_LABEL[e]}</button>)}</div><span className="hint">Il corpo libero è sempre disponibile.</span></fieldset>}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm"><legend className="label" style={{ marginBottom: 6 }}>Preferisci allenarti…</legend><div className="row wrap" role="radiogroup">{([['solo', 'Da solo'], ['group', 'In gruppo'], ['mixed', 'Misto']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={w.preference === k} className="pill" style={w.preference === k ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent-2)' } : undefined} onClick={() => setW({ ...w, preference: k })}>{l}</button>)}</div><span className="hint">Potrai trasformare le corse in uscite di gruppo quando vuoi.</span></fieldset>
          <div className="form-grid"><Field label="Settimane" htmlFor="ww" error={errors.weeks}><input id="ww" className="input" inputMode="numeric" value={String(w.weeks)} onChange={(e) => setW({ ...w, weeks: Number(e.target.value) || 0 })} /></Field><Field label="Parti da lunedì" htmlFor="wsd" error={errors.startDate}><input id="wsd" type="date" className="input" value={w.startDate} onChange={(e) => setW({ ...w, startDate: e.target.value })} /></Field></div>
        </div>
      )}
      {step === 3 && prev && (
        <div className="stack">
          {prev.warnings.map((x) => <div key={x} className="banner info">{x}</div>)}
          {prev.sessions.length === 0 ? <EmptyState icon={<CalendarDays />} title="Nessuna sessione" text="Con queste scelte non si genera nulla: torna indietro e scegli almeno un giorno." /> : weeksList.map((list, i) => (
            <section key={i} className="card" aria-label={`Settimana ${i + 1}`}>
              <div className="row between"><h2 className="section-title">Settimana {i + 1}</h2><span className="chip">{list.reduce((a, s) => a + s.durationMin, 0)} min</span></div>
              {list.map((s, k) => <div key={k} className="row small"><span className="muted" style={{ width: 70 }}>{new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(`${s.date}T12:00:00Z`))}</span><KindBadge kind={s.kind} size={28} /><span className="grow truncate">{s.title}</span><span className="muted">{s.durationMin}′</span></div>)}
            </section>
          ))}
          <p className="hint"><Info size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px' }} /> {PLAN_DISCLAIMER} Dopo il salvataggio potrai modificare, spostare o eliminare ogni sessione.</p>
        </div>
      )}
      <div className="action-bar"><div>
        {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Indietro</Button>}
        {step === 1 && <Button variant="primary" block onClick={() => setStep(2)}>Avanti</Button>}
        {step === 2 && <Button variant="primary" block loading={busy} onClick={preview}>Vedi il programma</Button>}
        {step === 3 && <Button variant="primary" block loading={busy} disabled={!prev?.sessions.length} onClick={save}>Salva il piano</Button>}
      </div></div>
    </div>
  );
}

/* ====================== Progressi ====================== */

export function Progress() {
  const { backend } = useSession();
  const tz = deviceTimezone();
  const endWeek = mondayOf(todayKey());
  const weeks = useAsync(() => backend.trainingProgress(8, endWeek, tz), []);
  const strength = useAsync(() => backend.strengthProgress(), []);
  const [ex, setEx] = useState<string | null>(null);
  const sel = strength.data?.find((x) => x.exercise === ex) ?? strength.data?.[0] ?? null;
  const w = weeks.data ?? [];
  const fmt = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
  const pts: StrengthPoint[] = sel?.points ?? [];
  return (
    <div className="page">
      <Link to="/piano" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Piano</Link>
      <h1 className="display h1">Progressi</h1>
      {weeks.loading && !weeks.data ? <ListSkeleton rows={2} /> : weeks.error ? <ErrorState message={weeks.error.message} onRetry={weeks.reload} /> : (
        <>
          <section className="card"><BarChart title="Minuti: pianificato e svolto (8 settimane)" unit="min" data={w.map((x) => ({ key: x.weekStart, label: fmt(x.weekStart), value: x.completed.minutes, planned: x.planned.minutes }))} /></section>
          <section className="card"><BarChart title="Sessioni registrate per settimana" unit="sessioni" valueLabel="Registrate" data={w.map((x) => ({ key: x.weekStart, label: fmt(x.weekStart), value: x.completed.count }))} /></section>
          <section className="card"><h2 className="section-title">Chilometri per fonte</h2>
            <table className="data-table"><thead><tr><th scope="col">Settimana</th><th scope="col">Inseriti da te (km)</th><th scope="col">Importati (km)</th></tr></thead><tbody>{w.map((x) => <tr key={x.weekStart}><th scope="row">{fmt(x.weekStart)}</th><td>{x.sources.manualKm}</td><td>{x.sources.importedKm}</td></tr>)}</tbody></table>
            <p className="hint">Le attività sono mostrate separatamente per fonte; quelle già presenti non vengono contate due volte.</p></section>
        </>
      )}
      <section className="card" aria-labelledby="sp"><h2 className="section-title" id="sp">Forza: carichi registrati</h2>
        {strength.loading ? <ListSkeleton rows={1} /> : !strength.data?.length ? <p className="muted small">Nessuna serie di forza registrata. Dopo aver completato una sessione di forza qui vedrai i carichi nel tempo.</p> : (
          <>
            <select className="select" aria-label="Esercizio" value={sel?.exercise ?? ''} onChange={(e) => setEx(e.target.value)}>{strength.data.map((x) => <option key={x.exercise} value={x.exercise}>{x.exercise}</option>)}</select>
            <BarChart title="Carico massimo per giorno" unit="kg" data={pts.slice(-10).map((p) => ({ key: p.date, label: `${p.date.slice(8)}/${p.date.slice(5, 7)}`, value: p.topLoadKg ?? 0 }))} />
            <p className="hint">Mostra i dati che inserisci. Un carico più alto non misura da solo la forma fisica e non dedichiamo nulla di fisiologico.</p>
          </>
        )}
      </section>
    </div>
  );
}

/* ====================== Routine ====================== */

export function Routines() {
  const { backend } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => backend.listRoutines(), []);
  const [edit, setEdit] = useState<{ id: string | null; name: string; exercises: import('../../shared/types.ts').PlannedExercise[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save() {
    if (!edit) return;
    try { await backend.saveRoutine(edit); setEdit(null); setErrors({}); toast('ok', 'Routine salvata.'); reload(); } catch (e) { const f = (e as { fields?: Record<string, string> }).fields; setErrors(f ?? {}); toast('err', errText(e)); }
  }
  return (
    <div className="page">
      <Link to="/piano" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Piano</Link>
      <header className="topbar"><h1 className="display h1">Routine di forza</h1><Button size="sm" variant="primary" onClick={() => setEdit({ id: null, name: '', exercises: [] })}><Plus size={16} aria-hidden="true" /> Nuova</Button></header>
      {loading ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.length ? data.map((r) => (
        <div key={r.id} className="card"><div className="row between"><strong>{r.name}</strong><div className="row"><Button size="sm" variant="outline" onClick={() => setEdit({ id: r.id, name: r.name, exercises: r.exercises })}>Modifica</Button><button className="icon-btn" aria-label={`Elimina ${r.name}`} onClick={async () => { try { await backend.deleteRoutine(r.id); reload(); } catch (e) { toast('err', errText(e)); } }}><Trash2 size={18} /></button></div></div><span className="muted small">{r.exercises.map((e) => e.name).join(' · ')}</span></div>
      )) : <EmptyState icon={<Dumbbell />} title="Nessuna routine" text="Crea una routine di esercizi (gambe, glutei, core, schiena…) e riutilizzala nelle sessioni di forza." />}
      {edit && (
        <Sheet title={edit.id ? 'Modifica routine' : 'Nuova routine'} onClose={() => setEdit(null)}>
          <Field label="Nome" htmlFor="rn2" error={errors.name}><input id="rn2" className="input" maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-autofocus /></Field>
          <ExerciseEditor value={edit.exercises} onChange={(v) => setEdit({ ...edit, exercises: v })} />
          {errors.exercises && <span className="error-text" role="alert">{errors.exercises}</span>}
          <Button variant="primary" block onClick={save}>Salva</Button>
        </Sheet>
      )}
    </div>
  );
}
