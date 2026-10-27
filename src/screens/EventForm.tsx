import { ArrowLeft, Crosshair, Globe, Lock, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ENABLED_SPORTS, LEVELS } from '../../shared/sports.ts';
import { deviceTimezone, parsePace, utcToZoned, zonedToUtcIso } from '../../shared/time.ts';
import type { EventInput, EventView, Level, SportId, Visibility } from '../../shared/types.ts';
import { validateEventInput } from '../../shared/validation.ts';
import { fmtDay, fmtKm, fmtTime, formatPace } from '../format.ts';
import { errText, useSession } from '../session.tsx';
import { Button, ConfirmSheet, ErrorState, Field, ListSkeleton, describedBy, useAsync, useToast } from '../ui.tsx';

interface FormState {
  title: string;
  sport: SportId;
  date: string;
  time: string;
  meetingPlace: string;
  area: string;
  distance: string;
  pace: string;
  level: Level;
  notes: string;
  max: string;
  visibility: Visibility;
  clubId: string;
  lat: number | null;
  lng: number | null;
  routeId: string;
}

function plusDays(n: number, tz: string): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return utcToZoned(d.toISOString(), tz).date;
}

function numField(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function EventForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { backend } = useSession();
  const existing = useAsync(() => (mode === 'edit' ? backend.getEvent(id) : Promise.resolve(null)), [mode, id]);
  const clubs = useAsync(() => backend.listMyClubs(), []);
  const mine = useAsync(() => backend.listRoutes({ scope: 'mine' }), []);
  const saved = useAsync(() => backend.listRoutes({ scope: 'saved' }), []);
  const preset = params.get('route');
  const fromId = params.get('from');
  const fromSession = useAsync(() => (fromId ? backend.getSession(fromId).catch(() => null) : Promise.resolve(null)), [fromId]);
  const presetRoute = useAsync(() => (preset ? backend.getRoute(preset).catch(() => null) : Promise.resolve(null)), [preset]);

  if (existing.loading || clubs.loading || mine.loading || saved.loading || presetRoute.loading || fromSession.loading) return <div className="page no-nav"><ListSkeleton rows={4} /></div>;
  if (existing.error || clubs.error) return <div className="page no-nav"><ErrorState message={(existing.error ?? clubs.error)!.message} onRetry={() => { existing.reload(); clubs.reload(); }} /></div>;
  if (mode === 'edit' && existing.data && !existing.data.viewer.isOrganizer)
    return <div className="page no-nav"><ErrorState message="Solo chi ha organizzato l'uscita può modificarla." /></div>;
  const routeOpts = new Map<string, { id: string; name: string; distanceKm: number | null; area: string; startName: string }>();
  for (const r of [...(mine.data ?? []), ...(saved.data ?? []), ...(presetRoute.data ? [presetRoute.data] : [])]) routeOpts.set(r.id, { id: r.id, name: r.name, distanceKm: r.distanceKm, area: r.area, startName: r.startName });
  const er = existing.data?.route;
  if (er && !routeOpts.has(er.id)) routeOpts.set(er.id, { id: er.id, name: er.name, distanceKm: er.distanceKm, area: '', startName: er.startName });
  return <Inner mode={mode} event={existing.data} clubs={(clubs.data ?? []).map((c) => ({ id: c.id, name: c.name }))} presetClub={params.get('club')} routes={[...routeOpts.values()]} presetRoute={presetRoute.data ? presetRoute.data.id : null} fromSession={fromSession.data} />;
}

type RouteOpt = { id: string; name: string; distanceKm: number | null; area: string; startName: string };

function Inner({ mode, event, clubs, presetClub, routes, presetRoute, fromSession }: { mode: 'new' | 'edit'; event: EventView | null; clubs: Array<{ id: string; name: string }>; presetClub: string | null; routes: RouteOpt[]; presetRoute: string | null; fromSession: import('../../shared/types.ts').PlannedSession | null }) {
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const tz = event?.timezone ?? deviceTimezone();
  const initial = useMemo<FormState>(() => {
    if (event) {
      const z = utcToZoned(event.startsAt, tz);
      return {
        title: event.title, sport: event.sport, date: z.date, time: z.time, meetingPlace: event.meetingPlace, area: event.area,
        distance: event.distanceKm === null ? '' : String(event.distanceKm).replace('.', ','),
        pace: event.paceSecPerKm === null ? '' : formatPace(event.paceSecPerKm).replace('/km', ''),
        level: event.level, notes: event.notes, max: event.maxParticipants === null ? '' : String(event.maxParticipants),
        visibility: event.visibility, clubId: event.clubId ?? '', lat: event.lat, lng: event.lng, routeId: event.routeId ?? '',
      };
    }
    const preset = presetClub && clubs.some((c) => c.id === presetClub);
    const pr = presetRoute ? routes.find((r) => r.id === presetRoute) : undefined;
    const fs = fromSession && mode === 'new' ? fromSession : null;
    return {
      title: fs?.title ?? '', sport: 'running', date: fs?.date ?? plusDays(1, tz), time: fs?.time ?? '18:30', meetingPlace: pr?.startName ?? '', area: pr?.area ?? '',
      distance: fs?.distanceKm ? String(fs.distanceKm).replace('.', ',') : pr?.distanceKm ? String(pr.distanceKm).replace('.', ',') : '', pace: '', level: 'medium', notes: '', max: '',
      // Un'uscita nata da una sessione personale parte PRIVATA: il piano non diventa pubblico senza una tua scelta.
      visibility: fs ? 'private' : preset ? 'club' : 'public', clubId: preset ? presetClub! : '', lat: null, lng: null, routeId: pr?.id ?? '',
    };
  }, [event, tz, clubs, presetClub, routes, presetRoute, fromSession, mode]);

  const [f, setF] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((s) => ({ ...s, [k]: v })); setServerErrors((e) => ({ ...e, [k]: '' })); };

  const built = useMemo(() => {
    const startsAt = zonedToUtcIso(f.date, f.time, tz);
    const pace = f.pace.trim() ? (parsePace(f.pace) ?? NaN) : null;
    const input: EventInput = {
      title: f.title, sport: f.sport, startsAt: startsAt ?? 'invalid', timezone: tz, meetingPlace: f.meetingPlace, area: f.area, lat: f.lat, lng: f.lng,
      distanceKm: numField(f.distance), paceSecPerKm: pace, level: f.level, notes: f.notes, maxParticipants: numField(f.max),
      visibility: f.visibility, clubId: f.visibility === 'club' || f.clubId ? f.clubId || null : null, routeId: f.routeId || null,
      // Il patto di corsa si sceglie nell'app: modificando dal web resta quello salvato (anche le modalità nuove).
      pact: event?.pact ?? null,
    };
    const v = validateEventInput(input, new Date());
    return { input, errors: v.ok ? {} : v.errors, startsAt };
  }, [f, tz, event]);

  const err = (k: string) => (submitted ? built.errors[k] : '') || serverErrors[k] || '';
  const hasChanges = JSON.stringify(f) !== JSON.stringify(initial);

  useEffect(() => {
    if (!hasChanges) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [hasChanges]);

  function review() {
    setSubmitted(true);
    if (Object.keys(built.errors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setConfirm(true);
  }

  async function publish() {
    try {
      const saved = mode === 'new' ? await backend.createEvent(built.input) : await backend.updateEvent(event!.id, built.input, event!.version);
      if (fromSession && mode === 'new') await backend.linkSessionEvent(fromSession.id, saved.id).catch(() => undefined);
      toast('ok', mode === 'new' ? 'Uscita pubblicata! Ora condividi il link.' : 'Modifiche salvate.');
      nav(`/uscita/${saved.id}`, { replace: true });
    } catch (e) {
      setConfirm(false);
      const fields = (e as { fields?: Record<string, string> }).fields;
      if (fields) { setServerErrors(fields); setSubmitted(true); }
      toast('err', errText(e));
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) return toast('err', 'Il tuo dispositivo non supporta la posizione.');
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((s) => ({ ...s, lat: p.coords.latitude, lng: p.coords.longitude })); setGeoBusy(false); toast('ok', 'Posizione approssimata aggiunta.'); },
      (e) => { setGeoBusy(false); toast('err', e.code === 1 ? 'Permesso negato: puoi comunque indicare la località a mano.' : 'Posizione non disponibile. Indica la località a mano.'); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const importantChange = mode === 'edit' && event && (built.startsAt !== event.startsAt || f.meetingPlace.trim() !== event.meetingPlace || f.area.trim() !== event.area) && event.participantCount > 1;
  const showDemoNote = false;
  void showDemoNote;

  return (
    <div className="page no-nav has-action">
      <div className="topbar">
        <Link to={mode === 'edit' && event ? `/uscita/${event.id}` : '/'} className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      </div>
      <h1 className="display h1">{mode === 'new' ? 'Organizza una corsa' : 'Modifica uscita'}</h1>
      {fromSession && mode === 'new' && <div className="banner info">Uscita creata dalla tua sessione “{fromSession.title}”. Per impostazione predefinita è <strong>privata</strong>: la vedono solo gli amici a cui mandi il link. Il tuo piano non viene condiviso.</div>}

      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); review(); }} aria-label="Dati dell'uscita" style={{ gap: 'var(--s-5)' }}>
        <Field label="Titolo" htmlFor="title" error={err('title')}>
          <input id="title" className="input" value={f.title} maxLength={80} placeholder="Es. Corsa dopo lavoro" onChange={(e) => set('title', e.target.value)} aria-invalid={!!err('title')} aria-describedby={describedBy('title', err('title'))} />
        </Field>

        <Field label="Sport" htmlFor="sport" error={err('sport')}>
          <select id="sport" className="select" value={f.sport} onChange={(e) => set('sport', e.target.value as SportId)}>
            {ENABLED_SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>

        <div className="form-grid">
          <Field label="Data" htmlFor="date" error={err('startsAt')}>
            <input id="date" type="date" className="input" value={f.date} min={plusDays(0, tz)} onChange={(e) => set('date', e.target.value)} aria-invalid={!!err('startsAt')} aria-describedby={describedBy('date', err('startsAt'))} />
          </Field>
          <Field label="Ora" htmlFor="time">
            <input id="time" type="time" className="input" value={f.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: -12 }}>Orario nel fuso {tz.replace('_', ' ')}.</p>

        <Field label="Luogo di ritrovo" htmlFor="place" error={err('meetingPlace')} hint="Indica un punto pubblico, per esempio l'ingresso della palestra.">
          <input id="place" className="input" value={f.meetingPlace} maxLength={120} placeholder="Es. Parcheggio della palestra, via Roma" onChange={(e) => set('meetingPlace', e.target.value)} aria-invalid={!!err('meetingPlace')} aria-describedby={describedBy('place', err('meetingPlace'), 'x')} />
        </Field>
        <Field label="Città o zona" htmlFor="area" optional error={err('area')}>
          <input id="area" className="input" value={f.area} maxLength={60} placeholder="Es. Forlì" onChange={(e) => set('area', e.target.value)} />
        </Field>

        <div className="stack-sm">
          {f.lat !== null ? (
            <div className="row between card" style={{ flexDirection: 'row', padding: 'var(--s-3) var(--s-4)' }}>
              <span className="small"><Crosshair size={16} className="accent" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Posizione approssimata (~100 m) aggiunta: serve a ordinare le uscite per vicinanza.</span>
              <button type="button" className="icon-btn" aria-label="Rimuovi la posizione" onClick={() => setF((s) => ({ ...s, lat: null, lng: null }))}><X size={18} /></button>
            </div>
          ) : (
            <Button variant="outline" loading={geoBusy} onClick={locate}><Crosshair size={18} aria-hidden="true" /> Aggiungi la posizione del ritrovo</Button>
          )}
          <p className="hint">Facoltativo. Usiamo la posizione solo ora, una volta, e la salviamo arrotondata come punto di ritrovo. Se non la aggiungi, l'uscita si trova comunque per città.</p>
        </div>

        <div className="form-grid">
          <Field label="Distanza (km)" htmlFor="dist" optional error={err('distanceKm')}>
            <input id="dist" className="input" inputMode="decimal" placeholder="8" value={f.distance} onChange={(e) => set('distance', e.target.value)} aria-invalid={!!err('distanceKm')} aria-describedby={describedBy('dist', err('distanceKm'))} />
          </Field>
          <Field label="Ritmo (min/km)" htmlFor="pace" optional error={err('paceSecPerKm')}>
            <input id="pace" className="input" inputMode="numeric" placeholder="5:30" value={f.pace} onChange={(e) => set('pace', e.target.value)} aria-invalid={!!err('paceSecPerKm')} aria-describedby={describedBy('pace', err('paceSecPerKm'))} />
          </Field>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
          <legend className="label" style={{ marginBottom: 6 }}>Livello</legend>
          <div className="row wrap" role="radiogroup" aria-label="Livello">
            {LEVELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={f.level === l.id} className="pill" style={f.level === l.id ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent-2)' } : undefined} onClick={() => set('level', l.id)}>{l.label}</button>
            ))}
          </div>
          <span className="hint">{LEVELS.find((l) => l.id === f.level)?.hint}</span>
        </fieldset>

        <Field label="Numero massimo di partecipanti" htmlFor="max" optional error={err('maxParticipants')} hint="Lascia vuoto per nessun limite.">
          <input id="max" className="input" inputMode="numeric" placeholder="Es. 10" value={f.max} onChange={(e) => set('max', e.target.value)} aria-invalid={!!err('maxParticipants')} aria-describedby={describedBy('max', err('maxParticipants'), 'x')} />
        </Field>

        <Field label="Note" htmlFor="notes" optional error={err('notes')}>
          <textarea id="notes" className="textarea" maxLength={600} placeholder="Percorso, cosa portare, dove si parcheggia…" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
          <legend className="label" style={{ marginBottom: 6 }}>Chi può vederla</legend>
          {([
            ['public', 'Pubblica', 'Compare in Esplora per tutti.', Globe],
            ['club', 'Solo club', 'Visibile ai membri del club scelto.', Users],
            ['private', 'Privata, tramite invito', 'La vede solo chi riceve il tuo link.', Lock],
          ] as const).map(([v, t, d, I]) => (
            <button key={v} type="button" role="radio" aria-checked={f.visibility === v} className="choice" onClick={() => set('visibility', v)}>
              <I size={20} aria-hidden="true" className={f.visibility === v ? 'accent' : 'muted'} style={{ marginTop: 2, flex: 'none' }} />
              <span><span className="t">{t}</span><br /><span className="muted small">{d}</span></span>
            </button>
          ))}
          {err('visibility') && <span className="error-text" role="alert">{err('visibility')}</span>}
        </fieldset>

        {routes.length > 0 && (
          <Field label="Percorso" htmlFor="route" optional hint="Scegli tra i tuoi percorsi e quelli salvati.">
            <select id="route" className="select" value={f.routeId} onChange={(e) => {
              const r = routes.find((x) => x.id === e.target.value);
              setF((s) => ({ ...s, routeId: e.target.value, distance: r?.distanceKm && !s.distance ? String(r.distanceKm).replace('.', ',') : s.distance, area: r?.area && !s.area ? r.area : s.area, meetingPlace: r && !s.meetingPlace ? r.startName : s.meetingPlace }));
            }}>
              <option value="">Nessun percorso</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.distanceKm ? ` · ${String(r.distanceKm).replace('.', ',')} km` : ''}</option>)}
            </select>
          </Field>
        )}

        {(f.visibility === 'club' || clubs.length > 0) && (
          <Field label="Club" htmlFor="club" optional={f.visibility !== 'club'} error={err('clubId')} hint={clubs.length === 0 ? 'Non fai ancora parte di nessun club.' : undefined}>
            <select id="club" className="select" value={f.clubId} onChange={(e) => set('clubId', e.target.value)} aria-invalid={!!err('clubId')} aria-describedby={describedBy('club', err('clubId'), clubs.length === 0 ? 'x' : undefined)}>
              <option value="">{f.visibility === 'club' ? 'Scegli un club…' : 'Nessun club'}</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {f.visibility === 'club' && clubs.length === 0 && <Link to="/club/nuovo" className="btn btn-outline">Crea un club</Link>}
      </form>

      <div className="action-bar">
        <div>
          <Button variant="primary" block onClick={review}>{mode === 'new' ? 'Controlla e pubblica' : 'Controlla e salva'}</Button>
        </div>
      </div>

      {confirm && (
        <ConfirmSheet title={mode === 'new' ? 'Pubblicare l\'uscita?' : 'Salvare le modifiche?'} confirmLabel={mode === 'new' ? 'Pubblica' : 'Salva'} onClose={() => setConfirm(false)} onConfirm={publish}>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <strong style={{ color: 'var(--text)' }}>{built.input.title}</strong>
            <span className="first-up">{fmtDay(built.startsAt!, tz)}, ore {fmtTime(built.startsAt!, tz)}</span>
            <span>{built.input.meetingPlace}{built.input.area ? `, ${built.input.area}` : ''}</span>
            <span>
              {[built.input.distanceKm ? fmtKm(built.input.distanceKm) : null, built.input.paceSecPerKm ? formatPace(built.input.paceSecPerKm) : null, LEVELS.find((l) => l.id === built.input.level)?.label, built.input.maxParticipants ? `max ${built.input.maxParticipants} persone` : 'senza limite'].filter(Boolean).join(' · ')}
            </span>
            <span>{{ public: 'Pubblica', club: `Solo club: ${clubs.find((c) => c.id === built.input.clubId)?.name ?? ''}`, private: 'Privata, solo con il link' }[built.input.visibility]}</span>
          </div>
          {importantChange && <p>Cambiano data, ora o luogo: i partecipanti riceveranno una notifica.</p>}
        </ConfirmSheet>
      )}
    </div>
  );
}
