import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND } from '../brand.ts';
import { useSession } from '../session.tsx';

export function Privacy() {
  const { backend, mode } = useSession();
  const f = backend.ext.features;
  return (
    <div className="page no-nav">
      <Link to="/" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Indietro</Link>
      <h1 className="display h1">Privacy</h1>
      <p className="muted small">Informativa semplificata di {BRAND.name}, che descrive solo ciò che è attivo su questo server. <strong>Bozza da completare</strong> con i dati del titolare del trattamento e da far revisionare prima di un uso pubblico.</p>
      {mode === 'demo' && <div className="banner">Modalità demo: nessun dato lascia questo dispositivo.</div>}
      <section className="card"><h2 className="section-title">Cosa raccogliamo</h2><ul className="stack-sm small">
        <li><strong>Account:</strong> email e password (conservata solo come hash), nome visualizzato, username, foto e zona facoltative. L'email non è mai visibile agli altri.</li>
        <li><strong>Attività:</strong> uscite, iscrizioni, club, sfide, percorsi, piani e allenamenti che inserisci. Distanze e durate sono dichiarate da te.</li>
        <li><strong>Posizione:</strong> solo se la condividi esplicitamente (punto di ritrovo arrotondato, ordinamento “vicino a me” che non viene salvato).</li>
        <li><strong>Nessun tracciamento continuo</strong>, nessuna pubblicità, nessuna vendita di dati personali.</li></ul></section>
      <section className="card"><h2 className="section-title">Chi vede cosa</h2><p className="small muted">Il tuo piano e i tuoi allenamenti sono privati. Condividi solo ciò che scegli: uscite pubbliche o di club, sfide a cui partecipi, completamenti che attivi tu. Le impostazioni sono nel Profilo.</p></section>
      <section className="card"><h2 className="section-title">Servizi esterni attivi</h2><ul className="stack-sm small">
        <li>Mappe: tessere © OpenStreetMap contributors (il browser le richiede direttamente al fornitore, che vede il tuo IP).</li>
        {f.geocoding && <li>Ricerca luoghi: il testo cercato passa dal nostro server a Nominatim (OpenStreetMap).</li>}
        {f.routing && <li>Calcolo percorsi: le coordinate dei punti scelti passano dal nostro server al servizio di routing.</li>}
        {f.weather && <li>Meteo: Open-Meteo.com riceve le coordinate approssimate (≈10 km) del luogo dell'uscita.</li>}
        {f.strava && <li>Strava: se colleghi l'account importiamo le tue attività; token cifrati, dati privati e visibili solo a te; puoi scollegare ed eliminare tutto.</li>}
        {f.ai && <li>Coach AI (Cloudflare Workers AI): invia il testo che scrivi e, solo se lo scegli, un riepilogo anonimo delle attività inserite da te. Mai dati Strava o di Apple Salute.</li>}
        <li>Importazione da file (GPX, TCX, Apple Salute): il file resta sul tuo dispositivo; al server arrivano solo data, distanza e durata delle corse/camminate, in forma privata.</li>
        {!f.strava && !f.ai && !f.weather && <li className="muted">Strava, meteo e Coach AI non sono attivi.</li>}</ul></section>
      <section className="card"><h2 className="section-title">I tuoi diritti</h2><p className="small muted">Puoi modificare i dati dal Profilo, scollegare le integrazioni, eliminare le attività importate ed <strong>eliminare l'account</strong> (cancelliamo profilo, email, iscrizioni, attività, piani, percorsi e token). Per altre richieste contatta chi gestisce il servizio.</p></section>
    </div>
  );
}
