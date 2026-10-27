import { ArrowLeft, CalendarClock, CheckCircle2, Copy, Gauge, Link2, Lock, MapPin, Pencil, Route, Share2, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { levelLabel } from '../../shared/sports.ts';
import type { EventView } from '../../shared/types.ts';
import { validateActivityInput } from '../../shared/validation.ts';
import { eventShareText, eventShareUrl, fmtDay, fmtKm, fmtTime, formatPace } from '../format.ts';
import { copyText, shareLink, whatsappUrl } from '../share.ts';
import { errText, loginPath, useSession } from '../session.tsx';
import { WeatherCard } from '../components/WeatherCard.tsx';
import { Avatar, Button, ConfirmSheet, DemoChip, ErrorState, Field, ListSkeleton, Sheet, useAsync, useToast } from '../ui.tsx';

const VIS_LABEL = { public: 'Pubblica', club: 'Solo club', private: 'Privata, con invito' } as const;

export function EventDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => backend.getEvent(id, token), [id, token, me?.id]);
  const [view, setView] = useState<EventView | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const e = view?.id === id ? view : data;

  async function run(fn: () => Promise<EventView>, okMsg: string) {
    setBusy(true);
    try {
      setView(await fn());
      toast('ok', okMsg);
    } catch (err) {
      toast('err', errText(err));
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !e) return <div className="page"><ListSkeleton rows={3} /></div>;
  if (error || !e)
    return (
      <div className="page">
        <Link to="/" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Home</Link>
        <ErrorState message={error?.code === 'not_found' ? 'Questa uscita non esiste o non è accessibile. Se è privata, serve il link completo.' : (error?.message ?? 'Errore')} onRetry={reload} />
      </div>
    );

  const shareUrl = eventShareUrl(e);
  const v = e.viewer;
  const cancelled = e.status === 'cancelled';

  return (
    <div className="page has-action">
      <div className="topbar">
        <button className="back-link" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} style={{ background: 'none', border: 0, cursor: 'pointer' }}>
          <ArrowLeft size={18} aria-hidden="true" /> Indietro
        </button>
        {v.isOrganizer && !cancelled && !e.isPast && (
          <Link to={`/uscita/${e.id}/modifica`} className="btn btn-outline btn-sm">
            <Pencil size={16} aria-hidden="true" /> Modifica
          </Link>
        )}
      </div>

      <header className="stack-sm">
        <div className="tags">
          {cancelled && <span className="chip danger">Annullata</span>}
          {!cancelled && e.isPast && <span className="chip">Già svolta</span>}
          <span className="chip">{VIS_LABEL[e.visibility]}</span>
          {e.club && <Link to={`/club/${e.club.id}`} className="chip accent">{e.club.name}</Link>}
          <DemoChip id={e.id} />
        </div>
        <h1 className="display h1" style={{ fontSize: 'var(--fs-3xl)' }}>{e.title}</h1>
        <div className="row" style={{ color: 'var(--text-2)' }}>
          <CalendarClock size={20} className="accent" aria-hidden="true" />
          <span className="first-up">{fmtDay(e.startsAt, e.timezone)}</span>
          <span>·</span>
          <strong style={{ color: 'var(--text)' }}>{fmtTime(e.startsAt, e.timezone)}</strong>
        </div>
      </header>

      {cancelled && <div className="banner err" role="alert">L'organizzatore ha annullato questa uscita.</div>}

      {e.restricted ? (
        <section className="card">
          <div className="row"><Lock className="accent" aria-hidden="true" /><h2 className="section-title">Riservata ai membri del club</h2></div>
          <p className="muted small">Luogo, note e partecipanti sono visibili solo a chi fa parte di {e.club?.name ?? 'questo club'}. Chiedi il codice d'invito a chi ti ha mandato il link.</p>
          <Link to="/club" className="btn btn-primary btn-block">Ho un codice d'invito</Link>
        </section>
      ) : (
        <section className="card" aria-label="Dettagli">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <MapPin size={20} className="accent" aria-hidden="true" style={{ marginTop: 2 }} />
            <div className="grow"><div className="label">Punto d'incontro</div><div>{e.meetingPlace}{e.area ? `, ${e.area}` : ''}</div></div>
          </div>
          {(e.distanceKm !== null || e.paceSecPerKm !== null) && (
            <div className="stats" style={{ gridTemplateColumns: `repeat(${Number(e.distanceKm !== null) + Number(e.paceSecPerKm !== null) + 1}, 1fr)` }}>
              {e.distanceKm !== null && <div className="stat"><span className="v"><Route size={14} aria-hidden="true" /> {fmtKm(e.distanceKm)}</span><span className="l">Distanza</span></div>}
              {e.paceSecPerKm !== null && <div className="stat"><span className="v"><Gauge size={14} aria-hidden="true" /> {formatPace(e.paceSecPerKm)}</span><span className="l">Ritmo indicativo</span></div>}
              <div className="stat"><span className="v" style={{ fontSize: '1.4rem' }}>{levelLabel(e.level)}</span><span className="l">Livello</span></div>
            </div>
          )}
          {e.distanceKm === null && e.paceSecPerKm === null && <div className="row small muted">Livello: <strong style={{ color: 'var(--text)' }}>{levelLabel(e.level)}</strong></div>}
          {e.notes && (
            <div><div className="label">Note dell'organizzatore</div><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</p></div>
          )}
        </section>
      )}

      {e.route && !e.restricted && (
        <Link to={`/percorso/${e.route.id}`} className="card card-link" aria-label={`Percorso: ${e.route.name}`}>
          <div className="row"><Route size={20} className="accent" aria-hidden="true" /><strong>Percorso: {e.route.name}</strong></div>
          <span className="muted small">{e.route.startName}{e.route.endName && e.route.endName !== e.route.startName ? ` → ${e.route.endName}` : ' (anello)'}{e.route.distanceKm !== null ? ` · ${fmtKm(e.route.distanceKm)}` : ''}</span>
        </Link>
      )}

      <WeatherCard e={e} />

      <section className="card" aria-labelledby="who">
        <div className="row between">
          <h2 className="section-title" id="who"><Users size={18} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Chi partecipa</h2>
          <span className="chip accent" aria-live="polite">
            {e.maxParticipants ? `${e.participantCount} / ${e.maxParticipants} posti` : `${e.participantCount} ${e.participantCount === 1 ? 'persona' : 'persone'}`}
          </span>
        </div>
        {e.spotsLeft !== null && !cancelled && !e.isPast && (
          <p className={`small ${e.isFull ? '' : 'muted'}`} style={e.isFull ? { color: 'var(--danger)' } : undefined}>
            {e.isFull ? 'Al completo.' : `${e.spotsLeft} ${e.spotsLeft === 1 ? 'posto disponibile' : 'posti disponibili'}.`}
          </p>
        )}
        {e.participants ? (
          <ul className="member-list">
            {e.participants.map((p) => (
              <li key={p.id}>
                <Avatar user={p} />
                <span className="grow">{p.displayName}</span>
                {p.id === e.organizer.id && <span className="chip accent">Organizza</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{me ? 'Entra nel club per vedere chi partecipa.' : 'Accedi per vedere i nomi di chi partecipa.'}</p>
        )}
        {!e.restricted && <p className="muted xs">Organizzata da {e.organizer.displayName}</p>}
      </section>

      {!cancelled && (
        <section className="card" aria-labelledby="share">
          <h2 className="section-title" id="share">Invita gli amici</h2>
          {e.visibility === 'private' && !v.isParticipant && !v.isOrganizer ? null : (
            <>
              <div className="row" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
                <Link2 size={18} aria-hidden="true" className="muted" style={{ flex: 'none' }} />
                <span className="truncate small grow" aria-label="Link dell'uscita">{shareUrl}</span>
              </div>
              <div className="row wrap">
                <Button variant="primary" className="grow" onClick={async () => {
                  const r = await shareLink({ title: e.title, text: eventShareText(e), url: shareUrl });
                  if (r === 'copied') toast('ok', 'Link copiato negli appunti');
                  if (r === 'failed') toast('err', 'Non riesco a copiare: seleziona il link e copialo a mano.');
                }}>
                  <Share2 size={18} aria-hidden="true" /> Condividi
                </Button>
                <Button variant="outline" onClick={async () => toast((await copyText(shareUrl)) ? 'ok' : 'err', (await copyText(shareUrl)) ? 'Link copiato' : 'Copia non riuscita')}>
                  <Copy size={18} aria-hidden="true" /> Copia
                </Button>
                <a className="btn btn-outline" href={whatsappUrl(eventShareText(e), shareUrl)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
              {e.visibility === 'private' && <p className="hint">Uscita privata: chi ha il link completo può vederla e iscriversi.</p>}
            </>
          )}
        </section>
      )}

      {v.canConfirmRun && (
        <section className="card hero">
          <h2 className="section-title">Ci sei stato?</h2>
          <p className="muted small">Registra la corsa nel tuo storico. Distanza e durata sono dichiarate da te e non verificate.</p>
          <Button variant="primary" onClick={() => setConfirmRun(true)}><CheckCircle2 size={18} aria-hidden="true" /> Registra la mia corsa</Button>
        </section>
      )}
      {v.hasConfirmedRun && <div className="banner info"><CheckCircle2 size={18} aria-hidden="true" /> Corsa registrata nel tuo storico.</div>}

      {v.isOrganizer && !cancelled && !e.isPast && (
        <Button variant="danger" onClick={() => setConfirmCancel(true)}><XCircle size={18} aria-hidden="true" /> Annulla l'uscita</Button>
      )}

      <div className="action-bar">
        <div>
          {v.isParticipant && !v.isOrganizer && !e.isPast && !cancelled ? (
            <>
              <div className="btn btn-block" style={{ background: 'var(--success-soft)', color: 'var(--success)', cursor: 'default', flex: 1 }} role="status"><CheckCircle2 size={18} aria-hidden="true" /> Partecipi</div>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmLeave(true)}>Non partecipo</Button>
            </>
          ) : v.joinBlock === 'login' ? (
            <Link to={loginPath(`/uscita/${e.id}${token ? `?t=${token}` : ''}`)} className="btn btn-primary btn-block">Accedi per partecipare</Link>
          ) : v.canJoin ? (
            <Button variant="primary" block loading={busy} onClick={() => run(() => backend.joinEvent(e.id, token), 'Ci sei! Iscrizione confermata.')}>Partecipo</Button>
          ) : (
            <Button block disabled>
              {{ full: 'Uscita al completo', cancelled: 'Uscita annullata', past: 'Uscita già iniziata', club_only: 'Riservata al club', organizer: 'Sei l\'organizzatore', login: '' }[v.joinBlock ?? 'organizer']}
            </Button>
          )}
        </div>
      </div>

      {confirmLeave && (
        <ConfirmSheet title="Non partecipi più?" confirmLabel="Sì, mi ritiro" onClose={() => setConfirmLeave(false)} onConfirm={async () => {
          await run(() => backend.leaveEvent(e.id), 'Ti sei ritirato dall\'uscita.');
          setConfirmLeave(false);
        }}>
          <p>Il tuo posto tornerà disponibile per gli altri. Potrai iscriverti di nuovo finché l'uscita non inizia.</p>
        </ConfirmSheet>
      )}
      {confirmCancel && (
        <ConfirmSheet title="Annullare l'uscita?" danger confirmLabel="Annulla l'uscita" onClose={() => setConfirmCancel(false)} onConfirm={async () => {
          await run(() => backend.cancelEvent(e.id), 'Uscita annullata. I partecipanti sono stati avvisati.');
          setConfirmCancel(false);
        }}>
          <p>I {e.participantCount - 1} partecipanti riceveranno una notifica. L'operazione non si può annullare.</p>
        </ConfirmSheet>
      )}
      {confirmRun && <ConfirmRunSheet e={e} onClose={() => setConfirmRun(false)} onDone={() => { setConfirmRun(false); toast('ok', 'Corsa registrata'); reload(); setView(null); }} />}
    </div>
  );
}

function ConfirmRunSheet({ e, onClose, onDone }: { e: EventView; onClose: () => void; onDone: () => void }) {
  const { backend } = useSession();
  const [km, setKm] = useState(e.distanceKm ? String(e.distanceKm).replace('.', ',') : '');
  const [min, setMin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save() {
    const distanceKm = km.trim() ? Number(km.replace(',', '.')) : null;
    const durationMin = min.trim() ? Number(min.replace(',', '.')) : null;
    const v = validateActivityInput({ date: e.startsAt, sport: e.sport, distanceKm: Number.isNaN(distanceKm) ? (undefined as never) : distanceKm, durationMin: Number.isNaN(durationMin) ? (undefined as never) : durationMin, note: '' }, new Date());
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try {
      await backend.confirmRun(e.id, { distanceKm, durationMin });
      onDone();
    } catch (err) {
      const f = (err as { fields?: Record<string, string> }).fields;
      if (f) setErrors(f);
      else toast('err', errText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Registra la corsa" onClose={onClose}>
      <p className="muted small">Inserisci quello che hai fatto davvero. Sono dati dichiarati da te.</p>
      <div className="form-grid">
        <Field label="Distanza (km)" htmlFor="ckm" error={errors.distanceKm} optional>
          <input id="ckm" className="input" inputMode="decimal" value={km} onChange={(x) => setKm(x.target.value)} aria-invalid={!!errors.distanceKm} />
        </Field>
        <Field label="Durata (min)" htmlFor="cmin" error={errors.durationMin} optional>
          <input id="cmin" className="input" inputMode="numeric" value={min} onChange={(x) => setMin(x.target.value)} aria-invalid={!!errors.durationMin} />
        </Field>
      </div>
      <Button variant="primary" block loading={busy} onClick={save}>Salva nello storico</Button>
    </Sheet>
  );
}
