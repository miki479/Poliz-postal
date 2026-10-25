import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Link2, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ParseResult } from '../../shared/importers.ts';
import { fileImportBatches } from '../../shared/importers.ts';
import type { ImportResult } from '../../shared/importing.ts';
import type { StravaStatus, SyncSummary } from '../backend/types.ts';
import { fmtDateTimeShort } from '../format.ts';
import { readWorkoutFile } from '../import/readFile.ts';
import { errText, useSession } from '../session.tsx';
import { Button, ConfirmSheet, ErrorState, Spinner, Switch, useAsync, useToast } from '../ui.tsx';

const CALLBACK_MSG: Record<string, [string, 'ok' | 'err']> = {
  ok: ['Strava collegato. Ora puoi sincronizzare le attività.', 'ok'],
  denied: ['Hai annullato il collegamento a Strava.', 'err'],
  scope_missing: ['Per importare serve il permesso di lettura delle attività: riprova e lascialo selezionato.', 'err'],
  state_error: ['Collegamento non valido o scaduto. Riprova dal pulsante qui sotto.', 'err'],
  already_linked: ['Questo account Strava è già collegato a un altro utente.', 'err'],
  unavailable: ['L\'integrazione Strava non è attiva su questo server.', 'err'],
  error: ['Collegamento non riuscito. Riprova tra poco: Strava potrebbe limitare i nuovi collegamenti finché l\'app non è approvata.', 'err'],
};

function SyncReport({ s }: { s: SyncSummary }) {
  return (
    <div className="stack-sm small" role="status">
      {s.error === 'revoked' && <div className="banner err"><AlertTriangle size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>L'autorizzazione è stata revocata o è scaduta: ricollega Strava.</span></div>}
      {s.error === 'budget' && <div className="banner">Limite di richieste verso Strava raggiunto: riprova tra 15 minuti.</div>}
      {s.error === 'network' && <div className="banner">Strava non è raggiungibile ora. Riprova più tardi.</div>}
      {s.error === 'strava_error' && <div className="banner err">Strava ha risposto con un errore. Riprova più tardi.</div>}
      {s.rateLimited && !s.error && <div className="banner">Strava ha applicato il limite di richieste. Quanto già importato è salvo: riprova tra 15 minuti.</div>}
      {s.partial && <div className="banner info">Importate le prime attività: sono molte. Le più vecchie potrebbero non essere incluse.</div>}
      <p>Ultima sincronizzazione: {s.imported} nuove, {s.updated} aggiornate, {s.duplicates} già presenti da altre fonti, {s.skipped} non importabili (altri sport).</p>
    </div>
  );
}

function StravaCard() {
  const { backend } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const st = useAsync(() => backend.auth.mode === 'demo' ? Promise.resolve<StravaStatus>({ configured: false, reason: 'Modalità demo: l\'integrazione richiede il server.', scope: '', connected: false, revoked: false, athleteId: null, connectedAt: null, lastSyncAt: null, lastSync: null, grantedScope: null }) : backend.ext.strava.status(), []);
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [report, setReport] = useState<SyncSummary | null>(null);
  const [disc, setDisc] = useState(false);
  const [del, setDel] = useState(true);
  const msg = params.get('strava');
  const shown = useRef(false);
  useEffect(() => {
    if (msg && !shown.current) {
      shown.current = true;
      const m = CALLBACK_MSG[msg] ?? CALLBACK_MSG.error;
      toast(m[1], m[0]);
      setParams({}, { replace: true });
      st.reload();
    }
  }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  const s: StravaStatus | null = st.data;
  const last = report ?? s?.lastSync ?? null;

  return (
    <section className="card" aria-labelledby="strv">
      <div className="row between"><h2 className="section-title" id="strv">Strava</h2>{s && <span className={`chip ${s.connected ? 'success' : ''}`}>{s.connected ? 'Collegato' : s.revoked ? 'Da ricollegare' : s.configured ? 'Non collegato' : 'Non attivo'}</span>}</div>
      {st.loading && !s ? <Spinner /> : st.error ? <ErrorState message={st.error.message} onRetry={st.reload} /> : s && !s.configured ? (
        <>
          <div className="banner"><AlertTriangle size={18} aria-hidden="true" style={{ flex: 'none' }} /><span><strong>Integrazione non ancora attiva.</strong> {s.reason ?? ''} Chi gestisce l'app deve creare l'app su Strava Developers e impostare le credenziali (vedi documentazione). Il resto dell'app funziona normalmente.</span></div>
        </>
      ) : s && (
        <>
          <p className="muted small">Importa le tue corse e camminate da Strava nello storico personale. Chiediamo solo i permessi <strong>{s.scope.replace(',', ' + ')}</strong> (lettura). Non carichiamo nulla su Strava.</p>
          <div className="banner info"><span>I dati Strava restano <strong>privati</strong>: li vedi solo tu e non compaiono in sfide, classifiche, feed né nel Coach AI, come richiesto dalle regole dell'API di Strava.</span></div>
          {s.connected ? (
            <>
              <p className="small">Atleta Strava n. {s.athleteId} · collegato il {s.connectedAt ? fmtDateTimeShort(s.connectedAt) : '—'}<br />Ultima sincronizzazione: <strong>{s.lastSyncAt ? fmtDateTimeShort(s.lastSyncAt) : 'mai'}</strong></p>
              {last && <SyncReport s={last} />}
              <div className="row wrap">
                <Button variant="primary" loading={busy === 'sync'} onClick={async () => { setBusy('sync'); try { const r = await backend.ext.strava.sync(); setReport(r.summary); st.reload(); if (!r.summary.error) toast('ok', `Sincronizzazione completata: ${r.summary.imported} nuove.`); } catch (e) { toast('err', errText(e)); } finally { setBusy(null); } }}><RefreshCw size={18} aria-hidden="true" /> Sincronizza ora</Button>
                <Button variant="outline" onClick={() => setDisc(true)}>Scollega</Button>
              </div>
              <p className="attr">Powered by Strava · <a href="https://www.strava.com/athlete/apps" target="_blank" rel="noopener noreferrer" className="accent">gestisci l'accesso su Strava</a></p>
            </>
          ) : (
            <>
              {s.revoked && <div className="banner err">L'autorizzazione non è più valida (revocata o scaduta). Ricollega l'account.</div>}
              <Button variant="primary" loading={busy === 'connect'} onClick={async () => { setBusy('connect'); try { window.location.assign(await backend.ext.strava.connect()); } catch (e) { toast('err', errText(e)); setBusy(null); } }}><Link2 size={18} aria-hidden="true" /> Collega Strava</Button>
              <p className="hint">Mentre l'app Strava è in fase di sviluppo possono collegarsi solo gli account autorizzati dal suo proprietario (limite di Strava, vedi documentazione).</p>
            </>
          )}
          {disc && <ConfirmSheet title="Scollegare Strava?" danger confirmLabel="Scollega" onClose={() => setDisc(false)} onConfirm={async () => { try { const r = await backend.ext.strava.disconnect(del); toast('ok', `Strava scollegato${del ? `, eliminate ${r.deleted} attività importate` : ''}.`); setDisc(false); setReport(null); st.reload(); } catch (e) { toast('err', errText(e)); } }}>
            <p>Revochiamo l'accesso su Strava e cancelliamo i token dal server.</p>
            <Switch label="Elimina anche le attività importate da Strava" checked={del} onChange={setDel} />
          </ConfirmSheet>}
        </>
      )}
    </section>
  );
}

function FileImportCard() {
  const { backend } = useSession();
  const toast = useToast();
  const [parsed, setParsed] = useState<(ParseResult & { name: string }) | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr('');
    setParsed(null);
    setResult(null);
    setProgress(0);
    try {
      const r = await readWorkoutFile(f, setProgress);
      if (!r.activities.length) setErr(`Nessuna corsa o camminata importabile nel file (${r.skipped} voci ignorate).`);
      else setParsed({ ...r, name: f.name });
    } catch (e) { setErr(errText(e)); } finally { setProgress(null); }
  }

  async function run() {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      let total: ImportResult = { imported: 0, duplicates: 0, invalid: 0 };
      for (const batch of fileImportBatches(parsed.activities)) {
        const r = await backend.importActivities(batch);
        total = { imported: total.imported + r.imported, duplicates: total.duplicates + r.duplicates, invalid: total.invalid + r.invalid };
      }
      setResult(total);
      setParsed(null);
      toast('ok', `Importate ${total.imported} attività.`);
    } catch (e) { toast('err', errText(e)); } finally { setBusy(false); }
  }

  return (
    <section className="card" aria-labelledby="fimp">
      <h2 className="section-title" id="fimp">Importa da file</h2>
      <p className="muted small">Carica un file <strong>GPX</strong>, <strong>TCX</strong> o l'<strong>export.xml di Apple Salute</strong>. Il file viene letto sul tuo dispositivo: al server arrivano solo data, distanza e durata delle corse e camminate. Le attività importate sono <strong>private</strong> (puoi condividerle una per una dallo storico).</p>
      <label className="btn btn-outline" style={{ cursor: 'pointer' }}><FileUp size={18} aria-hidden="true" /> Scegli un file<input type="file" accept=".gpx,.tcx,.xml,application/gpx+xml,text/xml,application/xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} /></label>
      {progress !== null && <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Lettura del file"><i style={{ width: `${progress}%` }} /></div>}
      {err && <div className="banner err" role="alert">{err}</div>}
      {parsed && (
        <div className="stack-sm" role="status">
          <p className="small"><strong>{parsed.name}</strong>: trovate <strong>{parsed.activities.length}</strong> attività ({parsed.format === 'apple-health' ? 'Apple Salute' : parsed.format.toUpperCase()}), {parsed.skipped} ignorate (altri sport o dati incompleti).</p>
          <p className="hint">Le attività già presenti nello storico (anche da altre fonti) non verranno duplicate.</p>
          <Button variant="primary" loading={busy} onClick={run}>Importa {parsed.activities.length} attività</Button>
        </div>
      )}
      {result && <p className="small" role="status"><CheckCircle2 size={16} className="accent" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Importate {result.imported}, già presenti {result.duplicates}, non valide {result.invalid}.</p>}
      <Button variant="ghost" onClick={() => setConfirmDel(true)}>Elimina tutte le attività importate da file</Button>
      {confirmDel && <ConfirmSheet title="Eliminare gli import da file?" danger confirmLabel="Elimina" onClose={() => setConfirmDel(false)} onConfirm={async () => { try { const r = await backend.deleteImported('file'); toast('ok', `Eliminate ${r.deleted} attività importate.`); setConfirmDel(false); } catch (e) { toast('err', errText(e)); } }}><p>Cancelliamo dallo storico tutte le attività importate da GPX, TCX o Apple Salute. Le attività inserite a mano non vengono toccate.</p></ConfirmSheet>}
    </section>
  );
}

export function Integrations() {
  return (
    <div className="page">
      <Link to="/profilo" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Profilo</Link>
      <h1 className="display h1">Collegamenti e import</h1>
      <p className="muted small">Facoltativi: l'app funziona completamente anche senza.</p>
      <StravaCard />
      <FileImportCard />
      <section className="card" aria-labelledby="ahk">
        <div className="row"><Smartphone className="muted" aria-hidden="true" /><h2 className="section-title" id="ahk">Apple Salute (HealthKit)</h2><span className="chip" style={{ marginLeft: 'auto' }}>Non disponibile</span></div>
        <p className="muted small">RUNNGO è una web app (PWA): <strong>un sito non può leggere Apple Salute</strong>, solo le app iOS native possono farlo, con il tuo consenso. Per questo non c'è un collegamento automatico.</p>
        <p className="muted small"><strong>Cosa puoi fare ora:</strong> in Apple Salute tocca il tuo profilo → <em>Esporta tutti i dati sanitari</em>, decomprimi lo zip e importa qui <code>export.xml</code>: leggiamo solo gli allenamenti di corsa e camminata, nient'altro.</p>
        <p className="hint">Una futura app iOS nativa richiederebbe un account Apple Developer (a pagamento) e la revisione di Apple: non è attivata né acquistata. Vedi la documentazione.</p>
      </section>
    </div>
  );
}
