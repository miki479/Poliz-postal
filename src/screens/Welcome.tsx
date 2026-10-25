import { CalendarPlus, Eye, EyeOff, Info, Share2, UserPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BRAND } from '../brand.ts';
import { SocialButtons } from '../components/SocialButtons.tsx';
import { errText, useSession } from '../session.tsx';
import { Button, Field, Logo, describedBy } from '../ui.tsx';

export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/benvenuto') ? raw : '/';
}

export function Welcome() {
  const { backend, mode, me, setMe } = useSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const invited = next.startsWith('/uscita') || next.startsWith('/invito') || next.startsWith('/sfida');
  const [tab, setTab] = useState<'login' | 'register'>(invited ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [regCode, setRegCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [target, setTarget] = useState<string | null>(null);

  if (me) return <Navigate to={target ?? next} replace />;
  const cfg = backend.auth.config;

  function done(user: typeof me, isNew: boolean) {
    setTarget(isNew ? `/profilo/inizia?next=${encodeURIComponent(next)}` : next);
    setMe(user);
  }

  function fail(err: unknown) {
    const fields = (err as { fields?: Record<string, string> }).fields;
    if (fields && Object.keys(fields).length) setErrors(fields);
    else setFormError(errText(err));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // niente richieste duplicate
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      if (tab === 'register') done(await backend.auth.register({ email, password, registrationCode: regCode }), true);
      else done(await backend.auth.login({ email, password }), false);
    } catch (err) {
      fail(err); // i campi restano compilati: l'utente corregge senza riscrivere
    } finally {
      setBusy(false);
    }
  }

  async function social(kind: 'google' | 'apple', token: string, name?: string) {
    setBusy(true);
    setFormError('');
    try {
      const r = kind === 'google' ? await backend.auth.google(token) : await backend.auth.apple(token, name);
      done(r.user, r.created);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo() {
    setBusy(true);
    try {
      done(await backend.auth.demoEnter!(), false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page no-nav welcome">
      <div className="stack" style={{ gap: 'var(--s-6)' }}>
        <Logo size={44} />
        <div className="stack-sm">
          <h1 className="display" style={{ fontSize: 'var(--fs-3xl)' }}>
            Corri <span className="accent">insieme</span>,<br />senza fatica a organizzarti
          </h1>
          <p className="muted">{invited ? 'Hai ricevuto un invito. Crea il tuo account o accedi per partecipare.' : BRAND.tagline}</p>
        </div>
        <ul className="stack-sm">
          {[
            [CalendarPlus, 'Organizza un\'uscita', 'Data, ora e punto d\'incontro in meno di un minuto.'],
            [Share2, 'Condividi un link', 'Gli amici vedono l\'uscita e si iscrivono con un tocco.'],
            [Users, 'Crea il club della tua palestra', 'Invita i compagni con un codice e correte insieme.'],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Users;
            return (
              <li key={t as string} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="chip accent" style={{ width: 36, height: 36, justifyContent: 'center', padding: 0, flex: 'none' }}>
                  <I size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>{t as string}</strong>
                  <br />
                  <span className="muted small">{d as string}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {mode === 'demo' ? (
        <section className="card" aria-labelledby="nobk">
          <div className="row">
            <Info className="accent" aria-hidden="true" />
            <h2 className="section-title" id="nobk">Backend non configurato</h2>
          </div>
          <p className="muted small">
            Non riesco a raggiungere il server di RUNNGO, quindi <strong>non è possibile creare un account né accedere</strong>. Chi gestisce l'app deve avviare il server (vedi README, sezione “Backend”).
          </p>
          <p className="muted small">Puoi comunque provare l'app in <strong>modalità demo</strong>: nessun account reale, dati solo su questo dispositivo, nulla viene condiviso.</p>
          {formError && <div className="banner err" role="alert">{formError}</div>}
          <Button variant="outline" block loading={busy} onClick={enterDemo}>Apri la demo</Button>
        </section>
      ) : (
        <form className="card" onSubmit={submit} noValidate aria-label={tab === 'login' ? 'Accedi' : 'Registrati'}>
          <div className="seg" role="group" aria-label="Accedi o registrati">
            <button type="button" aria-pressed={tab === 'login'} onClick={() => { setTab('login'); setErrors({}); setFormError(''); }}>Accedi</button>
            <button type="button" aria-pressed={tab === 'register'} onClick={() => { setTab('register'); setErrors({}); setFormError(''); }}>Registrati</button>
          </div>
          <Field label="Email" htmlFor="em" error={errors.email}>
            <input id="em" type="email" inputMode="email" className="input" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={describedBy('em', errors.email)} />
          </Field>
          <Field label="Password" htmlFor="pw" error={errors.password} hint={tab === 'register' ? 'Almeno 8 caratteri.' : undefined}>
            <div style={{ position: 'relative' }}>
              <input id="pw" type={showPw ? 'text' : 'password'} className="input" style={{ paddingRight: 52 }} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={describedBy('pw', errors.password, tab === 'register' ? 'x' : undefined)} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 0, top: 0 }} aria-label={showPw ? 'Nascondi password' : 'Mostra password'} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </Field>
          {tab === 'register' && cfg.registrationCodeRequired && (
            <Field label="Codice di registrazione" htmlFor="rc" error={errors.registrationCode} hint="Te lo ha dato chi gestisce il gruppo.">
              <input id="rc" className="input" value={regCode} onChange={(e) => setRegCode(e.target.value)} aria-invalid={!!errors.registrationCode} autoCapitalize="none" />
            </Field>
          )}
          {formError && <div className="banner err" role="alert">{formError}</div>}
          <Button type="submit" variant="primary" block loading={busy}>{tab === 'login' ? 'Accedi' : 'Crea account'}</Button>
          {tab === 'login' && (
            <Link to="/recupera-password" className="btn btn-ghost btn-block">Password dimenticata?</Link>
          )}
          <SocialButtons config={cfg} onGoogle={(t) => social('google', t)} onApple={(t, n) => social('apple', t, n)} onError={setFormError} />
          {tab === 'register' && <p className="hint">Ti chiediamo solo email e password. Nome, username e foto li scegli dopo, quando vuoi. La tua email non è mai visibile agli altri.</p>}
        </form>
      )}

      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <Link to="/privacy" className="btn btn-ghost btn-sm">Privacy</Link>
        <Link to="/esplora" className="btn btn-ghost">
          <UserPlus size={18} aria-hidden="true" /> Dai un'occhiata senza account
        </Link>
      </div>
    </div>
  );
}
