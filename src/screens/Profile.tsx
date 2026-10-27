import { ArrowLeft, Bell, Bot, ChartNoAxesColumn, Dumbbell, ImagePlus, Link2, Route as RouteIcon, LogOut, MailCheck, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ENABLED_SPORTS, sportDef } from '../../shared/sports.ts';
import { utcToZoned, deviceTimezone, zonedToUtcIso } from '../../shared/time.ts';
import { HANDLE_RE } from '../../shared/validation.ts';
import { resizeToSquareDataUrl } from '../image.ts';
import type { AccountInfo } from '../backend/types.ts';
import type { Activity, PrivacySettings, ProfileView, SportId } from '../../shared/types.ts';
import { validateActivityInput, validateProfileInput } from '../../shared/validation.ts';
import { EventCard } from '../components/EventCard.tsx';
import { fmtDayShort, fmtKm } from '../format.ts';
import { errText, useSession } from '../session.tsx';
import { Avatar, Button, ConfirmSheet, EmptyState, ErrorState, Field, ListSkeleton, Sheet, Switch, useAsync, useToast } from '../ui.tsx';

export function Profile() {
  const { userId } = useParams();
  const { backend, me, mode, setMe, logout, unread } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => backend.getProfile(userId ?? null), [userId, me?.id]);
  const [sheet, setSheet] = useState<null | 'edit' | 'log' | 'delete' | 'logout' | 'password'>(null);

  if (loading && !data) return <div className="page"><ListSkeleton rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'Errore'} onRetry={reload} /></div>;
  const p: ProfileView = data;

  async function savePrivacy(next: PrivacySettings) {
    try {
      const updated = await backend.updateProfile({ displayName: p.user.displayName, username: p.user.username, avatar: me?.avatar ?? null, bio: p.user.bio, sports: p.user.sports, area: p.user.area, privacy: next });
      setMe(updated);
      reload();
    } catch (e) { toast('err', errText(e)); }
  }

  return (
    <div className="page">
      {!p.isSelf && <Link to={-1 as unknown as string} onClick={(e) => { e.preventDefault(); nav(-1); }} className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Indietro</Link>}
      <header className="card hero" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Avatar user={p.user} size={84} />
        <div>
          <h1 className="display h1">{p.user.displayName}</h1>
          <p className="muted small">@{p.user.username}</p>
          {p.user.area && <p className="muted small">{p.user.area}</p>}
        </div>
        {p.user.bio && <p className="muted">{p.user.bio}</p>}
        <div className="tags" style={{ justifyContent: 'center' }}>{p.user.sports.map((s) => <span key={s} className="chip accent">{sportDef(s).label}</span>)}</div>
        {p.isSelf && (
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <Button variant="outline" size="sm" onClick={() => setSheet('edit')}><Pencil size={16} aria-hidden="true" /> Modifica profilo</Button>
            <Link to="/notifiche" className="btn btn-outline btn-sm"><Bell size={16} aria-hidden="true" /> Notifiche{unread ? ` (${unread})` : ''}</Link>
          </div>
        )}
      </header>

      {p.isSelf && (
        <nav className="card" aria-label="Le tue sezioni" style={{ gap: 0, padding: 0 }}>
          {([['/profilo/statistiche', ChartNoAxesColumn, 'Statistiche e storico', 'Distanze, record, andamento'], ['/piano', Dumbbell, 'Piano di allenamento', 'Settimana, sessioni, forza'], ['/esplora?t=percorsi', RouteIcon, 'I miei percorsi', 'Salvati e condivisi'], ['/profilo/integrazioni', Link2, 'Collegamenti e import', 'Strava, GPX, Apple Salute'], ['/coach', Bot, 'Coach AI', 'Suggerimenti gratuiti, facoltativi']] as const).map(([to, I, t, d], i) => (
            <Link key={to} to={to} className="row" style={{ padding: 'var(--s-3) var(--s-4)', minHeight: 60, borderTop: i ? '1px solid var(--border)' : 0 }}>
              <I size={22} className="accent" aria-hidden="true" />
              <span className="grow"><strong>{t}</strong><br /><span className="muted xs">{d}</span></span>
            </Link>
          ))}
        </nav>
      )}

      {p.isSelf && me && !me.profileCompleted && (
        <Link to="/profilo/inizia" className="banner info">
          <span><strong>Completa il profilo:</strong> scegli nome, username e foto così gli amici ti riconoscono.</span>
        </Link>
      )}

      {p.stats ? (
        <section className="card" aria-label="Statistiche">
          <div className="stats">
            <div className="stat"><span className="v">{p.stats.completedRuns}</span><span className="l">Uscite registrate</span></div>
            <div className="stat"><span className="v">{p.stats.declaredDistanceKm.toLocaleString('it-IT')}</span><span className="l">Km dichiarati</span></div>
            <div className="stat"><span className="v">{p.stats.organizedCount}</span><span className="l">Organizzate</span></div>
          </div>
          <p className="hint">Dati registrati dall'utente, non verificati da app esterne.</p>
        </section>
      ) : !p.isSelf && <p className="muted small">Questo utente non mostra le statistiche.</p>}

      {p.clubs && p.clubs.length > 0 && (
        <section className="stack-sm"><h2 className="section-title">Club</h2>
          <div className="tags">{p.clubs.map((c) => <Link key={c.id} to={`/club/${c.id}`} className="chip accent" style={{ minHeight: 36 }}>{c.name}</Link>)}</div>
        </section>
      )}

      {p.upcoming && (
        <section className="stack"><h2 className="section-title">Prossime uscite</h2>
          {p.upcoming.length ? p.upcoming.map((e) => <EventCard key={e.id} event={e} />) : <EmptyState icon={<Plus />} title="Nessuna uscita" text={p.isSelf ? 'Non sei iscritto a nessuna uscita in programma.' : 'Nessuna uscita in programma.'} action={p.isSelf ? <Link to="/esplora" className="btn btn-outline">Esplora le uscite</Link> : undefined} />}
        </section>
      )}

      {p.isSelf && p.activities && (
        <section className="stack" aria-labelledby="hist">
          <div className="row between"><h2 className="section-title" id="hist">Storico attività</h2><Button size="sm" variant="outline" onClick={() => setSheet('log')}><Plus size={16} aria-hidden="true" /> Registra</Button></div>
          {p.activities.length ? (
            <ul className="card" style={{ gap: 0 }}>
              {p.activities.map((a) => <ActivityRow key={a.id} a={a} onDeleted={reload} />)}
            </ul>
          ) : <EmptyState icon={<Plus />} title="Storico vuoto" text="Registra una corsa dopo un'uscita o aggiungine una a mano. Distanza e durata sono dichiarate da te." action={<Button variant="primary" onClick={() => setSheet('log')}>Registra una corsa</Button>} />}
        </section>
      )}

      {p.isSelf && p.privacy && (
        <section className="card" aria-labelledby="priv">
          <div className="row"><Shield size={20} className="accent" aria-hidden="true" /><h2 className="section-title" id="priv">Privacy</h2></div>
          <p className="muted small">Scegli cosa possono vedere gli altri sul tuo profilo.</p>
          <Switch label="Mostra le mie statistiche" checked={p.privacy.showStats} onChange={(v) => savePrivacy({ ...p.privacy!, showStats: v })} />
          <Switch label="Mostra i miei club" checked={p.privacy.showClubs} onChange={(v) => savePrivacy({ ...p.privacy!, showClubs: v })} />
          <Switch label="Mostra le mie uscite future" checked={p.privacy.showUpcoming} onChange={(v) => savePrivacy({ ...p.privacy!, showUpcoming: v })} />
          <Switch label="Condividi le attività con i compagni di club" description="Feed e classifiche dei tuoi club." checked={p.privacy.shareActivity} onChange={(v) => savePrivacy({ ...p.privacy!, shareActivity: v })} />
          <p className="hint">Non pubblichiamo mai la tua email né la tua posizione.</p>
        </section>
      )}

      {p.isSelf && (
        <section className="card" aria-labelledby="acc">
          <h2 className="section-title" id="acc">Account</h2>
          {mode === 'server' && <AccountInfoBlock onPassword={() => setSheet('password')} />}
          <Link to="/privacy" className="btn btn-ghost">Privacy e dati</Link>
          <Button variant="outline" onClick={() => setSheet('logout')}><LogOut size={18} aria-hidden="true" /> Esci</Button>
          <Button variant="danger" onClick={() => setSheet('delete')}><Trash2 size={18} aria-hidden="true" /> Elimina account e dati</Button>
          {mode === 'demo' && <Button variant="ghost" onClick={() => { backend.auth.resetDemo?.(); window.location.assign('/'); }}>Azzera i dati demo</Button>}
        </section>
      )}

      {sheet === 'edit' && <EditProfile p={p} onClose={() => setSheet(null)} onSaved={(u) => { setMe(u); setSheet(null); toast('ok', 'Profilo aggiornato'); reload(); }} />}
      {sheet === 'log' && <LogActivity onClose={() => setSheet(null)} onSaved={() => { setSheet(null); toast('ok', 'Attività registrata'); reload(); }} />}
      {sheet === 'logout' && <ConfirmSheet title="Uscire?" confirmLabel="Esci" onClose={() => setSheet(null)} onConfirm={async () => { await logout(); nav('/benvenuto', { replace: true }); }}><p>Potrai rientrare quando vuoi.</p></ConfirmSheet>}
      {sheet === 'delete' && <DeleteAccount onClose={() => setSheet(null)} />}
      {sheet === 'password' && <ChangePassword onClose={() => setSheet(null)} />}
    </div>
  );
}

function ActivityRow({ a, onDeleted }: { a: Activity; onDeleted: () => void }) {
  const { backend } = useSession();
  const toast = useToast();
  return (
    <li className="rank-row" style={{ listStyle: 'none' }}>
      <span className="grow">
        <strong>{a.distanceKm ? fmtKm(a.distanceKm) : 'Corsa'}</strong>{a.durationMin ? <span className="muted"> · {a.durationMin} min</span> : null}<br />
        <span className="muted xs">{fmtDayShort(a.date, deviceTimezone())} · {a.source === 'event' ? 'da un\'uscita' : 'inserita a mano'}{a.note ? ` · ${a.note}` : ''}</span>
      </span>
      <button className="icon-btn" aria-label="Elimina attività" onClick={async () => { try { await backend.deleteActivity(a.id); onDeleted(); } catch (e) { toast('err', errText(e)); } }}><Trash2 size={18} /></button>
    </li>
  );
}

function EditProfile({ p, onClose, onSaved }: { p: ProfileView; onClose: () => void; onSaved: (u: Awaited<ReturnType<ReturnType<typeof useSession>['backend']['updateProfile']>>) => void }) {
  const { backend, me } = useSession();
  const [f, setF] = useState({ displayName: p.user.displayName, username: p.user.username, bio: p.user.bio, area: p.user.area, sports: p.user.sports, avatar: me?.avatar ?? null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'bad'>('idle');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const u = f.username.trim().toLowerCase();
    if (u === p.user.username) return setAvail('idle');
    if (!HANDLE_RE.test(u)) return setAvail('bad');
    setAvail('checking');
    const t = setTimeout(() => backend.auth.usernameAvailable(u).then((a) => setAvail(a ? 'ok' : 'taken'), () => setAvail('idle')), 350);
    return () => clearTimeout(t);
  }, [f.username, backend, p.user.username]);
  async function pick(file: File | undefined) {
    if (!file) return;
    try { setF((x) => ({ ...x, avatar: null })); const url = await resizeToSquareDataUrl(file, 96, 20_000); setF((x) => ({ ...x, avatar: url })); setErrors((x) => ({ ...x, avatar: '' })); }
    catch (e) { setErrors((x) => ({ ...x, avatar: errText(e) })); }
  }
  async function save() {
    if (busy) return;
    const v = validateProfileInput({ ...f, privacy: p.privacy! });
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try { onSaved(await backend.updateProfile(v.value)); }
    catch (e) { const fl = (e as { fields?: Record<string, string> }).fields; if (fl) setErrors(fl); else toast('err', errText(e)); }
    finally { setBusy(false); }
  }
  const uErr = errors.username || (avail === 'taken' ? 'Username già in uso.' : avail === 'bad' ? 'Usa 3–20 caratteri: minuscole, numeri, punto o trattino basso.' : '');
  return (
    <Sheet title="Modifica profilo" onClose={onClose}>
      <div className="row">
        <Avatar user={{ displayName: f.displayName || '?', hue: p.user.hue, avatar: f.avatar }} size={64} />
        <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}><ImagePlus size={16} aria-hidden="true" /> Foto<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} /></label>
        {f.avatar && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, avatar: null })}>Rimuovi</Button>}
      </div>
      {errors.avatar && <span className="error-text" role="alert">{errors.avatar}</span>}
      <Field label="Nome visualizzato" htmlFor="pn" error={errors.displayName}><input id="pn" className="input" maxLength={30} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} aria-invalid={!!errors.displayName} /></Field>
      <Field label="Username" htmlFor="pu" error={uErr} hint={avail === 'ok' ? 'Disponibile' : undefined}><input id="pu" className="input" maxLength={20} autoCapitalize="none" spellCheck={false} value={f.username} onChange={(e) => { setF({ ...f, username: e.target.value }); setErrors((x) => ({ ...x, username: '' })); }} aria-invalid={!!uErr} /></Field>
      <Field label="Descrizione" htmlFor="pb" optional error={errors.bio}><textarea id="pb" className="textarea" maxLength={160} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
      <Field label="Località generale" htmlFor="pa" optional><input id="pa" className="input" maxLength={60} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
      <div className="field"><span className="label">Sport che pratichi</span>
        <div className="row wrap">{ENABLED_SPORTS.map((s) => <button key={s.id} type="button" className="pill" aria-pressed={f.sports.includes(s.id)} onClick={() => setF({ ...f, sports: f.sports.includes(s.id) ? f.sports.filter((x: SportId) => x !== s.id) : [...f.sports, s.id] })}>{s.label}</button>)}</div>
      </div>
      <Button variant="primary" block loading={busy} disabled={avail === 'taken' || avail === 'bad'} onClick={save}>Salva</Button>
    </Sheet>
  );
}

function AccountInfoBlock({ onPassword }: { onPassword: () => void }) {
  const { backend } = useSession();
  const toast = useToast();
  const [acc, setAcc] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { backend.auth.account().then(setAcc, () => {}); }, [backend]);
  if (!acc) return null;
  return (
    <div className="stack-sm">
      <div className="small"><span className="muted">Email privata:</span> <strong>{acc.email}</strong></div>
      <div className="row wrap">
        {acc.emailVerified ? <span className="chip success"><MailCheck size={13} aria-hidden="true" /> Email verificata</span> : <span className="chip">Email non verificata</span>}
        {acc.google && <span className="chip">Google collegato</span>}
        {acc.apple && <span className="chip">Apple collegato</span>}
      </div>
      {!acc.emailVerified && acc.mailEnabled && (
        <Button size="sm" variant="outline" loading={busy} onClick={async () => { setBusy(true); try { await backend.auth.resendVerification(); toast('ok', 'Ti abbiamo inviato l\'email di verifica.'); } catch (e) { toast('err', errText(e)); } finally { setBusy(false); } }}>Invia di nuovo la verifica</Button>
      )}
      <Button size="sm" variant="outline" onClick={onPassword}>{acc.hasPassword ? 'Cambia password' : 'Imposta una password'}</Button>
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { backend } = useSession();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    setErrors({});
    try { await backend.auth.changePassword(cur, pw); toast('ok', 'Password aggiornata. Le altre sessioni sono state chiuse.'); onClose(); }
    catch (e) { const f = (e as { fields?: Record<string, string> }).fields; setErrors(f ?? { form: errText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Sheet title="Cambia password" onClose={onClose}>
      <Field label="Password attuale" htmlFor="cp0" error={errors.current} hint="Se hai solo l'accesso Google/Apple, lascia vuoto."><input id="cp0" type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="Nuova password" htmlFor="cp1" error={errors.password} hint="Almeno 8 caratteri."><input id="cp1" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      {errors.form && <div className="banner err" role="alert">{errors.form}</div>}
      <Button variant="primary" block loading={busy} onClick={save}>Salva</Button>
    </Sheet>
  );
}

export function LogActivity({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { backend } = useSession();
  const tz = deviceTimezone();
  const [date, setDate] = useState(utcToZoned(new Date().toISOString(), tz).date);
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save() {
    const n = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : null);
    const iso = zonedToUtcIso(date, '12:00', tz) ?? 'invalid';
    const clamp = iso > new Date().toISOString() ? new Date().toISOString() : iso; // oggi a mezzogiorno non è "futuro"
    const input = { date: clamp, sport: 'running' as SportId, distanceKm: n(km), durationMin: n(min), note };
    const v = validateActivityInput(input, new Date());
    if (!v.ok) return setErrors(v.errors);
    setBusy(true);
    try { await backend.logActivity(v.value); onSaved(); } catch (e) { toast('err', errText(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Registra una corsa" onClose={onClose}>
      <p className="muted small">Inserisci dati veri: sono dichiarati da te e non vengono verificati.</p>
      <Field label="Giorno" htmlFor="ad" error={errors.date}><input id="ad" type="date" className="input" max={utcToZoned(new Date().toISOString(), tz).date} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="form-grid">
        <Field label="Distanza (km)" htmlFor="ak" error={errors.distanceKm}><input id="ak" className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} aria-invalid={!!errors.distanceKm} /></Field>
        <Field label="Durata (min)" htmlFor="am" optional error={errors.durationMin}><input id="am" className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
      </div>
      <Field label="Nota" htmlFor="an" optional error={errors.note}><input id="an" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button variant="primary" block loading={busy} onClick={save}>Salva</Button>
    </Sheet>
  );
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { backend, mode, setMe } = useSession();
  const nav = useNavigate();
  const [acc, setAcc] = useState<AccountInfo | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (mode === 'server') backend.auth.account().then(setAcc, () => {}); }, [backend, mode]);
  const needsPassword = mode === 'server' && acc?.hasPassword !== false;
  return (
    <ConfirmSheet title="Eliminare l'account?" danger confirmLabel="Elimina definitivamente" onClose={onClose} onConfirm={async () => {
      try { await backend.auth.deleteAccount(needsPassword ? { password: pw } : { confirm: pw }); setMe(null); nav('/benvenuto', { replace: true }); } catch (e) { setErr(errText(e)); }
    }}>
      <p>Cancelliamo profilo, email, iscrizioni e attività registrate. Le uscite future che organizzi vengono annullate e i partecipanti avvisati. Non si può annullare.</p>
      {mode === 'server' && acc && (
        <Field label={needsPassword ? 'Conferma con la tua password' : 'Scrivi ELIMINA per confermare'} htmlFor="dpw" error={err}>
          <input id="dpw" type={needsPassword ? 'password' : 'text'} className="input" autoComplete={needsPassword ? 'current-password' : 'off'} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} />
        </Field>
      )}
      {mode === 'demo' && err && <p className="error-text">{err}</p>}
    </ConfirmSheet>
  );
}
