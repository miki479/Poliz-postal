# Integrazioni esterne: condizioni, costi, attivazione

> **Metodo e limiti della verifica.** Le condizioni qui sotto sono state ricercate via web il **23/10/2026**.
> Dal sandbox di sviluppo non era possibile aprire direttamente le pagine ufficiali (nessuna risoluzione DNS),
> quindi i dati vengono da riassunti di ricerca che citano le fonti ufficiali. **Ricontrolla ogni pagina ufficiale
> prima del lancio**: prezzi, quote e termini cambiano. Nessun servizio è stato attivato, nessuna carta inserita,
> nessun abbonamento sottoscritto. **Nessuna integrazione esterna è stata provata contro il servizio reale**: i test usano
> server simulati (mock) locali che riproducono il protocollo.

Regola applicata: **ogni integrazione è opzionale e spenta finché non configurata**. L'app funziona completamente senza.

| Servizio | Stato di default | Costo con la configurazione proposta | Rischio costi |
|---|---|---|---|
| Email (Resend) | spenta | piano gratuito | basso (tetto del piano) |
| Google / Apple Sign-In | spenti | Google gratis; **Apple richiede Apple Developer Program (a pagamento)** | Apple: costo annuale |
| Strava API | spenta | gratis | nessuno, ma serve approvazione per più di 1 atleta |
| Tessere OSM | attive (uso leggero) | gratis | policy d'uso: niente uso intensivo |
| Ricerca luoghi (Nominatim) | spenta finché non imposti un recapito | gratis, 1 richiesta/s | policy d'uso |
| Percorsi (OpenRouteService) | spenti finché non imposti la chiave | piano gratuito | **uso commerciale da chiarire** |
| Meteo (Open-Meteo) | **spento** | gratis solo **non commerciale** | **commerciale = piano a pagamento** |
| Coach AI (Workers AI) | **spento** | 10.000 Neuron/giorno gratis | **oltre la quota = a pagamento se attivi Workers Paid: non farlo** |
| Apple Salute (HealthKit) | non disponibile (PWA) | — | app nativa = Apple Developer (a pagamento) |

---

## Strava (API v3)

**Cosa fa:** collegamento OAuth2, import manuale delle corse/camminate (paginato, deduplicato), data dell'ultima sincronizzazione, scollegamento con cancellazione dei dati importati. **Non carica nulla su Strava.**

**Condizioni rilevanti (ricerca, ricontrollare):**
- Dal novembre 2024 l'API Agreement consente di mostrare i dati di un atleta **solo a quell'atleta**; vietato mostrarli ad altri utenti anche se pubblici, e vietato l'uso per analisi di terzi o per addestrare modelli AI.
  → **Scelta implementata:** le attività Strava sono sempre `private`: non entrano in classifiche, sfide, feed né nel Coach AI; non si possono rendere condivisibili (il server lo impedisce).
- Le app nuove sono in "modalità singolo atleta": solo l'account proprietario dell'app può autorizzarla finché Strava non approva un aumento della capacità. **Non è garantita l'approvazione.** (Non verificato nei dettagli: controlla "Rate limits & athlete capacity" nei documenti Strava.)
- Limiti di richieste: l'app tiene un budget interno di 80 richieste/15 min (`STRAVA_REQUESTS_PER_15MIN`) e un intervallo minimo tra sincronizzazioni (`STRAVA_SYNC_COOLDOWN_MS`, 5 min). I limiti ufficiali tipici sono 100/15 min e 1.000/giorno (da verificare).
- Attribuzione: l'app mostra "Powered by Strava" (testo) e il link "Visualizza su Strava". **Prima della revisione di Strava sostituisci il testo con i loghi/badge ufficiali** secondo le *Brand Guidelines*.

**Come attivarla (gratis):**
1. Accedi a Strava → Impostazioni → *My API Application* (https://www.strava.com/settings/api) e crea l'app.
2. *Authorization Callback Domain* = dominio di `APP_URL` (es. `podismo.onrender.com`; per prove locali `localhost`).
3. Imposta sul server: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_URL`.
4. Apri *Profilo → Collegamenti e import → Collega Strava*. Con l'app in sviluppo funziona solo per il tuo account.
5. Per altri utenti serve richiedere a Strava l'aumento di capacità/approvazione (processo di revisione, **non automatico**).

**Sicurezza:** token cifrati a riposo (AES-256-GCM), mai inviati al client né registrati nei log; `state` OAuth firmato e legato alla sessione; rinnovo automatico del token (e salvataggio del nuovo refresh token); 401 irrecuperabile ⇒ collegamento segnato "da ricollegare", il resto dell'app continua a funzionare.

## Apple Salute / HealthKit

**PWA = nessun accesso diretto.** Un sito web non può leggere HealthKit; solo un'app iOS nativa può, con consenso per categoria. Non è mostrato alcun "collegamento" finto.

**Cosa c'è:** importazione manuale di `export.xml` (Apple Salute → profilo → *Esporta tutti i dati sanitari*, decomprimere lo zip), oltre a GPX e TCX. Il file viene letto **nel browser**; al server arrivano solo data, distanza, durata di corse/camminate (private di default). Lettura a blocchi: gestisce export molto grandi.

**Cosa manca per un'integrazione vera:** app iOS nativa o wrapper (es. Capacitor con plugin HealthKit), **Apple Developer Program (a pagamento, circa 99 USD/anno — verifica)**, revisione App Store, testo di consenso per categoria, sincronizzazione incrementale con `HKAnchoredObjectQuery`, gestione permessi negati/revocati. Non è stato attivato né acquistato nulla.

## Mappe, ricerca luoghi, percorsi

- **Tessere OpenStreetMap** (`tile.openstreetmap.org`): la policy vieta l'uso intensivo senza permesso e richiede attribuzione (mostrata sempre). Va bene per un gruppo piccolo; per più traffico imposta `TILE_URL` verso un fornitore dedicato (verifica i suoi termini). Il browser contatta direttamente il fornitore (vede l'IP dell'utente: indicato nella privacy).
- **Nominatim** (ricerca luoghi): policy: max **1 richiesta/secondo**, identificazione via User-Agent con recapito, **niente autocompletamento**, niente uso massivo. Implementato: ricerca solo su invio, coda a 1 req/s, cache 24 h, tetto giornaliero (`GEO_SEARCH_DAILY_CAP`). Attivazione: imposta `GEO_CONTACT_EMAIL`.
- **Routing:** nessun provider è attivo di default (il server demo pubblico OSRM non offre il profilo a piedi ed è solo per uso leggero/sviluppo).
  - **OpenRouteService** (piano Standard gratuito: ~2.000 direzioni/giorno e 40/min, 1.000 geocoding/giorno secondo la pagina piani): crea una chiave su https://openrouteservice.org e imposta `ORS_API_KEY`. **L'uso commerciale con il piano gratuito non è chiaro dalle fonti trovate**: scrivi a enquiry@openrouteservice.org prima di un uso commerciale. Alternativa: OSRM/ORS self-hosted (`OSRM_URL`/`ORS_URL`).
  - Tetto interno `GEO_ROUTE_DAILY_CAP` (default 1500) per restare sotto la quota.
- **Nessuna geometria o distanza inventata:** il server rifiuta un percorso "da routing" la cui distanza non coincida col tracciato; la distanza inserita a mano è sempre etichettata "inserita a mano". Senza servizio, si può creare comunque un percorso/uscita con luogo e distanza manuali.
- "Rungine" citato nella richiesta: non ho trovato un servizio con questo nome durante la ricerca; non è stato integrato.

## Meteo (Open-Meteo)

**Condizioni (ricerca, ricontrollare su https://open-meteo.com/en/terms):** l'API gratuita è **solo per uso non commerciale** (< 10.000 chiamate/giorno, 5.000/ora, 600/minuto); app con abbonamenti o pubblicità sono considerate commerciali e richiedono un piano a pagamento con chiave API; licenza CC BY 4.0 con attribuzione.

**Scelta:** integrazione **disattivata di default** (`WEATHER_ENABLED=0`). Attivala solo per sviluppo e test con un gruppo non commerciale. Per uso commerciale: sottoscrivi tu il piano Open-Meteo e imposta `OPEN_METEO_API_KEY` (usa automaticamente `customer-api.open-meteo.com`). Cache 30 min, coordinate arrotondate a ~10 km, tetto `WEATHER_DAILY_CAP`, mostra ora dell'ultimo aggiornamento e attribuzione. Nessuna chiave richiesta per l'uso non commerciale.

## Coach AI (Cloudflare Workers AI)

**Condizioni (ricerca, ricontrollare su https://developers.cloudflare.com/workers-ai/platform/pricing/):** 10.000 Neuron/giorno gratuiti (reset 00:00 UTC), pool unico condiviso tra tutti i modelli; oltre la soglia serve il piano **Workers Paid** a 0,011 USD / 1.000 Neuron. Con piano Free, superata la quota le richieste falliscono (nessun addebito) — **non attivare Workers Paid**. Un modello da 8B consente stime nell'ordine di un centinaio di risposte brevi al giorno in totale: per questo i tetti predefiniti sono bassi (5/utente, 60 globali). Termini d'uso commerciale e licenza del modello (es. Llama) vanno verificati.

**Modello:** `@cf/meta/llama-3.1-8b-instruct` (configurabile con `AI_MODEL` nel Worker). **Non ho potuto verificarne la disponibilità reale nel tuo account**: controllalo nel catalogo modelli e nei limiti del piano.

**Architettura:** il browser non vede mai chiavi. Il server (1) verifica la sessione, (2) applica quota per account e tetto globale *prima* della chiamata (rimborsata se fallisce), (3) costruisce un contesto minimo e anonimo **solo se l'utente lo chiede** (mai email, nomi, dati Strava o da file/Apple Salute), (4) chiama il Worker con richiesta firmata HMAC-SHA256 + timestamp (scade in 60 s). Il Worker rifiuta tutto ciò che non è firmato. L'AI restituisce solo testo: non crea né modifica nulla.

**Attivazione:**
```bash
cd worker && npx wrangler login
npx wrangler secret put SHARED_SECRET      # un valore lungo e casuale
npx wrangler deploy                        # annota l'URL del Worker
```
Sul server: `AI_ENABLED=1`, `AI_WORKER_URL=<url del worker>`, `AI_WORKER_SECRET=<stesso valore>`, eventualmente `AI_DAILY_LIMIT`/`AI_GLOBAL_DAILY_LIMIT`.
**Sviluppo senza credenziali:** `AI_WORKER_SECRET=dev node scripts/dev-ai-worker.mjs` avvia un Worker *simulato* (risposta fissa marcata "SIMULATO" in UI). Senza configurazione l'app mostra "Coach AI non disponibile" e non simula nulla.

## Email e accesso Google/Apple

- **Email:** Resend (piano gratuito, tetti giornalieri/mensili da verificare; per scrivere a destinatari qualsiasi serve verificare un dominio). `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`. Senza email: registrazione e login funzionano; recupero password e verifica sono dichiarati non disponibili.
- **Google Sign-In:** crea un *OAuth Client ID* (Web) su Google Cloud Console (gratis), aggiungi l'origine di `APP_URL`, imposta `GOOGLE_CLIENT_ID`. Il server verifica l'ID token (firma RS256, `iss`, `aud`, scadenza) — verificato solo con chiavi di test locali, **non con Google reale**.
- **Apple Sign-In:** richiede **Apple Developer Program (a pagamento)**, un *Services ID* e un redirect URI. Imposta `APPLE_CLIENT_ID` e `APPLE_REDIRECT_URI`. Verifica del token implementata e testata con chiavi locali, **non con Apple reale**.
- Collegamento per email solo se verificata dal provider.
