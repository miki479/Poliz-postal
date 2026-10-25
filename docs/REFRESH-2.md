# Refresh 2.0 — diagnosi prima/dopo

Stato: **implementato** = codice scritto e controllato con typecheck, test del server e bundle iOS/Android. **Non verificato** = serve una prova su telefono (nessuna schermata è stata ancora vista girare dopo questo passaggio). I conteggi dei controlli sono stati fatti leggendo il codice, non con uno strumento.

## Tabella prima/dopo

| # | Schermata | Problema | Causa | Correzione | Criterio | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nuovo piano | Troppi campi in un unico scroll | Il modulo chiedeva nome, obiettivo, livello, giorni, minuti, settimane, attrezzatura, forza e mobilità insieme | Percorso a 7 passi, una domanda per passo; le scelte singole avanzano da sole; avanzamento visibile (n/7) | ≤ 7 controlli visibili per passo; "Indietro" non perde le risposte | Implementato |
| 2 | Obiettivo del piano | 9 opzioni piatte con lo stesso peso | Una sola lista di chip | Tre gruppi per scopo ("Per cominciare e stare bene", "Per correre meglio", "Per una gara"), ogni opzione con spiegazione | Massimo 3 opzioni visibili per gruppo | Implementato |
| 3 | Giorni disponibili | La riga andava a capo | Pulsanti di larghezza fissa (64 px) | Sette celle a larghezza flessibile in una sola riga, iniziale grande + sigla | Nessun a-capo a 320–430 px; altezza 64 px | Implementato, non verificato su schermo |
| 4 | Errore "Date value out of bounds" | Messaggio tecnico a schermo | `toISOString()` su una data non valida, mostrato così com'era | Controllo della data prima dell'invio (`checkDate`) + traduttore degli errori (`humanError`) applicato in 28 file | Nessun testo di errore in inglese o tecnico; errore accanto al campo | Implementato |
| 5 | Nuova uscita | 12 campi in un solo scroll (note, visibilità, patto, livello, posti, passo…) | Nessuna priorità tra campi frequenti e rari | 3 passi (Che uscita è? / Quando e dove? / Chi può venire?) + pannello "Dettagli" per distanza, passo, posti, note, percorso, patto | ≤ 6 controlli per passo; campi rari fuori vista | Implementato |
| 6 | Esplora (nessun risultato) | Stato vuoto senza azione | Solo testo | Una sola azione: "Organizza tu la prossima" (già presente dal refresh 1), testo che dice cosa cambiare | Ogni stato vuoto ha un passo | Implementato |
| 7 | Profilo e stile | 15 controlli e "Salva" fluttuante | Tutto in una pagina | Anteprima + 3 righe (Chi sei, Stile, Cosa mostri) che aprono pannelli; "Salva" compare solo se è cambiato qualcosa, in barra fissa | 3 controlli + Salva visibili (era 15) | Implementato |
| 8 | Ingranaggio blu su ogni schermata | Pulsante strumenti in alto | **Non è dell'app**: è il pulsante strumenti di Expo Go | Nessuna modifica possibile nel codice. Si nasconde da Expo Go (menu sviluppatore → "Hide tools button") e non esiste nelle build di sviluppo o di produzione | — | Non risolvibile nel repository |

## Controlli visibili (prima → dopo)

| Schermata | Prima | Dopo |
| --- | --- | --- |
| Nuovo piano | ~25 | 3–8 per passo |
| Nuova uscita | ~22 | 5–7 per passo |
| Profilo e stile | 15 + Salva | 3 righe (+ Salva se serve) |
| Home | 6 scorciatoie + eventi + feed | Protagonista + racconti + settimana + eventi (senza feed) |
| Social | racconti + suggerimenti + feed | suggerimenti + feed (racconti solo in Home) |

## Tap per le azioni quotidiane (prima → dopo)

| Azione | Prima | Dopo |
| --- | --- | --- |
| Avviare una corsa | Home → icona Registra → Avvia (3) | Invariato (3). Con una seduta oggi: Home → "Inizia e registra" (2) |
| Partecipare a un'uscita | Home → card → Partecipa (3) | Home → "Partecipa" sul protagonista (1–2) |
| Aprire il racconto dell'ultima corsa | Home → recap → racconto (3) | Home → quadrato racconto (2) |
| Creare un'uscita | 1 schermata lunga + Pubblica | 3 passi + Pubblica: **+2 tap** (compensati da un solo campo per schermata) |
| Creare un piano | 1 schermata lunga | 7 passi, 5 con avanzamento automatico: nessun tap aggiunto sulle scelte singole |

Cambiamenti strutturali (reversibili): navigazione a 5 destinazioni invariata; feed solo in Social, racconti solo in Home e nel riepilogo; impostazioni solo nel Profilo.

## Navigazione: nessuna riduzione proposta
Le tre destinazioni principali non bastano a coprire "trovare", "il gruppo" e "le persone" senza mescolarle: restano cinque. La duplicazione si risolve assegnando ogni contenuto a un solo proprietario (vedi sopra), non togliendo tab.

## Tipografia
Titoli di pagina 32 (display), corpo 16, secondario 14, numeri tabulari 26 (18 per i secondari), numeri live fino a 72. Valori in `mobile/src/constants/theme.ts`. Nota: in un messaggio precedente era stata chiesta una scala più piccola; questa estensione chiede titoli 32–40 e corpo 16. È stata applicata questa e basta cambiare il token per tornare indietro.

## Ancora da fare / non verificato
- Prova su iPhone di tutte le schermate modificate: larghezze 320/360/390/430, testo ingrandito al 200%, "Riduci movimento", tastiera aperta, orientamento orizzontale.
- Percorso a passi anche per: nuovo club, nuova sfida, nuovo percorso, nuova sessione (ancora moduli singoli).
- Conteggio dei controlli fatto a mano sul codice: serve una verifica con screenshot.
- Utente nuovo / con dati / senza club / in pausa: logica presente, scenari non provati a schermo.
