# Runngo — Community e GPS, 26 ottobre 2026

## Rilascio

- Branch: `claude/podismo-social`. Commit del codice mobile: `e236e79`. Commit separati per i blocchi; backup `67c2c5f` preservato.
- Server pubblicato **prima dell’app**: Cloud Run `podismo-social-00023-pg2`, 100% del traffico.
- Verificati sul server live: `GET /api/health`, `GET /api/auth/google/mobile/page`, `GET /api/auth/google/mobile/client.js`: tutti HTTP **200**. Accesso Google reale non provato con un account dell’utente; il consenso resta In test.
- Expo Go iOS, branch `main`, runtime `1.0.0`: gruppo `453b6fc8-2f9a-4bfb-abb2-ab6a406fd4ac`, update `01a177b4-9e4b-7bbe-b7f2-6a4a745e0f01`.
- [Aggiornamento Expo](https://expo.dev/accounts/mikifikone/projects/runngo/updates/453b6fc8-2f9a-4bfb-abb2-ab6a406fd4ac).
- [QR Expo Go](runngo-expo-community-2026-10-26.png).

## Struttura e ragioni delle schermate

| Schermata | Ordine e azione principale | Stato senza dati / componenti / colore |
|---|---|---|
| Home | Prossima uscita o seduta del giorno; uscite disponibili orizzontali oppure elenco; aggiornamenti; riepilogo personale. Partecipa o trova un’uscita. | Nessun dato finto: invito a trovare un gruppo. `GroupRunCard`, `EventCard`, `CommunityStream`. Turchese per l’azione; aggiornamenti Strava solo dopo importazione effettiva, chiudibili. |
| Community | Prossime uscite dei gruppi, suggerimenti di compagni reali, propri gruppi, organizzazione e accessi a percorsi/sfide. | I club sono su invito: codice o creazione, senza directory inventata. `CommunityUpcoming`, `RunnerSuggestions`, `ClubCard`. Conferme verdi; azioni secondarie neutre. |
| Esplora | Uscite/Percorsi, ricerca, filtri visibili, conteggio, mappa/elenco. Aprire un risultato o organizzare. | Filtri e posizione nello stato del contenitore; mappa solo da coordinate reali di ritrovo o geometrie accessibili. Nessun punto ricavato dalle attività private. Blu per i percorsi. |
| Registra | Stato GPS locale compatto, mappa appena disponibile, attività selezionabile, riepilogo privacy/contesto/obiettivo, Avvia. | Nessuna vista continentale durante l’attesa. Avvio con GPS non pronto richiede una scelta consapevole. La pagina iniziale resta **senza ScrollView**, opzioni nella card apribile; avviso heatmap spostato nei livelli. Layout compatto su finestre basse e testo grande. |
| Profilo | Identità e gruppi, follower reali, modifica; Attività/Progressi/Reputazione; archivio Racconti e collezione secondari. | Impostazioni soltanto nell’ingranaggio superiore. Record/costanza separati da contributi/riconoscimenti. Nessun punteggio di affidabilità o puntualità inventato. Piano raggiungibile da Progressi. |
| Allenamento | Mappa, identità e provenienza, tre metriche, contesto sociale, Racconto, briefing, piano e statistiche inline. | Sempre uno stato sociale esplicito; collegamento a uscite reali compatibili; menu per modifica, condivisione, segnalazione GPS ed eliminazione. La metodologia è espandibile; nessun pulsante separato Andamento. |

La barra principale ha quattro comandi: **Home, Esplora, Registra, Community**. Profilo dall’intestazione Home; vecchi collegamenti Social rimandano alla Home; sfide dalla Community. Il comando Registra non pulsa e non sovrasta le altre sezioni.

Creazione: proposte dichiarate come bozze, con gruppo e patto proposti e livello stimato. La proposta personale compare solo con almeno tre corse proprie degli ultimi 60 giorni, usando mediane di distanza e passo; non usa dati Strava. Scelta → riepilogo; righe modificabili riaprono il passo pertinente. Se il ritrovo manca, l’azione richiede di confermare quando e dove. GPS esplicito, precisione visualizzata e ritrovo abituale locale salvato soltanto premendo l’apposita azione: una posizione occasionale non lo sovrascrive.

## Bug corretti

- **Tracciato traslato e linee fantasma:** tolta la proiezione SVG sovrapposta alla mappa. La traccia è ora una Polyline nativa per ciascun segmento continuo, con punto mobile nativo su coordinate geografiche. Zoom, rotazione e cartografia condividono lo stesso sistema di coordinate. Nessun map matching o spostamento dei dati per farli coincidere con le strade.
- **Salti e interruzioni:** `displayTrack` crea soltanto una vista filtrata, scarta coordinate non valide, tempi fuori ordine e salti impossibili e separa i buchi di segnale. I dati originali rimangono invariati. La soglia temporale tiene conto della frequenza dei campioni.
- **Replay alternativo incoerente:** `ActivityRouteReplay` delega allo stesso renderer nativo. Controlli Tutto/Giro, tipo mappa, centro e schermo intero; pausa e Riduci movimento. Il percorso completo resta visibile e il punto mostra l’avanzamento: non si dichiara una rivelazione progressiva della linea cartografica.
- **Passo duplicato e arrotondamento:** `fmtPace` aggiunge l’unità una sola volta; `formatPace` arrotonda il totale prima di separare minuti e secondi, evitando 5:60. Nelle card l’etichetta è Passo X/km.
- **Camminata/corsa mostrata come Corsa:** riconosciuto il tipo combinato, anche quando il titolo importato lo indica ma il vecchio tipo della seduta è generico. Nessuna modifica dei dati importati per questa correzione di presentazione.
- **Briefing giudicante e cache vecchia:** confronto «passo più tranquillo», istruzioni AI più brevi e versione del briefing aggiornata per rigenerare i testi precedenti.
- **Profilo affollato e impostazioni duplicate:** separazione delle tre schede, archivio secondario e rimozione del prossimo allenamento duplicato.
- **Avvisi heatmap e mappa globale prima del GPS:** mappa locale condizionata alla posizione, informazione sullo strato nel pannello secondario e stato di precisione esplicito.

Il collegamento `linkWorkoutEvent` verifica proprietario, iscrizione, stato dell’uscita e compatibilità entro sei ore. Non crea iscrizioni/presenze e non rende pubblica un’attività Strava. Ha test per autorizzazioni, orario, cancellazioni e privacy.

`PlanCalendar.tsx` e `routeGeometry.ts` non sono stati modificati. La nuova richiesta autorizzava esplicitamente la correzione di `RouteReplay.tsx`. La sorgente unica Riduci movimento già corretta resta invariata; i test passano. Le figure conservano il movimento continuo e aggiungono il bacino/abbigliamento agganciato alle stesse articolazioni.

## Verifiche eseguite

- `npx tsc --noEmit -p .`: **passato**.
- `cd mobile; npx tsc --noEmit`: **passato** sul codice finale.
- `npx vitest run`: **425 test in 52 file, tutti passati**.
- `npm run build`: **passato** (resta l’avviso Vite sulla dimensione del bundle web).
- Export Expo web e iOS: **passati**; il bundle iOS pubblicato viene dall’export `runngo-community-ios-release-20261026`.
- `scripts/e2e-mobile-welcome.mjs`: intro → registrazione → configurazione → piano, nessun errore JS.
- `scripts/e2e-mobile-community.mjs`: Home, quattro comandi, Community, schede Profilo e proposta → riepilogo, viewport **375 px**, nessun errore JS. Simulazione di testo al 135% nel riepilogo, senza overflow orizzontale.
- Screenshot browser verificati in `test-results/community-*.png` (ignorati da Git). I dati di prova sono esclusivamente fixture intercettate nel browser, mai inviate al server reale.
- Lint mirato dei nuovi componenti/renderer: nessun errore; rimangono warning stilistici. Il lint completo dell’app non è configurato; il preset Expo eseguito direttamente sul vecchio form segnala due regole React Compiler preesistenti sui setState negli effect. I typecheck e l’export non le trattano come errori.

## Limiti e punti non completati

Questa pubblicazione implementa la riorganizzazione e i difetti prioritari; **non esaurisce tutte le nuove funzioni descritte nel testo allegato**.

- Nessuna verifica fisica sull’iPhone disponibile in questa sessione: non considero provati il GPS durante corsa, la posizione durante zoom/rotazione, le prestazioni native, Dynamic Type iOS e Google con un account reale. Browser e test puri non sostituiscono questa prova.
- Non è presente una precisione per campione nei vecchi tracciati: non è possibile ricostruirla a posteriori. Il filtro elimina anomalie osservabili, non certifica l’accuratezza di ogni punto.
- Aggiunta/conferma manuale di singoli compagni e correzione delle persone rilevate: non implementate. La card sociale usa il collegamento esplicito a un’uscita; non attribuisce partecipanti basandosi soltanto sul GPS.
- Esportazione del Racconto come video e audio: non implementati; il Racconto resta silenzioso, navigabile, pausabile e condivisibile come riepilogo testuale. Nessuna nuova dipendenza nativa.
- La lista attività del Profilo è compatta, con tipo, data, distanza e durata, contesto individuale/gruppo e disponibilità del Racconto; resta da aggiungere la miniatura del tracciato a ogni riga. Le miniature effettive restano nell’archivio Racconti.
- La personalizzazione delle proposte usa lo storico effettivo disponibile, non un modello completo di carico/frequenza/preferenze del gruppo. Non attribuisce capacità sportive o tempi non misurati all’utente.
- La modifica dal riepilogo riapre il passo pertinente del wizard; non esiste ancora un editor separato per ogni singolo campo.
- Nuovi punteggi di puntualità, affidabilità e recensioni non sono stati introdotti: non esistono misure attendibili per alimentarli. Le reputazioni visibili derivano dai riconoscimenti già presenti.
- Non ho trovato un ingranaggio blu flottante globale nel codice dell’app. La sua origine nell’ambiente iPhone/Expo Go non è verificabile da questa sessione; non dichiaro di averlo rimosso.
- Le attività Strava restano nel solo archivio privato, senza pubblicazione nel feed o nella heatmap. [API Policy Strava, §2.3](https://www.strava.com/legal/api_policy) limita la visualizzazione dei dati al proprietario. Il banner offre controllo e chiusura, non una pubblicazione che il server già impedisce.
- HealthKit/Apple Salute, Garmin e Messaggi restano esclusi come richiesto. Nessuna modifica a token/segreti e nessuna nuova dipendenza.

## File modificati

```text
mobile/src/app/(tabs)/_layout.tsx
mobile/src/app/(tabs)/club.tsx
mobile/src/app/(tabs)/esplora.tsx
mobile/src/app/(tabs)/index.tsx
mobile/src/app/(tabs)/profilo.tsx
mobile/src/app/(tabs)/social.tsx
mobile/src/app/allenamento/log/[id].tsx
mobile/src/app/allenamento/storie/[id].tsx
mobile/src/app/evento/form.tsx
mobile/src/app/registra.tsx
mobile/src/components/ActivityRouteReplay.tsx
mobile/src/components/CommunityStream.tsx
mobile/src/components/ExploreMap.tsx
mobile/src/components/ProfileHeader.tsx
mobile/src/components/RecordingDiscovery.tsx
mobile/src/components/RecordingSetupFrame.tsx
mobile/src/components/RouteReplay.tsx
mobile/src/components/SportIcon.tsx
mobile/src/components/cards.tsx
mobile/src/components/event/FeatureRows.tsx
mobile/src/components/event/OutingProposals.tsx
mobile/src/components/ui.tsx
mobile/src/constants/theme.ts
mobile/src/lib/activityFigure.ts
mobile/src/lib/format.ts
mobile/src/lib/storyPalette.ts
mobile/src/lib/stravaSync.ts
scripts/e2e-mobile-community.mjs
server/ai.ts
server/index.ts
shared/brief.ts
shared/outingProposals.ts
shared/routeDisplay.ts
shared/time.ts
shared/training.ts
tests/activityFigure.test.ts
tests/activityPresentation.test.ts
tests/activityRouteReplay.test.ts
tests/brief.test.ts
tests/outingProposals.test.ts
tests/recordNavigation.test.ts
tests/routeDisplay.test.ts
tests/training.test.ts
```

I file personali già non tracciati nella workspace sono stati lasciati invariati. Non è stato effettuato un push del branch.
