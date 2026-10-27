import { CalendarPlus, Crosshair, MapPinOff, Plus, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RoutesTab } from './Routes.tsx';
import { ENABLED_SPORTS, LEVELS } from '../../shared/sports.ts';
import { deviceTimezone, haversineKm } from '../../shared/time.ts';
import type { EventQuery, Level, SportId } from '../../shared/types.ts';
import { EventCard } from '../components/EventCard.tsx';
import { dayRange, type DayFilter } from '../format.ts';
import { loginPath, useSession } from '../session.tsx';
import { Button, EmptyState, ErrorState, ListSkeleton, Sheet, useAsync, useToast } from '../ui.tsx';

const DAYS: Array<[DayFilter, string]> = [['all', 'Tutte'], ['today', 'Oggi'], ['tomorrow', 'Domani'], ['weekend', 'Weekend'], ['week', '7 giorni']];
const LENGTHS: Array<[string, string, number | null, number | null]> = [['all', 'Ogni distanza', null, null], ['s', 'Fino a 5 km', null, 5], ['m', '5–10 km', 5, 10], ['l', 'Oltre 10 km', 10, null]];
const RADII = [5, 10, 25, 50];

export function Explore() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('t') === 'percorsi' ? 'percorsi' : 'uscite';
  return (
    <div className="page">
      <div className="seg" role="group" aria-label="Cosa cercare">
        <button aria-pressed={tab === 'uscite'} onClick={() => setSp({}, { replace: true })}>Uscite</button>
        <button aria-pressed={tab === 'percorsi'} onClick={() => setSp({ t: 'percorsi' }, { replace: true })}>Percorsi</button>
      </div>
      {tab === 'percorsi' ? <><header className="topbar"><h1 className="display h1">Percorsi</h1></header><RoutesTab /></> : <ExploreEvents />}
    </div>
  );
}

function ExploreEvents() {
  const { backend, me } = useSession();
  const toast = useToast();
  const [day, setDay] = useState<DayFilter>('all');
  const [sport, setSport] = useState<SportId | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [len, setLen] = useState('all');
  const [scope, setScope] = useState<'all' | 'clubs'>('all');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [askGeo, setAskGeo] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);

  const q = useMemo<EventQuery>(() => {
    const r = dayRange(day, new Date(), deviceTimezone());
    const l = LENGTHS.find((x) => x[0] === len)!;
    return { scope, sport, level, from: r.from, to: r.to, minKm: l[2], maxKm: l[3], areaText: query };
  }, [day, sport, level, len, scope, query]);

  const { data, error, loading, reload } = useAsync(() => backend.listEvents(q), [backend, JSON.stringify(q), me?.id]);

  const rows = useMemo(() => {
    let list = (data ?? []).map((e) => ({ e, km: pos && e.lat !== null && e.lng !== null ? haversineKm(pos, { lat: e.lat, lng: e.lng }) : null }));
    let hidden = 0;
    if (pos && radius) {
      const before = list.length;
      list = list.filter((x) => x.km !== null && x.km <= radius);
      hidden = before - list.length;
    }
    if (pos) list.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.e.startsAt.localeCompare(b.e.startsAt));
    return { list, hidden };
  }, [data, pos, radius]);

  function requestPosition() {
    setAskGeo(false);
    if (!('geolocation' in navigator)) { setGeoDenied(true); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setRadius(25); setGeoBusy(false); setGeoDenied(false); },
      () => { setGeoBusy(false); setGeoDenied(true); toast('err', 'Posizione non disponibile. Puoi cercare per città qui sotto.'); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }

  const filtersActive = day !== 'all' || sport || level || len !== 'all' || query || scope !== 'all' || radius;

  return (
    <>
      <header className="topbar">
        <h1 className="display h1">Esplora</h1>
        <Link to={me ? '/uscita/nuova' : loginPath('/uscita/nuova')} className="btn btn-primary btn-sm"><Plus size={18} aria-hidden="true" /> Crea uscita</Link>
      </header>

      <form className="row" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(text.trim()); }}>
        <div className="grow" style={{ position: 'relative' }}>
          <Search size={18} aria-hidden="true" className="muted" style={{ position: 'absolute', left: 14, top: 15 }} />
          <input className="input" style={{ paddingLeft: 42 }} type="search" enterKeyHint="search" placeholder="Cerca città o luogo (es. Forlì)" aria-label="Cerca per città o luogo" value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setQuery(''); }} />
        </div>
        <Button type="submit" variant="outline">Cerca</Button>
      </form>

      <section className="stack-sm" aria-label="Filtri">
        <div className="filter-row" role="group" aria-label="Giorno">
          {DAYS.map(([k, l]) => <button key={k} className="pill" aria-pressed={day === k} onClick={() => setDay(k)}>{l}</button>)}
        </div>
        <div className="filter-row" role="group" aria-label="Distanza del percorso">
          {LENGTHS.map(([k, l]) => <button key={k} className="pill" aria-pressed={len === k} onClick={() => setLen(k)}>{l}</button>)}
        </div>
        <div className="filter-row" role="group" aria-label="Livello e sport">
          {LEVELS.map((l) => <button key={l.id} className="pill" aria-pressed={level === l.id} onClick={() => setLevel(level === l.id ? null : l.id)}>{l.label}</button>)}
          {ENABLED_SPORTS.length > 1 && ENABLED_SPORTS.map((s) => <button key={s.id} className="pill" aria-pressed={sport === s.id} onClick={() => setSport(sport === s.id ? null : s.id)}>{s.label}</button>)}
          {me && <button className="pill" aria-pressed={scope === 'clubs'} onClick={() => setScope(scope === 'clubs' ? 'all' : 'clubs')}>I miei club</button>}
        </div>
      </section>

      <section className="card" aria-label="Vicino a te">
        {pos ? (
          <>
            <div className="row between">
              <span className="small"><Crosshair size={16} className="accent" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Ordinate per vicinanza</span>
              <button className="pill" onClick={() => { setPos(null); setRadius(null); }}>Disattiva</button>
            </div>
            <div className="filter-row" role="group" aria-label="Raggio">
              <button className="pill" aria-pressed={radius === null} onClick={() => setRadius(null)}>Nessun limite</button>
              {RADII.map((r) => <button key={r} className="pill" aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</button>)}
            </div>
            <p className="hint">La tua posizione resta sul dispositivo e non viene salvata. Le uscite senza posizione non vengono ordinate.</p>
          </>
        ) : (
          <>
            <p className="small"><strong>Uscite vicino a te</strong><br /><span className="muted">Ti chiediamo la posizione solo se tocchi il pulsante. In alternativa cerca per città qui sopra.</span></p>
            <Button variant="outline" loading={geoBusy} onClick={() => setAskGeo(true)}><Crosshair size={18} aria-hidden="true" /> Usa la mia posizione</Button>
            {geoDenied && <p className="hint">Posizione non attiva: nessun problema, usa la ricerca per città.</p>}
          </>
        )}
      </section>

      <section className="stack" aria-label="Risultati" aria-live="polite">
        {loading && !data ? <ListSkeleton /> : error ? <ErrorState message={error.message} onRetry={reload} /> : rows.list.length === 0 ? (
          filtersActive ? (
            <EmptyState icon={<SearchX />} title="Nessuna uscita trovata" text="Prova ad allargare i filtri oppure organizza tu un'uscita." action={<Button variant="outline" onClick={() => { setDay('all'); setSport(null); setLevel(null); setLen('all'); setScope('all'); setText(''); setQuery(''); setRadius(null); }}>Azzera i filtri</Button>} />
          ) : (
            <EmptyState icon={<CalendarPlus />} title="Ancora nessuna uscita" text="Non ci sono corse in programma. Organizza la prima e invita gli amici con un link." action={<Link to={me ? '/uscita/nuova' : loginPath('/uscita/nuova')} className="btn btn-primary">Organizza una corsa</Link>} />
          )
        ) : (
          <>
            <p className="muted small">{rows.list.length} {rows.list.length === 1 ? 'uscita' : 'uscite'}</p>
            {rows.list.map(({ e, km }) => <EventCard key={e.id} event={e} distanceFromMeKm={km} />)}
            {rows.hidden > 0 && <p className="hint"><MapPinOff size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> {rows.hidden} uscite senza posizione o fuori raggio non sono mostrate.</p>}
          </>
        )}
      </section>

      {askGeo && (
        <Sheet title="Usare la tua posizione?" onClose={() => setAskGeo(false)}>
          <p className="muted">La usiamo solo per ordinare le uscite dalla più vicina. Non la salviamo e non la mostriamo a nessuno. Il browser ti chiederà conferma.</p>
          <Button variant="primary" block onClick={requestPosition}>Continua</Button>
          <Button variant="ghost" block onClick={() => setAskGeo(false)}>No, cerco per città</Button>
        </Sheet>
      )}
    </>
  );
}
