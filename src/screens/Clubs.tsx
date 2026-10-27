import { ArrowLeft, ChevronRight, ImagePlus, Plus, Trophy, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LEVELS, ENABLED_SPORTS } from '../../shared/sports.ts';
import { deviceTimezone, startOfWeekIso } from '../../shared/time.ts';
import type { ClubView, LeaderboardMetric, SportId } from '../../shared/types.ts';
import { validateClubInput } from '../../shared/validation.ts';
import { EventCard } from '../components/EventCard.tsx';
import { resizeToSquareDataUrl } from '../image.ts';
import { copyText, shareLink, whatsappUrl } from '../share.ts';
import { errText, loginPath, useSession } from '../session.tsx';
import { Avatar, Button, ConfirmSheet, DemoChip, EmptyState, ErrorState, Field, ListSkeleton, describedBy, useAsync, useToast } from '../ui.tsx';

void LEVELS;

export function ClubImage({ club, size = 56 }: { club: Pick<ClubView, 'imageDataUrl' | 'name'>; size?: number }) {
  return club.imageDataUrl ? (
    <img src={club.imageDataUrl} alt="" width={size} height={size} style={{ borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
  ) : (
    <span className="avatar" style={{ ['--size' as string]: `${size}px`, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 16 }} aria-hidden="true">
      {club.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Clubs() {
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => (me ? backend.listMyClubs() : Promise.resolve([])), [me?.id]);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setCodeErr('Inserisci il codice che ti hanno dato.');
    if (!me) return nav(loginPath(`/invito/${encodeURIComponent(code.trim())}`));
    setBusy(true);
    setCodeErr('');
    try {
      const c = await backend.joinClub(code);
      toast('ok', `Sei entrato in ${c.name}`);
      nav(`/club/${c.id}`);
    } catch (err) {
      setCodeErr(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="display h1">Club</h1>
        <Link to={me ? '/club/nuovo' : loginPath('/club/nuovo')} className="btn btn-primary btn-sm"><Plus size={18} aria-hidden="true" /> Crea club</Link>
      </header>

      {loading ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.length ? (
        <section className="stack" aria-label="I tuoi club">
          {data.map((c) => (
            <Link key={c.id} to={`/club/${c.id}`} className="card card-link row" style={{ flexDirection: 'row' }}>
              <ClubImage club={c} />
              <span className="grow">
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{c.name}</strong> <DemoChip id={c.id} /><br />
                <span className="muted small">{c.memberCount} {c.memberCount === 1 ? 'membro' : 'membri'}{c.area ? ` · ${c.area}` : ''}</span>
              </span>
              <ChevronRight aria-hidden="true" className="muted" />
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState icon={<Users />} title="Nessun club" text="Un club è il gruppo della tua palestra: avete le vostre uscite, la classifica settimanale e un codice per invitare tutti." action={<Link to={me ? '/club/nuovo' : loginPath('/club/nuovo')} className="btn btn-primary">Crea il club della tua palestra</Link>} />
      )}

      <form className="card" onSubmit={join} noValidate aria-label="Entra con un codice">
        <h2 className="section-title">Hai un codice d'invito?</h2>
        <Field label="Codice del club" htmlFor="code" error={codeErr}>
          <input id="code" className="input" placeholder="ABCD-1234" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(''); }} aria-invalid={!!codeErr} aria-describedby={describedBy('code', codeErr)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy}>Entra nel club</Button>
      </form>
    </div>
  );
}

export function ClubForm() {
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ name: '', description: '', sport: 'running' as SportId, area: '', imageDataUrl: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setF((s) => ({ ...s, imageDataUrl: null }));
      const url = await resizeToSquareDataUrl(file);
      setF((s) => ({ ...s, imageDataUrl: url }));
      setErrors((x) => ({ ...x, imageDataUrl: '' }));
    } catch (e) {
      setErrors((x) => ({ ...x, imageDataUrl: errText(e) }));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validateClubInput(f);
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try {
      const c = await backend.createClub(v.value);
      toast('ok', 'Club creato! Ora invita i compagni.');
      nav(`/club/${c.id}`, { replace: true });
    } catch (err) {
      const fields = (err as { fields?: Record<string, string> }).fields;
      if (fields) setErrors(fields);
      toast('err', errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page no-nav">
      <Link to="/club" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      <h1 className="display h1">Crea un club</h1>
      <form className="stack" style={{ gap: 'var(--s-5)' }} onSubmit={submit} noValidate>
        <Field label="Nome del club" htmlFor="cn" error={errors.name}>
          <input id="cn" className="input" maxLength={50} placeholder="Es. Runners Palestra Centro" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={describedBy('cn', errors.name)} />
        </Field>
        <Field label="Descrizione" htmlFor="cd" optional error={errors.description}>
          <textarea id="cd" className="textarea" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Sport" htmlFor="cs" error={errors.sport}>
          <select id="cs" className="select" value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value as SportId })}>
            {ENABLED_SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Località generale" htmlFor="ca" optional error={errors.area} hint="Solo la città o la zona, mai un indirizzo.">
          <input id="ca" className="input" maxLength={60} placeholder="Es. Forlì" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
        </Field>
        <div className="field">
          <span className="label">Immagine <span className="opt">(facoltativa)</span></span>
          <div className="row">
            {f.imageDataUrl ? <img src={f.imageDataUrl} alt="Anteprima" width={64} height={64} style={{ borderRadius: 16, objectFit: 'cover' }} /> : null}
            <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
              <ImagePlus size={18} aria-hidden="true" /> {f.imageDataUrl ? 'Cambia' : 'Scegli immagine'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
            </label>
            {f.imageDataUrl && <button type="button" className="icon-btn" aria-label="Rimuovi immagine" onClick={() => setF({ ...f, imageDataUrl: null })}><X /></button>}
          </div>
          {errors.imageDataUrl && <span className="error-text" role="alert">{errors.imageDataUrl}</span>}
        </div>
        <Button type="submit" variant="primary" block loading={busy}>Crea il club</Button>
      </form>
    </div>
  );
}

export function ClubDetail() {
  const { id = '' } = useParams();
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data: club, error, loading, reload } = useAsync(() => backend.getClub(id), [id, me?.id]);
  const [leave, setLeave] = useState(false);

  if (loading && !club) return <div className="page"><ListSkeleton rows={3} /></div>;
  if (error || !club) return <div className="page"><Link to="/club" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Club</Link><ErrorState message={error?.code === 'not_found' ? 'Club non trovato. Serve un link o un codice d\'invito valido.' : (error?.message ?? 'Errore')} onRetry={reload} /></div>;

  const inviteUrl = `${window.location.origin}/invito/${club.inviteCode}`;
  const text = `Entra nel club "${club.name}" su RUNNGO!`;

  return (
    <div className="page">
      <Link to="/club" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Club</Link>
      <header className="row" style={{ alignItems: 'center' }}>
        <ClubImage club={club} size={72} />
        <div className="grow">
          <h1 className="display h1">{club.name}</h1>
          <p className="muted small">{club.memberCount} {club.memberCount === 1 ? 'membro' : 'membri'}{club.area ? ` · ${club.area}` : ''} <DemoChip id={club.id} /></p>
        </div>
      </header>
      {club.description && <p className="muted">{club.description}</p>}

      <section className="card hero" aria-labelledby="inv">
        <h2 className="section-title" id="inv">Invita i compagni</h2>
        <div className="code-box" aria-label={`Codice d'invito ${club.inviteCode}`}>{club.inviteCode}</div>
        <div className="row wrap">
          <Button variant="primary" className="grow" onClick={async () => {
            const r = await shareLink({ title: club.name, text, url: inviteUrl });
            if (r === 'copied') toast('ok', 'Link d\'invito copiato');
            if (r === 'failed') toast('err', 'Copia non riuscita: dai il codice a voce.');
          }}>Condividi invito</Button>
          <Button variant="outline" onClick={async () => toast((await copyText(club.inviteCode)) ? 'ok' : 'err', 'Codice copiato')}>Copia codice</Button>
          <a className="btn btn-outline" href={whatsappUrl(text, inviteUrl)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
      </section>

      <section className="stack" aria-labelledby="ce">
        <div className="row between">
          <h2 className="section-title" id="ce">Uscite del club</h2>
          <Link to={`/uscita/nuova?club=${club.id}`} className="btn btn-primary btn-sm"><Plus size={16} aria-hidden="true" /> Organizza</Link>
        </div>
        {club.upcomingEvents.length ? club.upcomingEvents.map((e) => <EventCard key={e.id} event={e} />) : (
          <EmptyState icon={<Users />} title="Nessuna uscita in programma" text="Organizza la prima corsa del club: i membri la vedranno subito." />
        )}
      </section>

      <Leaderboard clubId={club.id} />

      <section className="card" aria-labelledby="mem">
        <h2 className="section-title" id="mem">Membri</h2>
        <ul className="member-list">
          {(club.members ?? []).map((m) => (
            <li key={m.id}>
              <Avatar user={m} />
              <span className="grow">{m.displayName}{m.id === me?.id ? ' (tu)' : ''}</span>
              {m.role === 'owner' && <span className="chip accent">Fondatore</span>}
            </li>
          ))}
        </ul>
      </section>

      <Button variant="danger" onClick={() => setLeave(true)}>Esci dal club</Button>
      {leave && (
        <ConfirmSheet title="Uscire dal club?" danger confirmLabel="Esci dal club" onClose={() => setLeave(false)} onConfirm={async () => {
          try {
            await backend.leaveClub(club.id);
            toast('ok', 'Sei uscito dal club.');
            nav('/club', { replace: true });
          } catch (e) { toast('err', errText(e)); }
        }}>
          <p>Non vedrai più le uscite riservate e la classifica del club.{club.isOwner ? ' Come fondatore, la gestione passa al membro più anziano.' : ''} Potrai rientrare con il codice.</p>
          {club.memberCount === 1 && <p>Sei l'ultimo membro: il club verrà eliminato.</p>}
        </ConfirmSheet>
      )}
    </div>
  );
}

export function Leaderboard({ clubId }: { clubId: string }) {
  const { backend, me } = useSession();
  const [metric, setMetric] = useState<LeaderboardMetric>('distance');
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const since = period === 'week' ? startOfWeekIso(new Date(), deviceTimezone()) : '2000-01-01T00:00:00.000Z';
  const { data, error, loading, reload } = useAsync(() => backend.clubLeaderboard(clubId, metric, since), [clubId, metric, period]);
  return (
    <section className="card" id="classifica" aria-labelledby="lb">
      <div className="row"><Trophy size={20} className="accent" aria-hidden="true" /><h2 className="section-title" id="lb">Classifica</h2></div>
      <div className="seg" role="group" aria-label="Metrica">
        <button aria-pressed={metric === 'distance'} onClick={() => setMetric('distance')}>Km dichiarati</button>
        <button aria-pressed={metric === 'runs'} onClick={() => setMetric('runs')}>Uscite registrate</button>
      </div>
      <div className="seg" role="group" aria-label="Periodo">
        <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>Questa settimana</button>
        <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>Sempre</button>
      </div>
      {loading ? <ListSkeleton rows={1} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.rows.length ? (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.rows.map((r) => (
            <li key={r.user.id} className={`rank-row ${r.rank === 1 ? 'first' : ''} ${r.user.id === me?.id ? 'me' : ''}`}>
              <span className="rank-pos">{r.rank}</span>
              <Avatar user={r.user} size={36} />
              <span className="grow truncate">{r.user.displayName}</span>
              <span className="num" style={{ fontSize: '1.4rem' }}>{metric === 'distance' ? `${r.value.toLocaleString('it-IT')} km` : r.value}</span>
            </li>
          ))}
        </ol>
      ) : <p className="muted small">Nessuna attività registrata in questo periodo. Registra una corsa dal tuo profilo o dopo un'uscita.</p>}
      <p className="hint">{metric === 'distance' ? 'Somma delle distanze dichiarate dai membri' : 'Numero di corse registrate dai membri'}, non verificate. Chi nasconde le proprie attività non compare.</p>
    </section>
  );
}

export function JoinClub() {
  const { code = '' } = useParams();
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data: club, error, loading, reload } = useAsync(() => backend.clubByCode(code), [code, me?.id]);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="page"><ListSkeleton rows={2} /></div>;
  if (error || !club) return <div className="page"><Link to="/club" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Club</Link><ErrorState message={error?.message ?? 'Errore'} onRetry={reload} /></div>;

  return (
    <div className="page">
      <section className="card hero" style={{ alignItems: 'center', textAlign: 'center', marginTop: 'var(--s-8)' }}>
        <span className="chip accent">Sei stato invitato</span>
        <ClubImage club={club} size={88} />
        <h1 className="display h1">{club.name}</h1>
        {club.description && <p className="muted">{club.description}</p>}
        <p className="muted small">{club.memberCount} {club.memberCount === 1 ? 'membro' : 'membri'}{club.area ? ` · ${club.area}` : ''}</p>
        {club.isMember ? (
          <Link to={`/club/${club.id}`} className="btn btn-primary btn-block">Sei già nel club: aprilo</Link>
        ) : me ? (
          <Button variant="primary" block loading={busy} onClick={async () => {
            setBusy(true);
            try { await backend.joinClub(code); toast('ok', `Benvenuto in ${club.name}!`); nav(`/club/${club.id}`, { replace: true }); }
            catch (e) { toast('err', errText(e)); } finally { setBusy(false); }
          }}>Entra nel club</Button>
        ) : (
          <Link to={loginPath(`/invito/${code}`)} className="btn btn-primary btn-block">Accedi per entrare</Link>
        )}
      </section>
    </div>
  );
}
