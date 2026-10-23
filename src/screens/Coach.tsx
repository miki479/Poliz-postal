import { ArrowLeft, Bot, Copy, Info, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copyText } from '../share.ts';
import { errText, useSession } from '../session.tsx';
import { Button, EmptyState, Field, Spinner, Switch, useAsync, useToast } from '../ui.tsx';
import type { AiAnswer } from '../backend/types.ts';

const PRESETS: Array<[string, string, string]> = [
  ['week_plan', 'Settimana di corsa', 'Es. principiante, 3 giorni a settimana, 30 minuti al massimo'],
  ['three_easy_runs', '3 uscite tranquille', 'Es. con amici di livelli diversi'],
  ['event_description', 'Descrizione di un\'uscita', 'Es. corsa di 5 km sabato mattina, ritmo facile, ritrovo in palestra'],
  ['challenge_description', 'Descrizione di una sfida', 'Es. sfida di club di una settimana, più chilometri'],
  ['collective_goal', 'Obiettivo collettivo', 'Es. gruppo di 8 persone, un mese'],
  ['weekly_summary', 'Riepilogo della settimana', ''],
  ['free', 'Domanda libera', 'Scrivi la tua domanda'],
];

export function Coach() {
  const { backend } = useSession();
  const toast = useToast();
  const on = backend.ext.features.ai;
  const st = useAsync(() => (on ? backend.ext.ai.status() : Promise.resolve(null)), [on]);
  const [preset, setPreset] = useState(PRESETS[0][0]);
  const [prompt, setPrompt] = useState('');
  const [useData, setUseData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ans, setAns] = useState<AiAnswer | null>(null);
  const cur = PRESETS.find((p) => p[0] === preset)!;

  async function ask() {
    if (busy) return;
    setBusy(true);
    setErr('');
    setAns(null);
    try { const a = await backend.ext.ai.chat({ prompt, preset, useData }); setAns(a); st.reload(); } catch (e) { setErr(errText(e)); st.reload(); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <Link to="/profilo" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Profilo</Link>
      <h1 className="display h1">Coach AI</h1>

      {!on || (st.data && !st.data.configured) ? (
        <EmptyState icon={<Bot />} title="Coach AI non disponibile" text={st.data?.reason ?? 'Il Coach AI è una funzione facoltativa e non è attiva su questo server. Tutto il resto dell\'app (piano, sfide, statistiche) funziona normalmente senza.'} action={<Link to="/piano" className="btn btn-outline">Vai al piano di allenamento</Link>} />
      ) : st.loading && !st.data ? <Spinner /> : (
        <>
          <p className="muted small">Suggerimenti per organizzare allenamenti e uscite. È gratuito, con un limite giornaliero. Non pubblica né modifica nulla: puoi solo copiare il testo.</p>
          {st.data && <div className="tags"><span className="chip accent">Richieste di oggi: {st.data.used} su {st.data.dailyLimit}</span>{!st.data.serviceAvailable && <span className="chip danger">Limite giornaliero del servizio raggiunto</span>}</div>}
          <div className="filter-row" role="group" aria-label="Cosa vuoi fare">{PRESETS.map(([k, l]) => <button key={k} className="pill" aria-pressed={preset === k} onClick={() => setPreset(k)}>{l}</button>)}</div>
          <Field label={preset === 'free' ? 'La tua domanda' : 'Indicazioni'} htmlFor="ap" optional={preset !== 'free'} hint={`${prompt.length}/500`}>
            <textarea id="ap" className="textarea" maxLength={500} placeholder={cur[2]} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          <section className="card">
            <Switch label="Usa i miei dati registrati" description="Invia un riepilogo anonimo degli ultimi 7 giorni (numero di attività, km, minuti) delle attività che hai inserito tu. Mai email, nomi, dati Strava o di Apple Salute." checked={useData} onChange={setUseData} />
            <p className="hint"><ShieldCheck size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px' }} /> Se spento il consiglio è generico e non viene inviato nulla di personale.</p>
          </section>
          {err && <div className="banner err" role="alert">{err}</div>}
          <Button variant="primary" block loading={busy} disabled={st.data ? !st.data.serviceAvailable || st.data.remaining <= 0 : false} onClick={ask}>{st.data && st.data.remaining <= 0 ? 'Limite di oggi raggiunto' : 'Chiedi al coach'}</Button>
          {ans && (
            <section className="card hero" aria-label="Risposta del coach" aria-live="polite">
              <div className="tags">
                <span className={`chip ${ans.generic ? '' : 'accent'}`}>{ans.generic ? 'Consiglio generico' : 'Basato sui tuoi dati registrati'}</span>
                {ans.simulated && <span className="chip danger">SIMULATO — sviluppo, nessun modello reale</span>}
              </div>
              <div className="coach-answer">{ans.text}</div>
              <div className="row wrap"><Button variant="outline" size="sm" onClick={async () => toast((await copyText(ans.text)) ? 'ok' : 'err', 'Testo copiato')}><Copy size={16} aria-hidden="true" /> Copia</Button></div>
              <p className="hint"><Info size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px' }} /> Generato da un modello AI: può sbagliare e non sostituisce un consiglio medico o di un allenatore. Nulla è stato salvato o pubblicato.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
