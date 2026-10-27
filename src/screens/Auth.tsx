import { ArrowLeft, CheckCircle2, ImagePlus, MailCheck, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ENABLED_SPORTS } from '../../shared/sports.ts';
import type { SportId } from '../../shared/types.ts';
import { HANDLE_RE } from '../../shared/validation.ts';
import { resizeToSquareDataUrl } from '../image.ts';
import { errText, useSession } from '../session.tsx';
import { Avatar, Button, Field, Logo, Spinner, describedBy } from '../ui.tsx';
import { safeNext } from './Welcome.tsx';

export function ForgotPassword() {
  const { backend } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const mailOff = !backend.auth.config.emailEnabled;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await backend.auth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page no-nav">
      <Link to="/benvenuto" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Accedi</Link>
      <Logo />
      <h1 className="display h1">Recupera la password</h1>
      {mailOff ? (
        <div className="banner err" role="alert">Il recupero via email non è attivo su questo server (invio email non configurato). Contatta chi gestisce il servizio.</div>
      ) : sent ? (
        <section className="card hero" role="status">
          <MailCheck className="accent" aria-hidden="true" />
          <h2 className="section-title">Controlla la posta</h2>
          <p className="muted">Se esiste un account con <strong>{email}</strong>, ti abbiamo inviato un link per scegliere una nuova password. Vale 1 ora e si usa una volta sola. Controlla anche lo spam.</p>
          <Button variant="outline" onClick={() => setSent(false)}>Usa un altro indirizzo</Button>
        </section>
      ) : (
        <form className="card" onSubmit={submit} noValidate>
          <p className="muted small">Inserisci l'email con cui ti sei registrato: ti mandiamo un link per reimpostare la password.</p>
          <Field label="Email" htmlFor="fe">
            <input id="fe" type="email" inputMode="email" className="input" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <div className="banner err" role="alert">{error}</div>}
          <Button type="submit" variant="primary" block loading={busy} disabled={!email.trim()}>Invia il link</Button>
        </form>
      )}
    </div>
  );
}

export function ResetPassword() {
  const { backend } = useSession();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setFieldErr('');
    if (pw.length < 8) return setFieldErr('La password deve avere almeno 8 caratteri.');
    if (pw !== pw2) return setFieldErr('Le due password non coincidono.');
    setBusy(true);
    try {
      await backend.auth.resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page no-nav">
      <Logo />
      <h1 className="display h1">Nuova password</h1>
      {!token ? (
        <div className="banner err" role="alert">Link incompleto. Richiedi un nuovo link dalla pagina “Password dimenticata?”.</div>
      ) : done ? (
        <section className="card hero" role="status">
          <CheckCircle2 className="accent" aria-hidden="true" />
          <h2 className="section-title">Password aggiornata</h2>
          <p className="muted">Per sicurezza abbiamo chiuso le sessioni aperte. Accedi con la nuova password.</p>
          <Button variant="primary" onClick={() => nav('/benvenuto', { replace: true })}>Vai all'accesso</Button>
        </section>
      ) : (
        <form className="card" onSubmit={submit} noValidate>
          <Field label="Nuova password" htmlFor="np" error={fieldErr} hint="Almeno 8 caratteri.">
            <input id="np" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!fieldErr} />
          </Field>
          <Field label="Ripeti la password" htmlFor="np2">
            <input id="np2" type="password" className="input" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          {error && (
            <div className="banner err" role="alert">
              {error} <Link to="/recupera-password" className="accent">Richiedi un nuovo link</Link>
            </div>
          )}
          <Button type="submit" variant="primary" block loading={busy}>Salva la password</Button>
        </form>
      )}
    </div>
  );
}

export function VerifyEmail() {
  const { backend } = useSession();
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // StrictMode: il token è monouso
    ran.current = true;
    backend.auth.verifyEmail(params.get('token') ?? '').then(
      () => setState('ok'),
      (e) => { setMsg(errText(e)); setState('err'); },
    );
  }, [backend, params]);
  return (
    <div className="page no-nav">
      <Logo />
      {state === 'loading' && <Spinner label="Verifica in corso" />}
      {state === 'ok' && (
        <section className="card hero" role="status">
          <CheckCircle2 className="accent" aria-hidden="true" />
          <h2 className="section-title">Email verificata</h2>
          <p className="muted">Grazie! Il tuo indirizzo è confermato.</p>
          <Link to="/" className="btn btn-primary">Vai all'app</Link>
        </section>
      )}
      {state === 'err' && (
        <section className="card" role="alert">
          <XCircle style={{ color: 'var(--danger)' }} aria-hidden="true" />
          <h2 className="section-title">Link non valido</h2>
          <p className="muted">{msg} Puoi richiedere una nuova email dal tuo profilo, nella sezione Account.</p>
          <Link to="/profilo" className="btn btn-outline">Apri il profilo</Link>
        </section>
      )}
    </div>
  );
}

/** Profilo iniziale: tutto facoltativo, si può completare più tardi. */
export function Onboarding() {
  const { backend, me, setMe } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [name, setName] = useState(me?.displayName ?? '');
  const [username, setUsername] = useState(me?.username ?? '');
  const [sport, setSport] = useState<SportId | null>('running');
  const [area, setArea] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'bad'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!me || u === me.username) return setAvail('idle');
    if (!HANDLE_RE.test(u)) return setAvail('bad');
    setAvail('checking');
    const t = setTimeout(() => {
      backend.auth.usernameAvailable(u).then((a) => setAvail(a ? 'ok' : 'taken'), () => setAvail('idle'));
    }, 350);
    return () => clearTimeout(t);
  }, [username, backend, me]);

  if (!me) return null;

  async function pickAvatar(f: File | undefined) {
    if (!f) return;
    try {
      setAvatar(await resizeToSquareDataUrl(f, 96, 20_000));
      setErrors((x) => ({ ...x, avatar: '' }));
    } catch (e) {
      setErrors((x) => ({ ...x, avatar: errText(e) }));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !me) return;
    setBusy(true);
    setErrors({});
    try {
      const updated = await backend.updateProfile({ displayName: name, username, avatar, bio: me.bio, sports: sport ? [sport] : [], area, privacy: me.privacy });
      setMe(updated);
      nav(next, { replace: true });
    } catch (err) {
      const f = (err as { fields?: Record<string, string> }).fields;
      if (f) setErrors(f);
      else setErrors({ form: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  const usernameHint = { idle: 'Lo vedranno gli amici: @' + (username || 'tuousername'), checking: 'Controllo…', ok: 'Disponibile', taken: '', bad: 'Usa 3–20 caratteri: lettere minuscole, numeri, punto o trattino basso.' }[avail];
  const usernameError = errors.username || (avail === 'taken' ? 'Username già in uso.' : '');

  return (
    <div className="page no-nav">
      <Logo />
      <div className="stack-sm">
        <h1 className="display h1">Benvenuto! Come ti chiami?</h1>
        <p className="muted">Bastano pochi dettagli. Tutto il resto è facoltativo e lo puoi cambiare quando vuoi.</p>
      </div>
      <form className="stack" style={{ gap: 'var(--s-5)' }} onSubmit={save} noValidate>
        <div className="row">
          <Avatar user={{ displayName: name || '?', hue: me.hue, avatar }} size={72} />
          <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
            <ImagePlus size={16} aria-hidden="true" /> {avatar ? 'Cambia foto' : 'Aggiungi foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickAvatar(f); }} />
          </label>
          {avatar && <Button variant="ghost" size="sm" onClick={() => setAvatar(null)}>Rimuovi</Button>}
        </div>
        {errors.avatar && <span className="error-text" role="alert">{errors.avatar}</span>}
        <Field label="Nome visualizzato" htmlFor="ob-n" error={errors.displayName}>
          <input id="ob-n" className="input" maxLength={30} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.displayName} aria-describedby={describedBy('ob-n', errors.displayName)} />
        </Field>
        <Field label="Username" htmlFor="ob-u" error={usernameError} hint={usernameHint}>
          <input id="ob-u" className="input" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => { setUsername(e.target.value); setErrors((x) => ({ ...x, username: '' })); }} aria-invalid={!!usernameError} aria-describedby={describedBy('ob-u', usernameError, 'x')} />
        </Field>
        <div className="field">
          <span className="label">Sport preferito <span className="opt">(facoltativo)</span></span>
          <div className="row wrap">
            {ENABLED_SPORTS.map((s) => <button key={s.id} type="button" className="pill" aria-pressed={sport === s.id} onClick={() => setSport(sport === s.id ? null : s.id)}>{s.label}</button>)}
          </div>
        </div>
        <Field label="Città o zona" htmlFor="ob-a" optional hint="Solo la zona generale, mai un indirizzo.">
          <input id="ob-a" className="input" maxLength={60} placeholder="Es. Forlì" value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        {errors.form && <div className="banner err" role="alert">{errors.form}</div>}
        <Button type="submit" variant="primary" block loading={busy} disabled={avail === 'taken' || avail === 'bad'}>Salva e continua</Button>
        <Button variant="ghost" block disabled={busy} onClick={() => nav(next, { replace: true })}>Completa più tardi</Button>
      </form>
    </div>
  );
}
