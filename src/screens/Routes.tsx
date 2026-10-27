import { ArrowLeft, Copy, Heart, Lock, MapPin, Pencil, Route as RouteIcon, Search, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { LatLng, RouteInput, RouteView, RouteVisibility } from '../../shared/types.ts';
import { MapView } from '../components/MapView.tsx';
import { fmtKm } from '../format.ts';
import { copyText, shareLink, whatsappUrl } from '../share.ts';
import { errText, loginPath, useSession } from '../session.tsx';
import { Button, ConfirmSheet, EmptyState, ErrorState, Field, ListSkeleton, describedBy, useAsync, useToast } from '../ui.tsx';

export const routeLink = (r: Pick<RouteView, 'id' | 'visibility' | 'shareToken'>) => `${window.location.origin}/percorso/${r.id}${r.visibility === 'link' && r.shareToken ? `?t=${r.shareToken}` : ''}`;

const VIS: Array<[RouteVisibility, string, string]> = [
  ['private', 'Privato', 'Solo tu.'],
  ['link', 'Con link', 'Chi ha il link può vederlo e salvarlo.'],
  ['public', 'Pubblico', 'Compare in Esplora per tutti.'],
];

export function RouteCard({ r }: { r: RouteView }) {
  return (
    <Link to={`/percorso/${r.id}${r.visibility === 'link' && r.shareToken ? `?t=${r.shareToken}` : ''}`} className="card card-link">
      <div className="row between"><strong style={{ fontSize: 'var(--fs-lg)' }}>{r.name}</strong>{r.isFavorite && <Heart size={18} className="accent" fill="currentColor" aria-label="Nei preferiti" />}</div>
      <div className="event-meta"><MapPin size={15} aria-hidden="true" /><span className="truncate">{r.startName}{r.endName && r.endName !== r.startName ? ` → ${r.endName}` : ' (anello)'}</span></div>
      <div className="tags">
        {r.distanceKm !== null ? <span className="chip accent"><RouteIcon size={13} aria-hidden="true" /> {fmtKm(r.distanceKm)}</span> : <span className="chip">Distanza non indicata</span>}
        {r.geometry && <span className="chip">Tracciato su mappa</span>}
        {r.area && <span className="chip">{r.area}</span>}
        <span className="chip">{r.visibility === 'private' ? 'Privato' : r.visibility === 'link' ? 'Con link' : 'Pubblico'}</span>
      </div>
    </Link>
  );
}

export function RoutesTab() {
  const { backend, me } = useSession();
  const [scope, setScope] = useState<'explore' | 'mine' | 'saved'>('explore');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [len, setLen] = useState<[number | null, number | null]>([null, null]);
  const { data, error, loading, reload } = useAsync(() => backend.listRoutes({ scope, areaText: q, minKm: len[0], maxKm: len[1] }), [scope, q, len[0], len[1], me?.id]);
  return (
    <div className="stack">
      <div className="filter-row" role="group" aria-label="Elenco">
        <button className="pill" aria-pressed={scope === 'explore'} onClick={() => setScope('explore')}>Esplora</button>
        {me && <button className="pill" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>I miei</button>}
        {me && <button className="pill" aria-pressed={scope === 'saved'} onClick={() => setScope('saved')}>Salvati</button>}
        {([['Fino a 5 km', null, 5], ['5–10 km', 5, 10], ['Oltre 10 km', 10, null]] as const).map(([l, a, b]) => (
          <button key={l} className="pill" aria-pressed={len[0] === a && len[1] === b} onClick={() => setLen(len[0] === a && len[1] === b ? [null, null] : [a, b])}>{l}</button>
        ))}
      </div>
      <form className="row" role="search" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
        <input className="input grow" type="search" placeholder="Cerca per zona o nome" aria-label="Cerca percorsi" value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setQ(''); }} />
        <Button type="submit" variant="outline">Cerca</Button>
      </form>
      <Link to={me ? '/percorso/nuovo' : loginPath('/percorso/nuovo')} className="btn btn-primary"><RouteIcon size={18} aria-hidden="true" /> Salva un percorso</Link>
      {loading && !data ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.length ? data.map((r) => <RouteCard key={r.id} r={r} />) : (
        <EmptyState icon={<RouteIcon />} title={scope === 'explore' ? 'Nessun percorso pubblico' : scope === 'mine' ? 'Non hai ancora percorsi' : 'Nessun percorso salvato'} text="Salva i tuoi giri preferiti con partenza, arrivo e distanza: potrai associarli alle uscite e condividerli con un link." />
      )}
    </div>
  );
}

function PlaceSearch({ label, onPick }: { label: string; onPick: (name: string, p: LatLng) => void }) {
  const { backend } = useSession();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    if (busy || q.trim().length < 3) return;
    setBusy(true);
    setErr('');
    try { const r = await backend.ext.geo.search(q); setRes(r.results); if (!r.results.length) setErr('Nessun risultato: prova con un nome diverso o scegli il punto sulla mappa.'); }
    catch (x) { setErr(errText(x)); setRes([]); } finally { setBusy(false); }
  }
  // Niente <form> qui: questo componente vive dentro il form del percorso (i form annidati non sono validi in HTML).
  return (
    <div className="stack-sm" role="search">
      <div className="row">
        <input className="input grow" aria-label={label} placeholder="Cerca un luogo (invio per cercare)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
        <Button variant="outline" loading={busy} onClick={go}><Search size={18} aria-hidden="true" /> Cerca</Button>
      </div>
      {err && <p className="hint" role="status">{err}</p>}
      {res.length > 0 && <ul className="stack-sm">{res.map((r, i) => <li key={i}><button type="button" className="choice" onClick={() => { onPick(r.name.split(',').slice(0, 2).join(',').trim(), { lat: r.lat, lng: r.lng }); setRes([]); setQ(''); }}><span className="small">{r.name}</span></button></li>)}</ul>}
      {res.length > 0 && <p className="attr">Risultati: Nominatim · © OpenStreetMap contributors</p>}
    </div>
  );
}

export function RouteForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id = '' } = useParams();
  const { backend } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const existing = useAsync(() => (mode === 'edit' ? backend.getRoute(id) : Promise.resolve(null)), [mode, id]);
  const feat = backend.ext.features;
  const [f, setF] = useState({ name: '', description: '', startName: '', endName: '', area: '', distance: '', notes: '', visibility: 'link' as RouteVisibility, loop: true });
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [geom, setGeom] = useState<LatLng[] | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [steps, setSteps] = useState<Array<{ text: string; distanceKm: number }>>([]);
  const [attribution, setAttribution] = useState('');
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [calc, setCalc] = useState(false);
  const [loaded, setLoaded] = useState(mode === 'new');

  useEffect(() => {
    const r = existing.data;
    if (!r || loaded) return;
    setLoaded(true);
    setF({ name: r.name, description: r.description, startName: r.startName, endName: r.endName, area: r.area, distance: r.distanceKm !== null ? String(r.distanceKm).replace('.', ',') : '', notes: r.notes, visibility: r.visibility, loop: r.endName === r.startName });
    setStart(r.start); setEnd(r.end); setGeom(r.geometry); setProvider(r.geometryProvider);
  }, [existing.data, loaded]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  function mapPick(p: LatLng) {
    if (pick === 'start') { setStart(p); if (f.loop) setEnd(p); setGeom(null); }
    if (pick === 'end') { setEnd(p); setGeom(null); }
    setPick(null);
  }

  async function compute() {
    if (!start) return;
    setCalc(true);
    try {
      const pts = f.loop || !end ? [start, { lat: start.lat + 0, lng: start.lng }] : [start, end];
      if (f.loop || !end) throw new Error('Per calcolare il percorso scegli un punto di arrivo diverso dalla partenza (non ad anello), oppure inserisci la distanza a mano.');
      const r = await backend.ext.geo.route(pts);
      setGeom(r.geometry); setProvider(r.provider); setSteps(r.steps); setAttribution(r.attribution);
      setF((s) => ({ ...s, distance: String(r.distanceKm).replace('.', ',') }));
      toast('ok', `Percorso calcolato: ${fmtKm(r.distanceKm)}.`);
    } catch (e) { toast('err', errText(e)); } finally { setCalc(false); }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const dist = f.distance.trim() ? Number(f.distance.replace(',', '.')) : null;
    const input: RouteInput = { name: f.name, description: f.description, startName: f.startName, endName: f.loop ? f.startName : f.endName, area: f.area, distanceKm: dist !== null && Number.isNaN(dist) ? (NaN as never) : dist, distanceSource: dist === null ? null : geom ? 'routing' : 'manual', notes: f.notes, start, end: f.loop ? start : end, geometry: geom, geometryProvider: geom ? provider : null, visibility: f.visibility };
    setBusy(true);
    setErrors({});
    try {
      const r = mode === 'new' ? await backend.createRoute(input) : await backend.updateRoute(id, input);
      toast('ok', 'Percorso salvato.');
      nav(`/percorso/${r.id}${r.visibility === 'link' ? `?t=${r.shareToken}` : ''}`, { replace: true });
    } catch (x) { const fl = (x as { fields?: Record<string, string> }).fields; if (fl) setErrors(fl); toast('err', errText(x)); } finally { setBusy(false); }
  }

  if (existing.loading && mode === 'edit') return <div className="page no-nav"><ListSkeleton rows={3} /></div>;
  if (existing.error) return <div className="page no-nav"><ErrorState message={existing.error.message} onRetry={existing.reload} /></div>;

  return (
    <div className="page no-nav has-action">
      <Link to={mode === 'edit' ? `/percorso/${id}` : '/esplora?t=percorsi'} className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Annulla</Link>
      <h1 className="display h1">{mode === 'new' ? 'Salva un percorso' : 'Modifica percorso'}</h1>
      <form className="stack" style={{ gap: 'var(--s-5)' }} noValidate onSubmit={submit}>
        <Field label="Nome" htmlFor="rn" error={errors.name}><input id="rn" className="input" maxLength={80} placeholder="Es. Giro del parco" value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={describedBy('rn', errors.name)} /></Field>
        <Field label="Descrizione" htmlFor="rd" optional error={errors.description}><textarea id="rd" className="textarea" maxLength={300} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>

        <section className="stack-sm" aria-label="Punti del percorso">
          <h2 className="section-title">Partenza e arrivo</h2>
          <Field label="Punto di partenza" htmlFor="rs" error={errors.startName} hint="Usa un luogo pubblico (parco, ingresso, piazza), non il tuo indirizzo di casa."><input id="rs" className="input" maxLength={100} placeholder="Es. Ingresso nord del parco" value={f.startName} onChange={(e) => set('startName', e.target.value)} aria-invalid={!!errors.startName} /></Field>
          <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={f.loop} onChange={(e) => { set('loop', e.target.checked); if (e.target.checked) { setEnd(start); setGeom(null); } }} style={{ width: 22, height: 22 }} /> <span className="small">Percorso ad anello (arrivo = partenza)</span></label>
          {!f.loop && <Field label="Punto di arrivo" htmlFor="re" optional><input id="re" className="input" maxLength={100} value={f.endName} onChange={(e) => set('endName', e.target.value)} /></Field>}
          {feat.geocoding ? <PlaceSearch label="Cerca la partenza" onPick={(name, p) => { setStart(p); set('startName', name); if (f.loop) setEnd(p); setGeom(null); }} /> : <p className="hint">La ricerca dei luoghi non è attiva su questo server: scrivi i nomi e, se vuoi, scegli i punti sulla mappa.</p>}
          {feat.geocoding && !f.loop && <PlaceSearch label="Cerca l'arrivo" onPick={(name, p) => { setEnd(p); set('endName', name); setGeom(null); }} />}
          <div className="row wrap">
            <Button variant={pick === 'start' ? 'primary' : 'outline'} size="sm" onClick={() => setPick(pick === 'start' ? null : 'start')}><MapPin size={16} aria-hidden="true" /> {pick === 'start' ? 'Tocca la mappa…' : 'Scegli partenza sulla mappa'}</Button>
            {!f.loop && <Button variant={pick === 'end' ? 'primary' : 'outline'} size="sm" onClick={() => setPick(pick === 'end' ? null : 'end')}>{pick === 'end' ? 'Tocca la mappa…' : 'Scegli arrivo sulla mappa'}</Button>}
          </div>
          <MapView label="Mappa del percorso" start={start} end={f.loop ? null : end} geometry={geom} onPick={pick ? mapPick : undefined} />
          {geom && attribution && <p className="attr">{attribution}</p>}
        </section>

        <section className="stack-sm" aria-label="Distanza">
          <h2 className="section-title">Distanza</h2>
          {feat.routing && !f.loop && start && end && <Button variant="outline" loading={calc} onClick={compute}><RouteIcon size={18} aria-hidden="true" /> Calcola il percorso a piedi</Button>}
          {!feat.routing && <p className="hint">Il calcolo automatico del percorso non è attivo su questo server: inserisci la distanza a mano.</p>}
          <Field label="Distanza (km)" htmlFor="rk" optional error={errors.distanceKm} hint={geom ? `Calcolata da ${provider}. Se la modifichi a mano, il tracciato viene rimosso.` : 'Inserita da te: non verificata.'}>
            <input id="rk" className="input" inputMode="decimal" value={f.distance} onChange={(e) => { set('distance', e.target.value); if (geom) { setGeom(null); setProvider(null); setSteps([]); } }} aria-invalid={!!errors.distanceKm} />
          </Field>
          {steps.length > 0 && <details><summary className="small" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Indicazioni ({steps.length})</summary><ol className="seg-list">{steps.map((s, i) => <li key={i}><span className="grow small">{s.text}</span><span className="muted xs">{fmtKm(s.distanceKm)}</span></li>)}</ol></details>}
        </section>

        <Field label="Zona" htmlFor="ra" optional><input id="ra" className="input" maxLength={60} placeholder="Es. Forlì" value={f.area} onChange={(e) => set('area', e.target.value)} /></Field>
        <Field label="Note sul percorso" htmlFor="rno" optional error={errors.notes}><textarea id="rno" className="textarea" maxLength={500} placeholder="Fondo, illuminazione, fontanelle…" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
          <legend className="label" style={{ marginBottom: 6 }}>Chi può vederlo</legend>
          {VIS.map(([v, t, d]) => <button key={v} type="button" role="radio" aria-checked={f.visibility === v} className="choice" onClick={() => set('visibility', v)}><Lock size={18} aria-hidden="true" className={f.visibility === v ? 'accent' : 'muted'} style={{ marginTop: 2, flex: 'none' }} /><span><span className="t">{t}</span><br /><span className="muted small">{d}</span></span></button>)}
        </fieldset>
      </form>
      <div className="action-bar"><div><Button variant="primary" block loading={busy} onClick={() => submit()}>Salva il percorso</Button></div></div>
    </div>
  );
}

export function RouteDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const { backend, me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => backend.getRoute(id, token), [id, token, me?.id]);
  const [view, setView] = useState<RouteView | null>(null);
  const [del, setDel] = useState(false);
  const r = view?.id === id ? view : data;

  if (loading && !r) return <div className="page"><ListSkeleton rows={3} /></div>;
  if (error || !r) return <div className="page"><Link to="/esplora?t=percorsi" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Percorsi</Link><ErrorState message={error?.code === 'not_found' ? 'Percorso non trovato o non accessibile. Se è condiviso con link, serve il link completo.' : (error?.message ?? 'Errore')} onRetry={reload} /></div>;
  const link = routeLink({ id: r.id, visibility: r.visibility, shareToken: r.isOwner ? r.shareToken : (token ?? '') });
  const hasMap = !!(r.start || r.geometry);

  return (
    <div className="page">
      <div className="topbar">
        <button className="back-link" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/esplora?t=percorsi'))} style={{ background: 'none', border: 0, cursor: 'pointer' }}><ArrowLeft size={18} aria-hidden="true" /> Indietro</button>
        {r.isOwner && <Link to={`/percorso/${r.id}/modifica`} className="btn btn-outline btn-sm"><Pencil size={16} aria-hidden="true" /> Modifica</Link>}
      </div>
      <header className="stack-sm">
        <div className="tags"><span className="chip">{r.visibility === 'private' ? 'Privato' : r.visibility === 'link' ? 'Con link' : 'Pubblico'}</span>{r.area && <span className="chip">{r.area}</span>}</div>
        <h1 className="display h1" style={{ fontSize: 'var(--fs-3xl)' }}>{r.name}</h1>
        <p className="muted small">di {r.owner.displayName}{r.favoriteCount ? ` · ${r.favoriteCount} ${r.favoriteCount === 1 ? 'preferito' : 'preferiti'}` : ''}</p>
        {r.description && <p className="muted">{r.description}</p>}
      </header>

      {hasMap && <MapView label={`Mappa del percorso ${r.name}`} start={r.start} end={r.end} geometry={r.geometry} />}
      {r.geometry && r.geometryProvider && <p className="attr">Percorso calcolato con {r.geometryProvider} · dati © OpenStreetMap contributors</p>}

      <section className="card" aria-label="Dettagli">
        <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="stat"><span className="v">{r.distanceKm !== null ? fmtKm(r.distanceKm) : '—'}</span><span className="l">{r.distanceSource === 'routing' ? 'Distanza dal tracciato' : r.distanceKm !== null ? 'Distanza inserita a mano' : 'Distanza non indicata'}</span></div>
          <div className="stat"><span className="v" style={{ fontSize: '1.2rem' }}>{r.endName === r.startName ? 'Anello' : 'Andata'}</span><span className="l">Tipo</span></div>
        </div>
        <div className="small"><MapPin size={16} className="accent" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> <strong>Partenza:</strong> {r.startName}{r.endName !== r.startName && <><br /><MapPin size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px', color: 'var(--danger)' }} /> <strong>Arrivo:</strong> {r.endName}</>}</div>
        {r.notes && <div><div className="label">Note</div><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p></div>}
      </section>

      <div className="row wrap">
        {me ? <Button variant={r.isFavorite ? 'primary' : 'outline'} aria-pressed={r.isFavorite} onClick={async () => { try { setView(await backend.setRouteFavorite(r.id, !r.isFavorite, token)); toast('ok', r.isFavorite ? 'Rimosso dai preferiti' : 'Salvato nei preferiti'); } catch (e) { toast('err', errText(e)); } }}><Heart size={18} aria-hidden="true" fill={r.isFavorite ? 'currentColor' : 'none'} /> {r.isFavorite ? 'Nei preferiti' : 'Salva nei preferiti'}</Button> : <Link to={loginPath(`/percorso/${r.id}${token ? `?t=${token}` : ''}`)} className="btn btn-outline">Accedi per salvarlo</Link>}
        {me && <Link to={`/uscita/nuova?route=${r.id}`} className="btn btn-primary">Organizza un'uscita qui</Link>}
      </div>

      {r.visibility !== 'private' && (
        <section className="card"><h2 className="section-title">Condividi</h2>
          <div className="row wrap">
            <Button variant="primary" className="grow" onClick={async () => { const x = await shareLink({ title: r.name, text: `Percorso: ${r.name}`, url: link }); if (x === 'copied') toast('ok', 'Link copiato'); if (x === 'failed') toast('err', 'Copia non riuscita.'); }}><Share2 size={18} aria-hidden="true" /> Condividi</Button>
            <Button variant="outline" onClick={async () => toast((await copyText(link)) ? 'ok' : 'err', 'Link copiato')}><Copy size={18} aria-hidden="true" /> Copia</Button>
            <a className="btn btn-outline" href={whatsappUrl(`Percorso: ${r.name}`, link)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        </section>
      )}
      {r.isOwner && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={18} aria-hidden="true" /> Elimina il percorso</Button>}
      {del && <ConfirmSheet title="Eliminare il percorso?" danger confirmLabel="Elimina" onClose={() => setDel(false)} onConfirm={async () => { try { await backend.deleteRoute(r.id); toast('ok', 'Percorso eliminato.'); nav('/esplora?t=percorsi', { replace: true }); } catch (e) { toast('err', errText(e)); } }}><p>Sparisce anche dai preferiti degli altri. Le uscite che lo usano restano, senza percorso.</p></ConfirmSheet>}
    </div>
  );
}
