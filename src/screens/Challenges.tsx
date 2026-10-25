import { ArrowLeft, Copy, Crown, Flag, Info, Plus, Share2, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TYPE_LABEL, validateChallengeInput } from '../../shared/challenges.ts';
import { ENABLED_SPORTS, sportDef } from '../../shared/sports.ts';
import { deviceTimezone, utcToZoned, zonedToUtcIso } from '../../shared/time.ts';
import type { ChallengeInput, ChallengeType, ChallengeView, SportId } from '../../shared/types.ts';
import { fmtDayShort, fmtKm } from '../format.ts';
import { copyText, shareLink, whatsappUrl } from '../share.ts';
import { errText, loginPath, useSession } from '../session.tsx';
import { Avatar, Button, ConfirmSheet, EmptyState, ErrorState, Field, ListSkeleton, Sheet, describedBy, useAsync, useToast } from '../ui.tsx';

const TYPE_HINT: Record<ChallengeType, string> = {
  most_runs: 'Vince chi registra più uscite nel periodo.',
  most_distance: 'Vince chi accumula più chilometri dichiarati.',
  most_active_days: 'Vince chi si muove in più giorni diversi.',
  collective_distance: 'Il gruppo deve raggiungere insieme un totale di km.',
  personal_goal: 'Ognuno sceglie il proprio obiettivo in km: si confronta la percentuale raggiunta.',
};

const PHASE: Record<ChallengeView['phase'], { label: string; cls: string }> = {
  upcoming: { label: 'Non ancora iniziata', cls: '' },
  running: { label: 'In corso', cls: 'accent' },
  closing: { label: 'In chiusura', cls: '' },
  ended: { label: 'Conclusa', cls: 'success' },
  cancelled: { label: 'Annullata', cls: 'danger' },
};

function valueText(c: ChallengeView, v: number): string {
  if (c.type === 'most_runs') return `${v} ${v === 1 ? 'uscita' : 'uscite'}`;
  if (c.type === 'most_active_days') return `${v} ${v === 1 ? 'giorno' : 'giorni'}`;
  return fmtKm(v);
}

export function challengeLink(c: Pick<ChallengeView, 'id' | 'inviteCode'>): string {
  return `${window.location.origin}/sfida/${c.id}${c.inviteCode ? `?c=${c.inviteCode}` : ''}`;
}

export function ChallengeCard({ c }: { c: ChallengeView }) {
  const me = c.rows.find((r) => r.isMe);
  const pct = c.type === 'collective_distance' && c.goalKm ? Math.min(100, Math.round((c.totalKm / c.goalKm) * 100)) : c.type === 'personal_goal' ? Math.min(100, Math.round(me?.pct ?? 0)) : null;
  return (
    <Link to={`/sfida/${c.id}`} className="card card-link" aria-label={`${c.name}, ${PHASE[c.phase].label}`}>
      <div className="row between">
        <span className="chip">{TYPE_LABEL[c.type]}</span>
        <span className={`chip ${PHASE[c.phase].cls}`}>{PHASE[c.phase].label}</span>
      </div>
      <strong style={{ fontSize: 'var(--fs-lg)' }}>{c.name}</strong>
      <span className="muted small">{fmtDayShort(c.startsAt, c.timezone)} → {fmtDayShort(new Date(Date.parse(c.endsAt) - 1).toISOString(), c.timezone)} · {c.participantCount} {c.participantCount === 1 ? 'partecipante' : 'partecipanti'}</span>
      {pct !== null && (
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Avanzamento ${pct}%`}><i style={{ width: `${pct}%` }} /></div>
      )}
      {me && c.type !== 'collective_distance' && c.type !== 'personal_goal' && <span className="small">Sei {me.rank}º · <strong>{valueText(c, me.value)}</strong></span>}
    </Link>
  );
}

export function ChallengeForm() {
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const tz = deviceTimezone();
  const clubs = useAsync(() => backend.listMyClubs(), []);
  const today = utcToZoned(new Date().toISOString(), tz).date;
  const plus = (n: number) => utcToZoned(new Date(Date.now() + n * 86_400_000).toISOString(), tz).date;
  const [f, setF] = useState({ name: '', description: '', type: 'most_distance' as ChallengeType, sport: 'running' as SportId, start: today, end: plus(7), goal: '', myGoal: '', clubId: params.get('club') ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  async function submit() {
    if (busy) return;
    const startsAt = zonedToUtcIso(f.start, '00:00', tz);
    const endNext = new Date(`${f.end}T12:00:00Z`);
    endNext.setUTCDate(endNext.getUTCDate() + 1);
    const endsAt = f.end ? zonedToUtcIso(endNext.toISOString().slice(0, 10), '00:00', tz) : null; // la data di fine è inclusa
    const goal = f.goal.trim() ? Number(f.goal.replace(',', '.')) : null;
    const input: ChallengeInput = { name: f.name, description: f.description, type: f.type, sport: f.sport, startsAt: startsAt ?? 'x', endsAt: endsAt ?? 'x', timezone: tz, goalKm: goal !== null && Number.isNaN(goal) ? (NaN as never) : goal, clubId: f.clubId || null };
    const v = validateChallengeInput(input, new Date());
    const my = f.myGoal.trim() ? Number(f.myGoal.replace(',', '.')) : null;
    const errs: Record<string, string> = v.ok ? {} : { ...v.errors };
    if (f.type === 'personal_goal' && (my === null || Number.isNaN(my) || my < 1)) errs.myGoal = 'Indica il tuo obiettivo in km.';
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    try {
      const c = await backend.createChallenge(input, f.type === 'personal_goal' ? my : null);
      toast('ok', 'Sfida creata! Ora invita gli amici con il link.');
      nav(`/sfida/${c.id}`, { replace: true });
    } catch (e) {
      const fl = (e as { fields?: Record<string, string> }).fields;
      if (fl) setErrors(fl);
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page no-nav has-action">
      <Link to="/social" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      <h1 className="display h1">Nuova sfida</h1>
      <form className="stack" style={{ gap: 'var(--s-5)' }} noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Nome" htmlFor="cn" error={errors.name}><input id="cn" className="input" maxLength={60} placeholder="Es. 100 km in una settimana" value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={describedBy('cn', errors.name)} /></Field>
        <Field label="Descrizione" htmlFor="cd" optional error={errors.description}><textarea id="cd" className="textarea" maxLength={300} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
          <legend className="label" style={{ marginBottom: 6 }}>Tipo di sfida</legend>
          {(Object.keys(TYPE_LABEL) as ChallengeType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.type === t} className="choice" onClick={() => set('type', t)}>
              <span><span className="t">{TYPE_LABEL[t]}</span><br /><span className="muted small">{TYPE_HINT[t]}</span></span>
            </button>
          ))}
        </fieldset>
        {f.type === 'collective_distance' && <Field label="Obiettivo del gruppo (km)" htmlFor="cg" error={errors.goalKm}><input id="cg" className="input" inputMode="decimal" placeholder="Es. 200" value={f.goal} onChange={(e) => set('goal', e.target.value)} aria-invalid={!!errors.goalKm} /></Field>}
        {f.type === 'personal_goal' && <Field label="Il tuo obiettivo (km)" htmlFor="cmg" error={errors.myGoal || errors.goalKm} hint="Ogni partecipante sceglie il proprio quando si iscrive."><input id="cmg" className="input" inputMode="decimal" placeholder="Es. 30" value={f.myGoal} onChange={(e) => set('myGoal', e.target.value)} aria-invalid={!!(errors.myGoal || errors.goalKm)} /></Field>}
        <Field label="Sport" htmlFor="cs"><select id="cs" className="select" value={f.sport} onChange={(e) => set('sport', e.target.value as SportId)}>{ENABLED_SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Inizio" htmlFor="c1" error={errors.startsAt}><input id="c1" type="date" className="input" value={f.start} onChange={(e) => set('start', e.target.value)} aria-invalid={!!errors.startsAt} /></Field>
          <Field label="Fine (inclusa)" htmlFor="c2" error={errors.endsAt}><input id="c2" type="date" className="input" value={f.end} min={f.start} onChange={(e) => set('end', e.target.value)} aria-invalid={!!errors.endsAt} /></Field>
        </div>
        {clubs.data && clubs.data.length > 0 && (
          <Field label="Lancia la sfida a un club" htmlFor="cc" optional hint="Se scegli un club, i membri la vedono subito."><select id="cc" className="select" value={f.clubId} onChange={(e) => set('clubId', e.target.value)}><option value="">Nessun club (solo con link)</option>{clubs.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        )}
        <div className="banner info"><Info size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} /><span>I risultati si calcolano dalle attività registrate nell'app (a mano o dopo un'uscita). Sono dati autodichiarati. Le attività importate da servizi esterni restano private e non contano.</span></div>
      </form>
      <div className="action-bar"><div><Button variant="primary" block loading={busy} onClick={submit}>Crea la sfida</Button></div></div>
    </div>
  );
}

export function ChallengeDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const code = params.get('c');
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => backend.getChallenge(id, code), [id, code, me?.id]);
  const [view, setView] = useState<ChallengeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);
  const [confirm, setConfirm] = useState<null | 'leave' | 'cancel'>(null);
  const c = view?.id === id ? view : data;

  async function act(fn: () => Promise<ChallengeView>, ok: string) {
    setBusy(true);
    try { setView(await fn()); toast('ok', ok); } catch (e) { toast('err', errText(e)); reload(); } finally { setBusy(false); }
  }

  if (loading && !c) return <div className="page"><ListSkeleton rows={3} /></div>;
  if (error || !c) return <div className="page"><Link to="/social" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Social</Link><ErrorState message={error?.code === 'not_found' ? 'Sfida non trovata. Serve il link d\'invito completo.' : (error?.message ?? 'Errore')} onRetry={reload} /></div>;

  const link = challengeLink(c);
  const winner = c.finalized && c.rows[0] && c.rows[0].value > 0 ? c.rows[0] : null;
  const pct = c.type === 'collective_distance' && c.goalKm ? Math.min(100, Math.round((c.totalKm / c.goalKm) * 100)) : null;

  return (
    <div className="page has-action">
      <div className="topbar">
        <button className="back-link" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/social'))} style={{ background: 'none', border: 0, cursor: 'pointer' }}><ArrowLeft size={18} aria-hidden="true" /> Indietro</button>
      </div>
      <header className="stack-sm">
        <div className="tags"><span className="chip">{TYPE_LABEL[c.type]}</span><span className={`chip ${PHASE[c.phase].cls}`}>{PHASE[c.phase].label}</span><span className="chip">{sportDef(c.sport).label}</span></div>
        <h1 className="display h1" style={{ fontSize: 'var(--fs-3xl)' }}>{c.name}</h1>
        <p className="muted small">Dal {fmtDayShort(c.startsAt, c.timezone)} al {fmtDayShort(new Date(Date.parse(c.endsAt) - 1).toISOString(), c.timezone)} · creata da {c.creator.displayName}</p>
        {c.description && <p className="muted">{c.description}</p>}
      </header>

      {c.phase === 'cancelled' && <div className="banner err" role="alert">Questa sfida è stata annullata.</div>}
      {c.phase === 'closing' && <div className="banner info">La sfida è finita: per 24 ore si possono ancora registrare attività svolte nel periodo, poi il risultato si congela.</div>}
      {c.finalized && (
        <section className="card hero" aria-label="Risultato finale">
          <div className="row"><Trophy className="accent" aria-hidden="true" /><h2 className="section-title">Risultato finale</h2></div>
          {c.type === 'collective_distance' ? (
            <p>Il gruppo ha raggiunto <strong>{fmtKm(c.totalKm)}</strong> su {fmtKm(c.goalKm ?? 0)}: {c.totalKm >= (c.goalKm ?? Infinity) ? 'obiettivo raggiunto!' : 'obiettivo non raggiunto.'}</p>
          ) : winner ? (
            <p>{c.type === 'personal_goal' ? 'Miglior avanzamento:' : 'Vincitore:'} <strong>{winner.user.displayName}</strong> con {c.type === 'personal_goal' ? `${winner.pct}%` : valueText(c, winner.value)}.</p>
          ) : <p>Nessuna attività registrata: nessun vincitore.</p>}
          <p className="hint">Il risultato è congelato: modifiche successive alle attività non lo cambiano.</p>
        </section>
      )}

      {pct !== null && (
        <section className="card" aria-label="Obiettivo collettivo">
          <div className="row between"><span className="label">Obiettivo del gruppo</span><span className="num" style={{ fontSize: '1.5rem' }}>{fmtKm(c.totalKm)} / {fmtKm(c.goalKm!)}</span></div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avanzamento del gruppo"><i style={{ width: `${pct}%` }} /></div>
        </section>
      )}

      <section className="card" aria-labelledby="rk">
        <div className="row between"><h2 className="section-title" id="rk">{c.finalized ? 'Classifica finale' : 'Classifica'}</h2><span className="chip accent"><Users size={13} aria-hidden="true" /> {c.participantCount}</span></div>
        {!me ? (
          <p className="muted small">Accedi per vedere la classifica e partecipare.</p>
        ) : c.rows.length ? (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {c.rows.map((r) => (
              <li key={r.userId} className={`rank-row ${r.rank === 1 && r.value > 0 ? 'first' : ''} ${r.isMe ? 'me' : ''}`}>
                <span className="rank-pos">{r.value > 0 || c.type === 'personal_goal' ? r.rank : '–'}</span>
                <Avatar user={r.user} size={36} />
                <span className="grow truncate">{r.user.displayName}{r.isMe ? ' (tu)' : ''}</span>
                <span className="num" style={{ fontSize: '1.3rem' }}>{c.type === 'personal_goal' ? `${r.pct ?? 0}%` : valueText(c, r.value)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="muted small">Nessun partecipante visibile.</p>}
        <p className="hint"><Info size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px' }} /> {c.dataNote}</p>
      </section>

      {c.viewer.isParticipant && c.phase !== 'cancelled' && !c.finalized && (
        <Link to="/profilo/statistiche?registra=1" className="btn btn-outline"><Plus size={18} aria-hidden="true" /> Registra un'attività</Link>
      )}

      {c.viewer.isParticipant && c.phase !== 'cancelled' && c.inviteCode && !c.finalized && (
        <section className="card" aria-labelledby="inv">
          <h2 className="section-title" id="inv">Invita gli amici</h2>
          <div className="row" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}><span className="truncate small grow" aria-label="Link della sfida">{link}</span></div>
          <div className="row wrap">
            <Button variant="primary" className="grow" onClick={async () => { const r = await shareLink({ title: c.name, text: `Ti sfido: "${c.name}" su RUNNGO!`, url: link }); if (r === 'copied') toast('ok', 'Link copiato'); if (r === 'failed') toast('err', 'Copia non riuscita.'); }}><Share2 size={18} aria-hidden="true" /> Condividi</Button>
            <Button variant="outline" onClick={async () => toast((await copyText(link)) ? 'ok' : 'err', 'Link copiato')}><Copy size={18} aria-hidden="true" /> Copia</Button>
            <a className="btn btn-outline" href={whatsappUrl(`Ti sfido: "${c.name}" su RUNNGO!`, link)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        </section>
      )}

      {c.viewer.isCreator && c.phase !== 'cancelled' && !c.finalized && <Button variant="danger" onClick={() => setConfirm('cancel')}>Annulla la sfida</Button>}
      {c.viewer.isParticipant && !c.viewer.isCreator && (c.phase === 'running' || c.phase === 'upcoming') && <Button variant="outline" onClick={() => setConfirm('leave')}>Abbandona la sfida</Button>}

      {(c.viewer.canJoin || !me) && (
        <div className="action-bar"><div>
          {!me ? <Link to={loginPath(`/sfida/${c.id}${code ? `?c=${code}` : ''}`)} className="btn btn-primary btn-block"><Flag size={18} aria-hidden="true" /> Accedi per partecipare</Link>
            : <Button variant="primary" block loading={busy} onClick={() => (c.type === 'personal_goal' ? setGoalSheet(true) : act(() => backend.joinChallenge(c.id, code, null), 'Sei dentro! Buona sfida.'))}><Crown size={18} aria-hidden="true" /> Partecipo</Button>}
        </div></div>
      )}

      {goalSheet && <GoalSheet onClose={() => setGoalSheet(false)} onSave={async (g) => { setGoalSheet(false); await act(() => backend.joinChallenge(c.id, code, g), 'Sei dentro! Buona sfida.'); }} />}
      {confirm === 'leave' && <ConfirmSheet title="Abbandonare la sfida?" confirmLabel="Abbandona" onClose={() => setConfirm(null)} onConfirm={async () => { try { await backend.leaveChallenge(c.id); toast('ok', 'Hai abbandonato la sfida.'); nav('/social', { replace: true }); } catch (e) { toast('err', errText(e)); } }}><p>Non comparirai più in classifica. Potrai rientrare finché la sfida è in corso.</p></ConfirmSheet>}
      {confirm === 'cancel' && <ConfirmSheet title="Annullare la sfida?" danger confirmLabel="Annulla la sfida" onClose={() => setConfirm(null)} onConfirm={async () => { await act(() => backend.cancelChallenge(c.id), 'Sfida annullata. I partecipanti sono stati avvisati.'); setConfirm(null); }}><p>I partecipanti riceveranno una notifica. L'operazione non si può annullare.</p></ConfirmSheet>}
    </div>
  );
}

function GoalSheet({ onClose, onSave }: { onClose: () => void; onSave: (g: number) => void }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  return (
    <Sheet title="Il tuo obiettivo" onClose={onClose}>
      <Field label="Quanti km vuoi raggiungere?" htmlFor="gk" error={err}><input id="gk" className="input" inputMode="decimal" placeholder="Es. 30" value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} data-autofocus /></Field>
      <Button variant="primary" block onClick={() => { const n = Number(v.replace(',', '.')); if (!Number.isFinite(n) || n < 1 || n > 10000) return setErr('Indica un numero tra 1 e 10000.'); onSave(n); }}>Partecipo</Button>
    </Sheet>
  );
}

export function useChallenges() {
  const { backend, me } = useSession();
  return useAsync(() => (me ? backend.listChallenges() : Promise.resolve([] as ChallengeView[])), [me?.id]);
}

export function ChallengesSection() {
  const { data, error, loading, reload } = useChallenges();
  const groups = useMemo(() => ({ active: (data ?? []).filter((c) => c.phase === 'running' || c.phase === 'upcoming' || c.phase === 'closing'), past: (data ?? []).filter((c) => c.phase === 'ended' || c.phase === 'cancelled') }), [data]);
  return (
    <section className="stack" aria-labelledby="chs">
      <div className="row between">
        <h2 className="section-title" id="chs">Sfide</h2>
        <Link to="/sfide/nuova" className="btn btn-primary btn-sm"><Plus size={16} aria-hidden="true" /> Nuova</Link>
      </div>
      {loading ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : groups.active.length || groups.past.length ? (
        <>
          {groups.active.map((c) => <ChallengeCard key={c.id} c={c} />)}
          {groups.past.length > 0 && <><h3 className="small muted" style={{ marginTop: 8 }}>Storico sfide</h3>{groups.past.map((c) => <ChallengeCard key={c.id} c={c} />)}</>}
        </>
      ) : (
        <EmptyState icon={<Flag />} title="Nessuna sfida" text="Sfida i tuoi amici: più uscite, più chilometri, più giorni attivi, un obiettivo di gruppo o personale. Si crea in un minuto e si invita con un link." action={<Link to="/sfide/nuova" className="btn btn-primary">Crea la prima sfida</Link>} />
      )}
    </section>
  );
}
