# Runngo — piano semplificato, due temi e barra iOS 26

## Modifiche

- `RouteReplay.tsx`, `shared/replayChunks.ts`: punto e linea avanzano dallo stesso clock con `requestAnimationFrame`. Le porzioni completate vengono inviate alla mappa una volta; durante l'avanzamento cambia soltanto la punta, in blocchi fino a 65 campioni. Nessun aggiornamento React per ogni frame e nessuna seconda animazione indipendente del punto. Rimangono i vuoti GPS. Gli stalli vengono limitati a 50 ms di avanzamento per frame; in background il replay si ferma.
- Partenza visibile e animata prima del disegno; arrivo visibile e animato soltanto al termine. Se coincidono o distano meno di 20 metri, l'arrivo sostituisce la partenza anziché sovrapporsi. Con Riduci movimento il percorso è statico e un solo indicatore “Partenza e arrivo” rappresenta il punto comune. `PlanCalendar.tsx` e `routeGeometry.ts` invariati.
- `theme.ts`, `_layout.tsx`, `impostazioni.tsx`, `ui.tsx` e stili dei componenti evento: due temi, **Scuro e Chiaro**, salvati sul dispositivo. Accento neutro, senza turchese; colori delle attività distinti. Gli stili dichiarati prima del cambio di tema aggiornano i colori. Anche mappe, selettore data, status bar e interfaccia nativa seguono la scelta. Rimosso l'accesso alla selezione degli accenti personali del profilo.
- `LiquidBar.tsx`, `(tabs)/_layout.tsx`, `PlanDashboard.tsx`: barra flottante a capsula per navigazione principale e piano. Usa **GlassView nativo su iOS 26** con il modulo Expo già presente, senza nuove dipendenze. Rispetta Riduci trasparenza e usa una capsula opaca sugli altri sistemi. Colore e selezione coerenti nei due temi.
- `PlanDashboard.tsx`, `allenamento/index.tsx`: calendario settimanale fisso, allenamenti del giorno con fascia colore, elenco settimanale, approfondimenti, panoramica e gestione del piano. Rimosse spiegazioni superflue e il check-in separato; eliminato `CheckIn.tsx`. I dati privati storici e le API precedenti restano compatibili.
- `SkipWorkout.tsx`, `shared/skipReasons.ts`, `shared/training.ts`, `shared/types.ts`: “Salta” chiede direttamente il motivo: Non ho tempo, Infortunio o dolore, Non sto bene, Sono stanco, Sono in vacanza, Altro. Il motivo resta nell'allenamento privato. Non crea un check-in, non modifica automaticamente altri allenamenti, non entra nel feed. Si può rimettere l'allenamento in programma; il motivo viene cancellato al ripristino. Validazione server, proprietà dell'allenamento e protezione di attività già completate/collegate.
- `allenamento/sessione/[id].tsx`, `LinkWorkout.tsx`: dettaglio con data, titolo, tipo e soli dati disponibili; azione di registrazione fissa in basso, Collega attività, Salta con motivo e opzioni secondarie raccolte. Il collegamento propone soltanto attività reali compatibili attraverso le regole API esistenti. Nessuna attrezzatura, esercizio o durata aggiunti se assenti.

## Bug trovati e risolti

- Punto e linea precedenti avevano clock/interpolazioni diversi: ora un unico campione alimenta entrambi.
- Gli indicatori si coprivano sui circuiti chiusi: arrivo differito e sostituzione al termine.
- Il disegno imperativo avrebbe potuto venire cancellato da un render React: la proprietà iniziale vuota delle linee ha ora un riferimento stabile.
- La versione web non espone `Appearance.setColorScheme`: chiamata protetta dopo un crash scoperto nella prova browser.
- Con i tipi React Native caricati anche dai test, il timer server assumeva il tipo browser: `unref` ora viene chiamato soltanto dopo controllo della funzione disponibile.

## Verifiche

- Typecheck root e mobile: passati.
- **459 test in 59 file, tutti passati**, incluso encoder MP4 reale. Nuovi casi: blocchi del replay e continuità dei campioni, interruzioni, circuiti chiusi, Riduci movimento, avanzamento dopo uno stallo, due temi e stili preesistenti, salto/ripristino/proprietà/motivo non valido.
- Build web/server ed export Expo iOS/web: passati.
- Lint mirato delle schermate nuove/modificate del piano, tema, replay e barra: pulito. La scansione più ampia segnala ancora regole React Compiler preesistenti in `ui.tsx`, `EventDials.tsx` e nel creatore dei componenti del profilo; non si dichiara lint globale pulito.
- `scripts/e2e-mobile-plan.mjs`: passato a 375 × 812 con testo 135%, testata fissa, tutte le settimane, passaggio a Chiaro con persistenza, salto con motivo, dettaglio allenamento, nessun errore JavaScript. Confrontati i render `test-results/plan-*.png` e `workout-light-detail-375.png`. Solo dati di prova locali.

## Limiti verificati

Nessun dispositivo fisico collegato (`adb devices` vuoto); nessun iPhone accessibile. I test verificano sequenza, dati e carico degli aggiornamenti del replay, ma **non certificano gli FPS sul telefono né l'aspetto effettivo del vetro iOS 26**. Il browser mostra il fallback opaco, non il materiale nativo. Il confronto grafico è stato effettuato nei render mobile del browser, non è una certificazione pixel per pixel su iPhone.

## Commit

`f163cd4` motivi del salto; `96942aa` temi e Liquid Glass; `ffc7ea1` piano e rimozione check-in; `3d4c8d9` replay sincronizzato e percorsi chiusi.

## Pubblicazione

Server rilasciato prima di Expo: **podismo-social-00026-n95**, 100% traffico. Health e risorse Google mobile/page e mobile/client.js: HTTP 200.

Expo iOS main, runtime 1.0.0, codice **3d4c8d9**, gruppo **0e097b9f-d670-4846-92a7-79af4ef22f1c**, update **01a17d97-1b80-7937-a582-4a4bbc238c06**. [QR aggiornato](runngo-expo-plan-glass-2026-10-27.png).
