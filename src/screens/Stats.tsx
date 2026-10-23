import { ArrowLeft, Download, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CLASS_LABEL, SOURCE_LABEL } from '../../shared/activities.ts';
import { ENABLED_SPORTS, sportDef } from '../../shared/sports.ts';
import { deviceTimezone, formatPace, utcToZoned } from '../../shared/time.ts';
import type { ActivityView, SportId } from '../../shared/types.ts';
import { validateActivityInput } from '../../shared/validation.ts';
import { BarChart } from '../components/BarChart.tsx';
import { fmtDayShort, fmtKm } from '../format.ts';
import { errText, useSession } from '../session.tsx';
import { Button, ConfirmSheet, EmptyState, ErrorState, Field, ListSkeleton, Sheet, Switch, useAsync, useToast } from '../ui.tsx';
import { LogActivity } from './Profile.tsx';

type Period = '7' | '30' | 'year' | 'all';
const PERIODS: Array<[Period, string]> = [['7', '7 giorni'], ['30', '30 giorni'], ['year', 'Quest\'anno'], ['all', 'Tutto']];

function periodRange(p: Period): { from: string | null; to: string | null } {
  const now = new Date();
  if (p === 'all') return { from: null, to: null };
  if (p === 'year') return { from: `${utcToZoned(now.toISOString(), deviceTimezone()).date.slice(0, 4)}-01-01T00:00:00.000Z`, to: null };
  return { from: new Date(now.getTime() - Number(p) * 86_400_000).toISOString(), to: null };
}

const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export function Stats() {
  const { backend } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tz = deviceTimezone();
  const stats = useAsync(() => backend.getStats(tz), []);
  const [period, setPeriod] = useState<Period>('30');
  const [sport, setSport] = useState<SportId | null>(null);
  const range = periodRange(period);
  const hist = useAsync(() => backend.listActivities({ ...range, sport }), [period, sport]);
  const [log, setLog] = useState(params.get('registra') === '1');
  const [edit, setEdit] = useState<ActivityView | null>(null);
  const [del, setDel] = useState<ActivityView | null>(null);
  const [stravaOn, setStravaOn] = useState(false);
  useEffect(() => { setStravaOn(backend.ext.features.strava); }, [backend]);
  const reloadAll = () => { stats.reload(); hist.reload(); };
  const s = stats.data;

  return (
    <div className="page">
      <Link to="/profilo" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Profilo</Link>
      <header className="topbar">
        <h1 className="display h1">Statistiche</h1>
        <Button size="sm" variant="primary" onClick={() => setLog(true)}><Plus size={16} aria-hidden="true" /> Registra</Button>
      </header>

      {stats.loading && !s ? <ListSkeleton rows={3} /> : stats.error ? <ErrorState message={stats.error.message} onRetry={stats.reload} /> : s && !s.hasData ? (
        <EmptyState icon={<Plus />} title="Ancora nessuna attività" text="Le statistiche si costruiscono solo dalle attività che registri: a mano, dopo un'uscita di gruppo o importandole. Niente numeri inventati." action={
          <div className="stack-sm" style={{ width: '100%' }}>
            <Button variant="primary" block onClick={() => setLog(true)}>Registra la prima attività</Button>
            <Link to="/profilo/integrazioni" className="btn btn-outline btn-block">{stravaOn ? 'Collega Strava o importa da file' : 'Importa da file (GPX, TCX, Apple Salute)'}</Link>
          </div>} />
      ) : s && (
        <>
          <section className="card" aria-label="Riepilogo">
            <div className="stats">
              <div className="stat"><span className="v">{s.totals.runs}</span><span className="l">Attività</span></div>
              <div className="stat"><span className="v">{s.totals.distanceKm.toLocaleString('it-IT')}</span><span className="l">Km totali</span></div>
              <div className="stat"><span className="v">{s.totals.activeDays}</span><span className="l">Giorni attivi</span></div>
            </div>
            <div className="stats">
              <div className="stat"><span className="v">{s.week.distanceKm.toLocaleString('it-IT')}</span><span className="l">Km questa settimana ({s.week.runs})</span></div>
              <div className="stat"><span className="v">{s.month.distanceKm.toLocaleString('it-IT')}</span><span className="l">Km questo mese ({s.month.runs})</span></div>
              <div className="stat"><span className="v">{s.streakWeeks}</span><span className="l">Settimane attive di fila</span></div>
            </div>
            <p className="small">
              {s.monthDeltaKm === null ? <span className="muted">Nessun dato nel mese scorso per il confronto.</span> : <>Rispetto all'intero mese scorso ({fmtKm(s.prevMonth.distanceKm)}): <strong>{s.monthDeltaKm >= 0 ? '+' : '−'}{fmtKm(Math.abs(s.monthDeltaKm))}</strong> finora. <span className="muted">Il mese in corso non è ancora completo.</span></>}
            </p>
            <p className="hint">Totali e media di tempo: {dur(s.totals.durationMin)} di attività con durata indicata. Serie migliore: {s.bestStreakWeeks} {s.bestStreakWeeks === 1 ? 'settimana' : 'settimane'}.</p>
          </section>

          <section className="card"><BarChart title="Distanza per mese (ultimi 6)" unit="km" data={s.monthly.map((m) => ({ key: m.month, label: m.label.split(' ')[0], value: m.distanceKm }))} format={(n) => n.toLocaleString('it-IT')} /></section>
          <section className="card"><BarChart title="Distanza per settimana (ultime 8)" unit="km" data={s.weekly.map((w) => ({ key: w.weekStart, label: w.weekStart.slice(8) + '/' + w.weekStart.slice(5, 7), value: w.distanceKm }))} format={(n) => n.toLocaleString('it-IT')} /></section>

          <section className="card" aria-labelledby="rec">
            <h2 className="section-title" id="rec">Record personali</h2>
            <p className="hint">Calcolati solo sulle attività presenti nello storico.</p>
            <ul className="stack-sm small">
              {s.records.longestKm && <li>Uscita più lunga: <strong>{fmtKm(s.records.longestKm.value)}</strong> · {fmtDayShort(s.records.longestKm.date, tz)}</li>}
              {s.records.bestWeekKm && <li>Miglior settimana: <strong>{fmtKm(s.records.bestWeekKm.value)}</strong> · dal {s.records.bestWeekKm.weekStart.split('-').reverse().join('/')}</li>}
              {s.records.bestMonthKm && <li>Miglior mese: <strong>{fmtKm(s.records.bestMonthKm.value)}</strong> · {s.records.bestMonthKm.month}</li>}
              {s.records.mostRunsInWeek && <li>Più attività in una settimana: <strong>{s.records.mostRunsInWeek.value}</strong></li>}
              {s.records.fastestPace ? <li>Ritmo medio più veloce (≥ 3 km): <strong>{formatPace(s.records.fastestPace.secPerKm)}</strong> su {fmtKm(s.records.fastestPace.distanceKm)} · {fmtDayShort(s.records.fastestPace.date, tz)}</li> : <li className="muted">Ritmo: servono attività da almeno 3 km con durata indicata.</li>}
            </ul>
          </section>

          <section className="card" aria-label="Origine dei dati">
            <h2 className="section-title">Da dove arrivano i dati</h2>
            <div className="tags">
              <span className="chip">Autodichiarate: {s.byOrigin.selfDeclared}</span>
              <span className="chip">Importate: {s.byOrigin.imported}</span>
              <span className="chip">Verificate: {s.byOrigin.verified}</span>
            </div>
            <p className="hint">Le attività inserite a mano non sono verificate. “Importate” arrivano da Strava o da file. Nessuna integrazione certifica oggi i dati: “Verificate” resta a zero.</p>
          </section>
        </>
      )}

      <section className="stack" aria-labelledby="hist">
        <h2 className="section-title" id="hist">Storico</h2>
        <div className="filter-row" role="group" aria-label="Periodo">{PERIODS.map(([k, l]) => <button key={k} className="pill" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}</div>
        {ENABLED_SPORTS.length > 1 && <div className="filter-row" role="group" aria-label="Sport"><button className="pill" aria-pressed={sport === null} onClick={() => setSport(null)}>Tutti gli sport</button>{ENABLED_SPORTS.map((x) => <button key={x.id} className="pill" aria-pressed={sport === x.id} onClick={() => setSport(sport === x.id ? null : x.id)}>{x.label}</button>)}</div>}
        {hist.loading && !hist.data ? <ListSkeleton rows={2} /> : hist.error ? <ErrorState message={hist.error.message} onRetry={hist.reload} /> : hist.data && hist.data.length ? (
          <ul className="card" style={{ gap: 0 }}>
            {hist.data.map((a) => (
              <li key={a.id} className="rank-row" style={{ listStyle: 'none', alignItems: 'flex-start' }}>
                <span className="grow">
                  <strong>{a.distanceKm ? fmtKm(a.distanceKm) : 'Attività'}</strong>{a.durationMin ? <span className="muted"> · {dur(a.durationMin)}</span> : null}
                  {a.distanceKm && a.durationMin && a.distanceKm >= 1 ? <span className="muted"> · {formatPace(Math.round((a.durationMin * 60) / a.distanceKm))}</span> : null}
                  <br /><span className="muted xs">{a.title ? `${a.title} · ` : ''}{fmtDayShort(a.date, deviceTimezone())} · {sportDef(a.sport).label}{a.eventTitle ? ` · ${a.eventTitle}` : ''}</span>
                  <br /><span className="tags" style={{ marginTop: 4 }}>
                    <span className={`chip ${a.cls === 'imported' ? 'accent' : ''}`}>{CLASS_LABEL[a.cls]}</span>
                    <span className="chip">{SOURCE_LABEL[a.source]}</span>
                    {a.visibility === 'private' && <span className="chip">Privata</span>}
                  </span>
                  {a.source === 'strava' && a.externalId && <a className="xs accent" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', minHeight: 32 }} href={`https://www.strava.com/activities/${a.externalId.replace('strava:', '')}`} target="_blank" rel="noopener noreferrer">Visualizza su Strava <ExternalLink size={12} aria-hidden="true" /></a>}
                </span>
                {a.source !== 'strava' && <button className="icon-btn" aria-label="Modifica attività" onClick={() => setEdit(a)}><Pencil size={18} /></button>}
                <button className="icon-btn" aria-label="Elimina attività" onClick={() => setDel(a)}><Trash2 size={18} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Nessuna attività in questo periodo.</p>}
        {stravaOn && <p className="attr">Powered by Strava — i dati Strava sono visibili solo a te.</p>}
      </section>

      <Link to="/profilo/integrazioni" className="btn btn-outline"><Download size={18} aria-hidden="true" /> Importa o collega Strava</Link>

      {log && <LogActivity onClose={() => { setLog(false); if (params.get('registra')) setParams({}, { replace: true }); }} onSaved={() => { setLog(false); toast('ok', 'Attività registrata'); reloadAll(); }} />}
      {edit && <EditActivity a={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast('ok', 'Attività aggiornata'); reloadAll(); }} />}
      {del && <ConfirmSheet title="Eliminare l'attività?" danger confirmLabel="Elimina" onClose={() => setDel(null)} onConfirm={async () => { try { await backend.deleteActivity(del.id); setDel(null); reloadAll(); toast('ok', 'Attività eliminata'); } catch (e) { toast('err', errText(e)); } }}><p>{fmtKm(del.distanceKm ?? 0)} del {fmtDayShort(del.date, deviceTimezone())}. Le statistiche si aggiornano di conseguenza.{del.source === 'strava' ? ' Resterà su Strava; se sincronizzi di nuovo potrebbe essere reimportata.' : ''}</p></ConfirmSheet>}
    </div>
  );
}

function EditActivity({ a, onClose, onSaved }: { a: ActivityView; onClose: () => void; onSaved: () => void }) {
  const { backend } = useSession();
  const toast = useToast();
  const tz = deviceTimezone();
  const metricsLocked = a.source === 'file' || a.source === 'event';
  const [date, setDate] = useState(utcToZoned(a.date, tz).date);
  const [km, setKm] = useState(a.distanceKm !== null ? String(a.distanceKm).replace('.', ',') : '');
  const [min, setMin] = useState(a.durationMin !== null ? String(a.durationMin) : '');
  const [note, setNote] = useState(a.note);
  const [shared, setShared] = useState(a.visibility === 'shared');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    const n = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
    const iso = a.source === 'manual' && a.dayOnly ? (new Date(`${date}T12:00:00`).toISOString()) : a.date;
    const input = { date: metricsLocked ? a.date : iso, sport: a.sport, distanceKm: n(km), durationMin: n(min), note, dayOnly: a.dayOnly, visibility: shared ? ('shared' as const) : ('private' as const) };
    const v = validateActivityInput(input, new Date());
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try { await backend.updateActivity(a.id, input); onSaved(); } catch (e) { const f = (e as { fields?: Record<string, string> }).fields; if (f) setErrors(f); else toast('err', errText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Modifica attività" onClose={onClose}>
      <p className="muted small">{CLASS_LABEL[a.cls]} · {SOURCE_LABEL[a.source]}. {metricsLocked ? 'Distanza e durata di questa attività non si modificano.' : 'Questi valori sono dichiarati da te.'}</p>
      {!metricsLocked && a.source === 'manual' && <Field label="Giorno" htmlFor="ed" error={errors.date}><input id="ed" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      <div className="form-grid">
        <Field label="Distanza (km)" htmlFor="ek" error={errors.distanceKm}><input id="ek" className="input" inputMode="decimal" disabled={metricsLocked} value={km} onChange={(e) => setKm(e.target.value)} /></Field>
        <Field label="Durata (min)" htmlFor="em2" error={errors.durationMin} optional><input id="em2" className="input" inputMode="numeric" disabled={metricsLocked} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
      </div>
      <Field label="Nota" htmlFor="en" optional error={errors.note}><input id="en" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Switch label="Conta in sfide, classifiche e feed" description="Se disattivata, resta solo nelle tue statistiche." checked={shared} onChange={setShared} />
      <Button variant="primary" block loading={busy} onClick={save}>Salva</Button>
    </Sheet>
  );
}
