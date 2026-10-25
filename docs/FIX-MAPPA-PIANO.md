# Correzioni mappa, registrazione e piano

Branch: `claude/podismo-social`.

> Note storiche del commit remoto 73e7e43. La revisione di integrazione conserva il replay stabile RouteReplay.tsx e routeGeometry.ts richiesto dall’utente: la riscrittura del componente descritta sotto non è stata adottata. Per i GPS interrotti ActivityRouteReplay mostra segmenti nativi separati, senza replay del vuoto; per le tracce continue usa il componente esistente. Google usa il flusso HTTPS compatibile con Expo Go descritto in GOOGLE-MOBILE.md. Le nuove mappe e quelle precedenti condividono il consenso effettivo e la revoca; vengono esclusi 300 m attorno agli estremi. Il resoconto aggiornato della revisione è REVIEW-2026-10-25.md.

- Mappa attività: linee e punto animato in coordinate native, senza proiezione SVG disallineata. Zoom, trascinamento, inquadratura del percorso. Le nuove pause e interruzioni hanno segmenti separati, preservati nel campionamento e dal server. Le vecchie tracce senza dati sulle interruzioni non sono ricostruibili.
- Registra: centratura GPS, posizione in corso, avvio compatto fuori dall'area scrollabile. Premere il pulsante posizione per consentire il GPS; se già concesso, centratura automatica. Pressione prolungata su una destinazione per un giro a piedi dalla propria posizione e ritorno tramite il servizio di routing configurato. Non è navigazione turn-by-turn.
- Ritmo: scarpa SVG animata con vento dipendente dal passo, rispetta Riduci movimento.
- Piano: spunta reversibile senza creare attività, chilometri, tempi o record. Salto disponibile. Inserimento manuale nascosto e misure effettive vuote. Briefing saltabile e distinzione tra dichiarazione e registrazione; invalidazione della vecchia cache e dopo modifiche del log.
- Calore: consenso distinto dal GPS e dalla visibilità ai compagni; attività salvate negli ultimi 90 giorni entro 5 km, celle arrotondate, almeno tre persone, esclusione dei punti entro 200 m dagli estremi. Nessun nome o orario restituito. Revoca dal menu attività o eliminando il log. Nessun invio continuo della posizione in diretta.
- Compagni: rimane il riconoscimento esistente sui percorsi salvati secondo le preferenze di condivisione. Non prova la presenza fisica.

## Verifica e rilascio

Test specifici in `tests/heatmap.test.ts`, `tests/training.test.ts`, `tests/brief.test.ts`, oltre alla suite esistente. Typecheck mobile/root, build web/server ed export iOS. Il lint Expo non era configurato: eseguito con configurazione temporanea, riscontra numerosi errori anche su HEAD (167). Configurazione e dipendenze temporanee escluse dalla modifica.

Serve il server aggiornato: prima server, poi app Expo, come in HANDOFF.md. Nessun deploy eseguito. Il routing richiede ORS o OSRM configurato per percorsi a piedi; altrimenti errore esplicito, senza percorsi inventati.

Da provare su telefoni reali: permessi, centratura, mappe Apple/Google, testo grande e schermi piccoli, GPS in movimento, pause/ripresa, perdita segnale e ripristino bozza offline. Il bundle non sostituisce queste prove. In Expo Go il GPS non registra con app chiusa/in background.

## Colori e tempi del replay

Nel dettaglio e nei racconti, la base del tragitto usa il colore dell’attività; viola per le uscite registrate con un gruppo o compagni rilevati dal server. I record su porzione hanno inizio e fine temporali interpolati sulla traccia GPS e il tratto è dorato; il punto di replay cambia colore mentre lo attraversa. Il principale riconoscimento dell’attività aggiunge un bordo nel colore ufficiale del badge con legenda: non viene attribuito a una posizione inventata. Le interruzioni escludono l’attribuzione di record su porzione.

Il punto e il disegno avanzano sui timestamp registrati. Il replay accelerato dichiara il fattore ×N e conserva i rapporti di velocità, anche tra giri differenti; nel dettaglio si può alternare il tempo reale 1×. Nei racconti rimane accelerato per rispettare la durata delle slide. Senza timestamp l’animazione è basata sulla distanza e dichiarata come tale; non è una riproduzione del passo reale. Il GPS perduto non viene interpolato e il punto aspetta fino al successivo dato disponibile. La precisione resta quella dei punti GPS acquisiti, senza correzioni automatiche sulle strade.

Verifiche aggiuntive: 45 test su replay, geometria, marker e record superati; typecheck mobile/root e build web/server superati. Il nuovo componente RouteReplay passa il lint; nelle schermate dei racconti restano due segnalazioni preesistenti. Da verificare fluidità e corrispondenza visiva su telefono reale.

## Configurazione iniziale e ripresa dopo il blocco

I nuovi account ricevono sei slide: benvenuto, nome e misure private facoltative, Strava/importazioni, GPS, riconoscimento dei compagni e mappe di calore. Ogni scelta può essere saltata. I progressi sono salvati sul server; condivisione del gruppo e calore restano scelte distinte e sono usate come preferenze delle nuove attività. Peso e altezza non sono esposti nei profili pubblici e non alimentano stime di calorie o diagnosi. Alla fine si può aprire subito la creazione del piano. Gli utenti esistenti possono rivedere il tutorial dalle impostazioni.

La registrazione smonta la mappa quando l’app diventa inattiva e la ricrea al ritorno dal background. Ferma la sottoscrizione GPS e la riavvia in primo piano con il permesso già concesso, evitando sottoscrizioni pendenti dopo la pausa o lo smontaggio. Conserva il tempo e marca i tratti non registrati, senza inventare tragitti. Le scritture delle bozze sono serializzate, inclusa la cancellazione. Il blocco dei comandi conserva le metriche visibili; non usa più una grande copertura scura. Una schermata di recupero sostituisce il vuoto in caso di errore JavaScript della registrazione. Gli errori di rete nell’aggiornamento del profilo non azzerano più la sessione.

Queste correzioni coprono problemi trovati nel codice, ma senza riprodurre il problema sul telefono non dimostrano che ogni causa della schermata nera sia stata eliminata. La registrazione continua del GPS a schermo bloccato non è implementata in Expo Go: serve una build nativa con supporto background dedicato. Nessun rilascio effettuato.

Verifica: 306 test passati, typecheck mobile/root, build web/server. Lint pulito per i file della configurazione iniziale e della gestione di ripresa modificati. Necessaria prova reale su iPhone/Android: blocco di sistema e dei comandi, sblocco, chiamate, permesso negato, apertura di Strava, logout/login e ripresa del tutorial, chiusura forzata con recupero bozza.

## Accesso Google mobile

Aggiunto il pulsante Continua con Google in accesso e registrazione. Integrazione con SDK nativo, token verificato dall’endpoint Google già esistente e nuova sessione nel provider dell’app. I nuovi utenti passano dal tutorial. Nessuna autenticazione locale fittizia. Il modulo non viene importato in Expo Go e manca una configurazione reale: il pulsante spiega il limite e mantiene email/password disponibili. Configurazione e rilascio descritti in GOOGLE-MOBILE.md.

## Permessi nel contesto e coerenza delle schermate

Il tutorial ora spiega la posizione senza chiederla. La richiesta di sistema è centralizzata e parte soltanto da un’azione esplicita: centrare la mappa, cercare uscite vicino a sé o avviare una registrazione all’aperto. Avvio indoor, riapertura e ripresa in primo piano non aprono dialoghi GPS. Un permesso già concesso o non più richiedibile non viene chiesto di nuovo. Le impostazioni del telefono si aprono soltanto con un tocco dell’utente. La decisione sul permesso avviene prima dell’inizio del cronometro.

Strava viene autorizzato solo dopo il tocco su Collega Strava; un annullamento è mostrato come informazione e non come successo. Gruppo e mappe di calore restano scelte separate e facoltative, senza richieste di sistema. Nessun nuovo permesso notifiche, salute, contatti o tracciamento.

Slide più brevi, illustrazioni concettuali per ciascun tema, superfici e colori dai token dell’app, transizioni di 300 ms con direzione avanti/indietro, pulsante principale stabile e feedback sul collegamento reale. Lo stesso ingresso leggero è usato in accesso/registrazione. Le animazioni decorative sono sul thread UI e sono spente con Riduci movimento; i campi non si rianimano mentre si scrive. Illustrazioni dichiarate come Come funziona, senza dati di attività simulati.

Nuovi test della policy GPS: tutorial/ripresa senza prompt, azioni esplicite con prompt, permessi concessi/bloccati e rispetto del rifiuto. Lint e typecheck dei componenti modificati verificati. La verifica del layout e della fluidità su telefono reale resta necessaria; nessuna pubblicazione eseguita.

## Introduzione prima dell’accesso

Prima dell’accesso compaiono cinque slide sulle funzioni effettive: piano, tracciato GPS, community e riconoscimento dei compagni, progressi/record e importazione Strava. I pulsanti Registrati e Accedi rimangono visibili e aprono il modulo nella modalità corretta. Dopo una registrazione riuscita parte la configurazione iniziale già prevista, fino al pulsante di creazione del piano. Nessun permesso di sistema viene richiesto dalle slide promozionali.

Le slide avanzano ogni 7 secondi; si possono selezionare manualmente e fermare. Autoplay spento in background, fuori dalla schermata, con lettore di schermo o Riduci movimento. Il tocco sui selettori e lo scroll sospendono l’autoplay. Le animazioni decorative vengono smontate quando si apre l’accesso.

Verifica in browser a viewport telefono: prima apertura → introduzione → Registrati → modulo di creazione account, senza errori JavaScript. Registrazione e passaggio al tutorial verificati con API simulate, senza creare utenti reali. Preview locali in /workspace/runngo-intro-preview.png e /workspace/runngo-register-preview.png. I bundle iOS, Android e web sono esportabili; resta richiesta una prova nativa su telefono.

Controllo aggiuntivo: flusso completo introduzione → Registrati → account simulato → tutorial → creatore del piano verificato in browser mobile, senza errori JavaScript. Lo script ripetibile è `scripts/e2e-mobile-welcome.mjs` (dopo export web e server statico su localhost:8898). Corretto anche il guard delle rotte: tutte le schermate dell’app sono ora nel ramo autenticato e completamento configurazione; le rotte implicite non possono più scavalcare il tutorial. I pulsanti hanno etichette accessibili esplicite, senza leggere i glifi delle icone come parte del nome.

Verifica prima del commit: 318 test superati in 31 file, typecheck mobile e build web/server superati, `git diff --check` pulito. Lint eseguito sui file mobile modificati con configurazione Expo temporanea: i nuovi file e le nuove schermate non riportano errori; nei file esistenti restano 63 errori e 9 avvisi, con conteggi identici al contenuto di HEAD negli stessi file. Export iOS e Android già completati. Il rilascio resta subordinato all'autenticazione Google Cloud e al deploy del server prima dell'aggiornamento Expo.
