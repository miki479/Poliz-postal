# Replay progressivo e colori — 26 ottobre 2026

## Comportamento

- Il percorso parte senza linea: viene disegnato soltanto il tratto già raggiunto dall'animazione. Nessuna traccia completa sotto il punto animato.
- Rimossi play/pausa e selettori Tutto/Giro 1/Giro 2. Restano centra, livello mappa e schermo intero.
- Indicatori Partenza e Arrivo con tre sobbalzi decrescenti rispettivamente all'avvio e al raggiungimento della fine. Con Riduci movimento: percorso statico e indicatori fermi.
- Interruzioni GPS mantenute separate, nessuna retta inventata tra segmenti. Geometria di proiezione originale invariata.
- Corsa blu, camminata ambra, trail verde, forza rosa, mobilità lavanda; pulsante di registrazione e panoramica del piano viola. Card degli allenamenti con fondo nella tinta dell'attività. La mappa usa il colore dell'attività.
- Terminologia utente: allenamento/allenamenti al posto di seduta/sedute, compresi consigli del server e nomi delle nuove guide NHS. Non vengono riscritti i titoli di attività già salvate dagli utenti.

## File e commit

`f0ee882`: `mobile/src/components/RouteReplay.tsx`, nuovo `shared/replayDrawing.ts` e test. `routeGeometry.ts` e `PlanCalendar.tsx` invariati.

`355a697`: `activityColors.ts`, `PlanDashboard.tsx`, dettaglio attività, testi nelle schermate Home/Profilo/piano/guida/registrazione e componenti CheckIn/PlanChange/RecordingDiscovery, `lib/compat.ts`, `lib/plan.ts`, `shared/adaptive.ts`, `shared/beginnerRunning.ts`, `shared/records.ts`, `shared/training.ts`. Corrette anche sequenze di caratteri accentati mal codificate nel componente del piano.

`7a0d4de`: ultime etichette Home e guida.

## Verifiche

- Typecheck root e mobile: passati.
- Vitest: **452 test in 57 file**, tutti passati; inclusi nuovi casi per linea inizialmente assente, estremità interpolata, assenza di percorso futuro, lacune GPS e Riduci movimento.
- Build web/server: passata; solo avviso preesistente dimensione bundle web.
- Lint mirato RouteReplay, PlanDashboard, activityColors: pulito.
- Export iOS e web: passati.
- E2E piano a 375 px e testo 135%: passato, nessun errore JavaScript. Verificati i render della nuova palette in `test-results/plan-*.png`.
- Nessun iPhone fisico collegato: sobbalzo dei marker nativi e fluidità del disegno non osservati direttamente su iOS. I test verificano la geometria progressiva, non sostituiscono questa prova.

## Rilascio

Server rilasciato prima di Expo: **podismo-social-00025-nh5**, 100% traffico. Health e risorse Google mobile/page e mobile/client.js: HTTP 200.

Expo iOS main, runtime 1.0.0, codice **7a0d4de**, gruppo **4d1bc0ff-5ea0-4743-8c66-a51c29af90fe**, update **01a17918-b9fb-761f-8e51-cf17d8d77566**. [QR aggiornato](runngo-expo-replay-colors-2026-10-26.png).
