# PODISMO SOCIAL

App mobile-first (PWA) per organizzare **corse e attività di gruppo**, sfidare gli amici, pianificare gli allenamenti e tenere traccia dei propri progressi. Italiano, tema scuro con accenti ciano.

> Principio: le funzioni per allenarsi insieme, sfidare gli amici e monitorare i progressi sono **gratuite**. Nessun paywall, nessuna pubblicità, nessun pagamento nell'MVP.

Questo progetto **sostituisce** la precedente app "Turno Reale" (la cronologia git la conserva).

## Funzioni

**Account:** registrazione/login email+password, recupero password e verifica email (se l'invio email è configurato), accesso Google/Apple (solo con credenziali reali), onboarding profilo facoltativo (nome, username univoco, sport, zona, foto), sessione persistente, logout, cambio password, eliminazione account con cancellazione dei dati.
**Uscite:** creazione/modifica/annullamento, partecipazione con posti limitati e prevenzione di doppie iscrizioni e corse all'ultimo posto, visibilità pubblica/club/privata (link con token), condivisione con link/WhatsApp, notifiche in-app, meteo previsto (opzionale), percorso associato.
**Club:** creazione, invito con codice/link, membri, classifica trasparente (metrica e periodo indicati).
**Sfide:** 5 tipi (più uscite, più distanza, più giorni attivi, obiettivo collettivo, obiettivo personale), invito con link, classifica e progresso calcolati dalle attività registrate, risultato finale **congelato** dopo la chiusura, regole anti-abuso.
**Statistiche e storico:** totali, settimana/mese, confronto col mese precedente, serie di settimane attive, record, andamento mensile/settimanale (grafici accessibili con tabella), storico filtrabile, modifica/eliminazione, deduplicazione tra fonti. Ogni dato è etichettato *Autodichiarata* / *Importata* (nessuna fonte è "Verificata").
**Percorsi:** salvataggio con partenza/arrivo/distanza/note, preferiti, condivisione con link, associazione a un'uscita, mappa Leaflet+OpenStreetMap, ricerca luoghi e calcolo del percorso a piedi (opzionali).
**Allenamento:** piano settimanale, 12 tipi di sessione (corsa, corsa/camminata, aerobico, forza, recupero…), procedura guidata prudente (senza AI), creazione manuale, sessioni con fasi/segmenti ed esercizi, cronometro (solo con app aperta), registrazione con durata/distanza/fatica/serie/carichi, confronto previsto/svolto, progressione dei carichi, routine di forza, uscite di gruppo dal piano. Il piano è privato; si condivide solo il completamento che scegli tu.
**Integrazioni opzionali:** Strava (OAuth), import GPX/TCX/Apple Salute `export.xml`, Coach AI (Cloudflare Workers AI). Vedi [docs/INTEGRAZIONI.md](docs/INTEGRAZIONI.md).

## Avvio rapido

Requisiti: Node ≥ 22.13.

```bash
npm install
npm run dev          # API su :8787 + client su :5173 (con proxy /api)
```
Apri http://localhost:5173. Per provare il flusso completo con le email in locale:
```bash
MAIL_PROVIDER=outbox MAIL_OUTBOX_FILE=./data/outbox.jsonl APP_URL=http://localhost:5173 npm run dev:api
# i link di recupero/verifica compaiono in data/outbox.jsonl (mai usare in produzione)
```
Senza il server l'app parte in **modalità demo** (dati solo sul dispositivo, nessun account reale, chiaramente segnalata).

Produzione:
```bash
npm run build && npm start     # serve client + API su $PORT
```

## Backend

Server Node senza dipendenze di runtime (`server/`), persistenza su file JSON atomico (`DATA_FILE`). Le regole di business sono in `shared/` e sono **le stesse** usate dalla demo locale: il server è l'unica fonte di verità. Per ogni richiesta: sessione dal cookie `HttpOnly`, controllo origine (CSRF), rate limiting, validazione server-side, intestazioni di sicurezza e CSP.
**Limite noto:** un solo processo con file JSON è adatto a un gruppo piccolo (decine/centinaia di utenti); per crescere va sostituito con un database (l'interfaccia `DbState`+`shared/api.ts` è pensata per questo). Su hosting a disco effimero i dati vanno persi: monta un disco persistente.

Variabili d'ambiente: vedi [.env.example](.env.example). Nessun segreto nel client o nel repository.

## Test

```bash
npm test             # unit + integrazione server (125 test)
npm run build && npm run test:e2e    # browser reale (Chromium) con servizi esterni simulati
```
`test:e2e` usa Chromium già installato (`CHROMIUM_PATH` per cambiarlo) e salva gli screenshot in `test-results/`.

## Struttura

`shared/` dominio e regole (tipi, validazione, motore, sfide, statistiche, percorsi, allenamento, generatore piani, importatori) · `server/` API, auth, Strava, geo, meteo, AI · `worker/` Cloudflare Worker del Coach AI · `src/` client React · `tests/`, `scripts/` test e strumenti.

## Funzioni future a pagamento (non attive)

Nessun pagamento è implementato. Il codice è predisposto per estendere, senza limitare le funzioni gratuite: gestione avanzata di più club, strumenti per palestre, report aggregati, branding dei club, eventi sportivi organizzati. Non si vendono dati personali.

## Privacy

Pagina `/privacy` nell'app (bozza coerente con le funzioni attive: **da completare con i dati del titolare e far revisionare** prima di un uso pubblico).
