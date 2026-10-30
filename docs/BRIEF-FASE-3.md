# Runngo — brief fase 3 (28 ottobre 2026)

Per chi lavora sul codice. Leggi prima `docs/HANDOFF.md`. Le immagini di riferimento sono in `docs/mockups/` (01–10). Questo brief **riassume e mette in ordine** le richieste dell'utente, che in parte si contraddicono: dove serve una sua decisione è scritto "DECISIONE".

## Regole che valgono sempre
- Testi in italiano. Mai dati inventati (niente foto, persone, record, percorsi, numeri di esempio). Mai errori tecnici mostrati.
- Animazioni fluide, che rispettano "Riduci movimento", senza salti di layout.
- Niente nuove dipendenze se non servono. Mai segreti nei file.
- Commit piccoli dopo ogni parte funzionante. Prima del rilascio: `npx tsc --noEmit -p .`, `npx tsc --noEmit` in `mobile/`, `npx vitest run`, `npm run build`. Rilascio: prima il server, poi `eas update`, poi il QR.
- Immagine `10-...NO-carosello-viola.jpg`: la versione barrata con sfondo viola/rosa e carosello **non** va fatta. Lo "sfumato rosa-turchese" dei pulsanti nelle immagini 08 non va usato così com'è: l'utente nota che Strava lo usa per attirare l'attenzione, quindi usare un solo gradiente sull'azione primaria della schermata, non su ogni pulsante.

## Priorità 1 — Bug rilevati negli screenshot (05 e 06)
1. **Pulsante blu con ingranaggio** sopra le schermate (si vede in 05 e 06): è l'icona degli strumenti di Expo Go, non è codice nostro. Verificare che non sia un elemento dell'app; se lo è, rimuoverlo. Se è di Expo Go, dirlo all'utente (si nasconde dal menu agitando il telefono).
2. **Traccia GPS disallineata e sdoppiata** nella mappa dell'allenamento (06): la linea non coincide con le strade e si vedono tracce fantasma. Cercare la causa alla fonte: livello SVG sovrapposto a `react-native-maps` in `RouteReplay.tsx` e `routeGeometry.ts` (proiezione dalla regione, `onRegionChangeComplete`, padding, safe area, ridimensionamento della mappa), e polilinee nativa + vettoriale entrambe visibili. Una sola traccia nitida turchese con bordo scuro; niente copie trasparenti. La traccia deve restare ancorata durante zoom, rotazione, cambio giro e schermo intero. Spezzare la linea (tratteggio) dove manca il segnale: mai collegare con una retta punti lontani. Aggiungere "Centra percorso", selettore "Tutto / Giro 1 / Giro 2…" e tipo di mappa. Non modificare i dati GPS originali; il map matching, se c'è, resta separato.
3. **Unità duplicata** "13:06 /km /km": mostrare "13:06/km". Etichette "Passo 7:00/km" nelle card per non confonderle con un orario.
4. **Data della creazione uscita** non coerente con "Domani" in Home: verificare timezone e giorno della settimana.
5. **Registrazione che si perde** se l'app viene chiusa durante l'allenamento: tracking in background e ripristino della sessione (`mobile/src/app/registra.tsx`, `mobile/src/lib/recording.ts`). Conteggio passi affidabile.
6. **Registra**: la mappa parte da scala continentale mentre "cerco il GPS". Mostrare uno stato compatto con precisione, centrare la mappa appena c'è la posizione, nascondere la mappa di calore finché non ci sono dati. Il pulsante Avvia deve dire "Attendo GPS", "Precisione bassa" o "Pronto" ed essere l'azione dominante.
7. **Contenuto sotto la barra inferiore** e padding/safe area dove tagliato (tab Medaglie).

## Priorità 2 — Creazione uscita (il flusso va semplificato)
Problemi segnalati dall'utente, da correggere tutti:
- Data e ora sono **tagliate a metà**: il passo "Quando e dove" deve stare in **una sola pagina** senza scroll eccessivo.
- Al passo 2 l'app **richiede di nuovo "cosa vuoi fare"**, già scelto al passo 1: non ripetere.
- "**Solo link**" e club insieme non hanno senso: sono scelte alternative (pubblica / club / solo link), mai combinabili.
- Le **card dei club sono troppo larghe** e costringono a scorrere: più strette (non troppo), compatte; la **foto del club** non deve essere ambigua: scegliere una sola forma (tonda **oppure** quadrata con angoli arrotondati, la stessa ovunque).
- **Ricerca della località**: premere Invio non è intuitivo. Mettere una **lente di ingrandimento** ben visibile come pulsante di ricerca. Aggiungere "Usa la mia posizione" (GPS), ricordare la posizione abituale, e **non sostituirla** se per una singola uscita se ne usa un'altra (chiedere se renderla predefinita).
- **Il ritmo non funziona**: toccandolo non appare nulla. Verificare e correggere `EventDials.tsx` (PaceDial).
- **La barra del livello** va **trascinata**, non solo toccata: il tocco da solo non deve bastare né essere l'unico modo.
- **Figure umane** (`SportIcon.tsx`, `activityFigure.ts`): vanno rifinite, sono ancora poco credibili e si ripetono sempre uguali. Anatomia semplificata ma credibile (busto, bacino, arti, articolazioni), pose da vera corsa, riconoscibili a 24–32 px, famiglia visiva unica per corsa, camminata, trail e corsa+camminata, con variazioni di corpo/abbigliamento (vedi 07, a destra: stile di riferimento). Il movimento deve dipendere dal **livello scelto**: più alto = più veloce, falcate più frequenti, vento. Passando da corsa a camminata la figura deve **rallentare in modo realistico e cinematografico** (transizione continua della fase, non uno scatto).
- **Scelta del tipo di attività animata**: ogni tessera (Corsa, Camminata, Trail, Corsa+camminata, Altro) deve avere un'animazione **dentro il suo quadrato** quando viene toccata: particelle o grafiche astratte coerenti col tipo.
- Tutte le scelte devono essere **veloci e facili da premere, senza spostare molto lo sguardo**: bersagli grandi, poche mosse, contenuti raggruppati per pagina.
- Preset ("Organizza un'uscita" come in 09): griglia di quadrati arrotondati con colori e grafiche diverse; il primo **consigliato dal profilo reale** del runner (passo abituale, frequenza, distanze recenti). Dopo la scelta, riepilogo a lista (freccia indietro + conferma) con modifica di una singola voce. Il campo del patto "punti di ricompattamento" compare solo se serve.
- Card del club nel passo "per chi": una vera card con immagine (solo se esiste), nome, descrizione breve, membri.

## Priorità 3 — Racconti, Allenamento, Profilo, Home
- **Racconti ridotti non mostrano niente**: devono avere **anteprime** reali (percorso vero animato se c'è il GPS, altrimenti decorazione dichiaratamente astratta). I racconti appartengono alla **pagina dell'Allenamento**, non ai tab del Profilo (nel Profilo resta solo "Racconti salvati" come raccolta secondaria).
- **Pagina "Allenamento"** unica (niente "Dettagli attività" separata, niente pulsante "Andamento"): intestazione, mappa corretta, tre dati principali, card **"Con chi hai corso"** (con stati: uscita di gruppo / persone collegate / corsa in solitaria come scelta valida / importata da Strava con azioni "Aggiungi compagni", "Collega a un'uscita", "Condividi"), Racconto animato ("Guarda il Racconto"), analisi sintetica con tono neutro (no "58 s/km più lento"), giri e andamento già nella pagina, traguardi (una riga se non ce ne sono), collegamento al piano, dati tecnici espandibili, menu "…" con modifica, privacy, esporta, elimina, "Segnala percorso errato". Mai partecipanti dedotti dalla sola vicinanza GPS. Etichetta "Importato da Strava/Nike Run Club" discreta.
- **Feed degli amici**: mostrare anche il **tragitto animato** (miniatura del percorso reale, solo se l'attività è condivisa).
- **Home** (07, 09): fascia orizzontale di uscite grandi + passaggio a lista; il banner "Ultime novità" diventa **temporaneo e chiudibile**, solo dopo una sincronizzazione Strava con novità (quanti allenamenti, sincronizzati e salvati, controlla/ignora). Card uscite diverse per tipo (del club, pubblica, consigliata, quasi piena, già iscritto). Il tasto per iniziare ("Inizia e registra") deve essere **molto più evidente**.
- **Registra**: allenamenti già pronti da provare (preset del piano) con più priorità.
- **Profilo**: avatar, nome, città, livello, affidabilità, gruppi; **Impostazioni solo nell'ingranaggio** in alto (non duplicata); tab **Attività / Progressi / Reputazione** (Racconti fuori dai tab); lista cronologica compatta con miniatura del percorso. "Fama" → nome più chiaro (proposte: Reputazione, Affidabilità, Presenza nella community), con spiegazione di come si ottiene e senza metriche manipolabili.
- **Navigazione**: 4 voci (Home, Esplora, Registra, Community); il tab Social entra nella Home; Club → Community (gruppi suggeriti, ricerca compagni, uscite, percorsi). DECISIONE: confermare con l'utente prima di cambiare i tab, è un cambio grande.
- **Colori**: turchese = azione primaria/attivo; viola = allenamento/progressi; verde = gruppo/conferme; arancio = obiettivi/record; blu = percorsi; corallo = avvisi. 70% neutro, 20% contesto, 10% accento; gradienti solo sulle card importanti. DECISIONE: l'ultimo prompt dell'utente dice di abbandonare il turchese e usare accenti neon, mentre il precedente lo conserva come brand. Chiedere all'utente quale preferisce prima di cambiare la palette.
- **Testi**: "Metti le nove settimane nel tuo piano" ecc. e testi lunghi del briefing da accorciare (una frase, un confronto, una raccomandazione).

## Priorità 4 — Funzioni nuove (grandi: una per volta, con conferma)
1. **Mappe di calore, notturna, "più popolata"**: è il cavallo di battaglia. Servono dati reali aggregati e anonimi (solo attività pubbliche/condivise, con soglia minima di contributi per non identificare nessuno; mai tracce private). Proporre un'architettura (aggregazione server in celle, privacy) e chiedere conferma prima di scrivere codice. Finché non ci sono contributi locali, non mostrare la mappa.
2. **"Creato per te"**: allenamenti e uscite proposti con **criteri reali** (storico, carico recente, passo, livello, disponibilità e, se connesso, dati del profilo Strava come attrezzatura/scarpe). Solo dati effettivamente accessibili via API (non aggirare i limiti). Spiegare sempre il perché del consiglio.
3. **"Chi seguire"** (social): suggerimenti basati su compatibilità reale (zona, passo, club in comune, orari), mai profili inventati.
4. **Onboarding da link WhatsApp**: l'invitato inserisce solo il nome ed entra nell'uscita; la registrazione completa viene proposta dopo, in modo graduale. Richiede account ospite sul server e deep link: proporre il design e chiedere conferma.
5. **Posizione "live" degli amici**: solo con consenso esplicito e revocabile; proporre prima il design.
6. **Medaglie 3D e fisiche con acquisto esterno**: grandi, fuori ambito per ora. Il pagamento deve avvenire fuori dall'app (link web). Solo analisi e proposta, nessun codice finché l'utente non conferma. DECISIONE.
7. **Android**: l'app è già Expo, quindi compila anche per Android. Verificare in seguito con una build di sviluppo.

## Ordine di lavoro consigliato
1. Priorità 1 (bug GPS, unità, data, registrazione).
2. Priorità 2 (creazione uscita) con prova a ogni passo.
3. Priorità 3 (Allenamento, racconti, Home, Profilo).
4. Poi, una alla volta e dopo conferma, le funzioni della priorità 4.
5. Dopo ogni blocco: controlli, commit, rilascio server, `eas update`, QR.

Alla fine di ogni blocco riporta: cosa hai cambiato e dove, bug trovati e risolti, test eseguiti, cosa non hai potuto verificare (nessun dispositivo reale) e le decisioni che servono all'utente.
