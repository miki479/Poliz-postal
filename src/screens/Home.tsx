import { Bell, CalendarPlus, ChevronRight, Footprints, Link2, Plus, Target, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { deviceTimezone, startOfWeekIso } from '../../shared/time.ts';
import type { FeedItem, HomeView } from '../../shared/types.ts';
import { EventCard } from '../components/EventCard.tsx';
import { FeedRow } from '../components/FeedRow.tsx';
import { shareLink } from '../share.ts';
import { loginPath, useSession } from '../session.tsx';
import { ChallengeCard, useChallenges } from './Challenges.tsx';
import { SessionRow } from './Training.tsx';
import { utcToZoned } from '../../shared/time.ts';
import { Avatar, Button, EmptyState, ErrorState, ListSkeleton, Logo, useAsync, useToast } from '../ui.tsx';
import { fmtKm } from '../format.ts';
import { Navigate } from 'react-router-dom';

export function Home() {
  const { me } = useSession();
  return me ? <HomeMember /> : <HomeGuest />;
}

function HomeGuest() {
  const { backend } = useSession();
  const { data, error, loading, reload } = useAsync(() => backend.listEvents({ scope: 'all' }), []);
  return (
    <div className="page">
      <div className="topbar">
        <Logo />
        <Link to={loginPath('/')} className="btn btn-primary btn-sm">
          Accedi
        </Link>
      </div>
      <section className="card hero">
        <h1 className="display h1">Trova qualcuno con cui correre</h1>
        <p className="muted">Guarda le prossime uscite. Per partecipare o organizzarne una ti basta un account gratuito.</p>
        <Link to={loginPath('/uscita/nuova')} className="btn btn-primary btn-block">
          <CalendarPlus size={20} aria-hidden="true" /> Organizza una corsa
        </Link>
      </section>
      <section className="stack" aria-labelledby="pub">
        <h2 className="section-title" id="pub">
          Prossime uscite pubbliche
        </h2>
        {loading ? <ListSkeleton /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.length ? data.slice(0, 6).map((e) => <EventCard key={e.id} event={e} />) : (
          <EmptyState icon={<CalendarPlus />} title="Nessuna uscita in programma" text="Sii il primo: organizza una corsa e invita gli amici con un link." />
        )}
      </section>
    </div>
  );
}

function HomeMember() {
  const { backend, me, unread } = useSession();
  const toast = useToast();
  const weekStart = startOfWeekIso(new Date(), deviceTimezone());
  const { data, error, loading, reload } = useAsync(() => backend.getHome(weekStart), [backend, me?.id]);
  if (!me) return <Navigate to="/benvenuto" replace />;

  const first = me.displayName.split(' ')[0];
  const fresh = data && data.stats.completedRuns === 0 && data.nextEvents.length === 0 && data.clubs.length === 0;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/profilo" className="row" aria-label="Vai al tuo profilo" style={{ minHeight: 48 }}>
          <Avatar user={me} size={44} />
          <span>
            <span className="muted small" style={{ display: 'block' }}>
              Bentornato
            </span>
            <span className="display h2">Ciao, {first}</span>
          </span>
        </Link>
        <Link to="/notifiche" className="icon-btn" aria-label={unread ? `Notifiche, ${unread} non lette` : 'Notifiche'}>
          <Bell />
          {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </header>

      {loading && <ListSkeleton rows={4} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && fresh && <FirstRun />}
      {data && !fresh && <Dashboard data={data} onCopyError={(m) => toast('err', m)} />}
    </div>
  );
}

function FirstRun() {
  const toast = useToast();
  return (
    <>
      <section className="card hero">
        <span className="chip accent" style={{ alignSelf: 'flex-start' }}>
          Inizia da qui
        </span>
        <h1 className="display h1">Organizza la tua prima corsa</h1>
        <p className="muted">Scegli giorno, ora e punto d'incontro. Poi condividi il link: gli amici si iscrivono con un tocco.</p>
        <Link to="/uscita/nuova" className="btn btn-primary btn-block">
          <CalendarPlus size={20} aria-hidden="true" /> Organizza una corsa
        </Link>
      </section>
      <section className="card">
        <h2 className="section-title">Porta anche i compagni</h2>
        <p className="muted small">Crea il club della tua palestra e invita tutti con un codice, oppure entra in un club con il codice che ti hanno dato.</p>
        <div className="stack-sm">
          <Link to="/club/nuovo" className="btn btn-outline btn-block">
            <Users size={18} aria-hidden="true" /> Crea un club
          </Link>
          <Link to="/club" className="btn btn-ghost btn-block">
            Ho un codice d'invito
          </Link>
          <Button
            variant="ghost"
            block
            onClick={async () => {
              const r = await shareLink({ title: 'PODISMO SOCIAL', text: 'Organizziamo le corse insieme su PODISMO SOCIAL', url: window.location.origin });
              if (r === 'copied') toast('ok', 'Link copiato');
              if (r === 'failed') toast('err', 'Non riesco a condividere: copia il link dalla barra del browser.');
            }}
          >
            <Link2 size={18} aria-hidden="true" /> Invita amici all'app
          </Button>
        </div>
      </section>
      <section aria-labelledby="pubx" className="stack">
        <h2 className="section-title" id="pubx">
          Intanto, guarda cosa c'è in zona
        </h2>
        <Link to="/esplora" className="btn btn-outline btn-block">
          Esplora le uscite <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}

function HomeTraining() {
  const { backend } = useSession();
  const today = utcToZoned(new Date().toISOString(), deviceTimezone()).date;
  const end = utcToZoned(new Date(Date.now() + 14 * 86_400_000).toISOString(), deviceTimezone()).date;
  const { data } = useAsync(() => backend.listSessions({ from: today, to: end }), []);
  const next = (data ?? []).filter((s) => (s.status === 'planned' || s.status === 'rescheduled') && s.kind !== 'rest')[0];
  return (
    <section className="stack" aria-labelledby="ht">
      <div className="row between">
        <h2 className="section-title" id="ht">Allenamento</h2>
        <Link to="/piano" className="small accent" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Apri il piano</Link>
      </div>
      {next ? <SessionRow s={next} /> : <Link to="/piano" className="card card-link"><strong>Pianifica i tuoi allenamenti</strong><span className="muted small">Settimana, corsa, forza e recupero: crea un piano guidato o aggiungi le sessioni a mano.</span></Link>}
    </section>
  );
}

function HomeChallenges() {
  const { data } = useChallenges();
  const active = (data ?? []).filter((c) => c.phase === 'running' || c.phase === 'upcoming').slice(0, 2);
  if (!active.length) return null;
  return (
    <section className="stack" aria-labelledby="hc">
      <div className="row between">
        <h2 className="section-title" id="hc">Sfide attive</h2>
        <Link to="/social" className="small accent" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Tutte</Link>
      </div>
      {active.map((c) => <ChallengeCard key={c.id} c={c} />)}
    </section>
  );
}

function Dashboard({ data, onCopyError }: { data: HomeView; onCopyError: (m: string) => void }) {
  void onCopyError;
  const { stats, weekly } = data;
  const firstClub = data.clubs[0];
  const challenges = [
    { id: 'run', label: 'Corri 2 volte questa settimana', value: weekly.completedRuns, goal: 2 },
    { id: 'org', label: 'Organizza un\'uscita', value: weekly.organized, goal: 1 },
    { id: 'join', label: 'Iscriviti a un\'uscita di qualcun altro', value: Math.max(0, weekly.joined - weekly.organized), goal: 1 },
  ];
  const others = [...data.clubEvents, ...data.nearbyPublic].filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i).slice(0, 5);

  return (
    <>
      <section className="card" aria-label="Il tuo riepilogo">
        <div className="stats">
          <div className="stat">
            <span className="v">{stats.completedRuns}</span>
            <span className="l">Uscite registrate</span>
          </div>
          <div className="stat">
            <span className="v">{stats.declaredDistanceKm.toLocaleString('it-IT')}</span>
            <span className="l">Km dichiarati</span>
          </div>
          <div className="stat">
            <span className="v">{stats.upcomingCount}</span>
            <span className="l">In programma</span>
          </div>
        </div>
        <p className="hint">Dati registrati da te: la distanza è dichiarata, non misurata.</p>
      </section>

      <section className="stack" aria-labelledby="next">
        <div className="row between">
          <h2 className="section-title" id="next">
            Prossime uscite
          </h2>
          {data.nextEvents.length > 0 && (
            <Link to="/esplora" className="small accent" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              Esplora
            </Link>
          )}
        </div>
        {data.nextEvents.length ? (
          data.nextEvents.map((e) => <EventCard key={e.id} event={e} />)
        ) : (
          <EmptyState icon={<Footprints />} title="Nessuna uscita in programma" text="Iscriviti a un'uscita qui sotto oppure organizzane una tu." />
        )}
        <Link to="/uscita/nuova" className="btn btn-primary btn-block">
          <Plus size={20} aria-hidden="true" /> Organizza una corsa
        </Link>
      </section>

      <HomeChallenges />

      <HomeTraining />

      {others.length > 0 && (
        <section className="stack" aria-labelledby="near">
          <h2 className="section-title" id="near">
            {data.clubEvents.length ? 'Dal tuo club e dintorni' : 'Uscite aperte a tutti'}
          </h2>
          {others.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </section>
      )}

      <section className="card" aria-labelledby="chal">
        <div className="row">
          <Target size={20} className="accent" aria-hidden="true" />
          <h2 className="section-title" id="chal">
            Sfide della settimana
          </h2>
        </div>
        {challenges.map((c) => {
          const pct = Math.min(100, Math.round((c.value / c.goal) * 100));
          return (
            <div key={c.id} className="stack-sm">
              <div className="row between small">
                <span>{c.label}</span>
                <span className="num" aria-label={`${Math.min(c.value, c.goal)} su ${c.goal}`}>
                  {Math.min(c.value, c.goal)}/{c.goal}
                </span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        <p className="hint">Calcolate sulle tue attività reali, da lunedì.</p>
      </section>

      {data.friendActivity.length > 0 && (
        <section className="stack" aria-labelledby="friends">
          <div className="row between">
            <h2 className="section-title" id="friends">
              Dai tuoi compagni
            </h2>
            <Link to="/social" className="small accent" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              Vedi tutto
            </Link>
          </div>
          {data.friendActivity.map((f: FeedItem) => (
            <FeedRow key={f.id} item={f} />
          ))}
        </section>
      )}

      <section aria-label="Classifica del club">
        {firstClub ? (
          <Link to={`/club/${firstClub.id}#classifica`} className="card card-link row">
            <Trophy className="accent" aria-hidden="true" />
            <span className="grow">
              <strong>Classifica di {firstClub.name}</strong>
              <br />
              <span className="muted small">{firstClub.memberCount} membri · metrica e periodo sempre indicati</span>
            </span>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <Link to="/club" className="card card-link row">
            <Users className="accent" aria-hidden="true" />
            <span className="grow">
              <strong>Entra in un club</strong>
              <br />
              <span className="muted small">Per vedere la classifica serve un club: crealo o entra con un codice.</span>
            </span>
            <ChevronRight aria-hidden="true" />
          </Link>
        )}
      </section>
    </>
  );
}
