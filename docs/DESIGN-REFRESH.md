# Runngo — refresh UI/UX dell'app mobile

Ambito: app nativa `mobile/` (Expo SDK 58, expo-router, React Native). Il sito web (`src/`) non è stato riprogettato in questo passaggio.

## Diagnosi (stato prima del refresh)

**Da preservare**
- Account e sessione via cookie del server (Cloud Run + Firestore), uscite, club, sfide, percorsi, piani di allenamento, statistiche.
- Registrazione GPS con tracciato, replay del percorso, storie di fine allenamento, briefing (Coach AI o riepilogo a regole).
- Strava (OAuth lato server: importa data, distanza, durata, **senza tracciato**) e import file GPX/TCX/export di Apple Salute (nessuna lettura diretta di HealthKit).
- Tab bar di sistema (`NativeTabs`): su iOS recente prende il vetro del sistema, rispetta safe area e Dynamic Type.

**Da migliorare**
- Home: griglia/carosello di sei scorciatoie equivalenti, totali storici in primo piano, nessuna "prossima azione".
- Pesi visivi uniformi: tutto in card della stessa forma e raggio.
- Esplora: tre righe permanenti di chip che occupano metà schermo; posizione mai usata.
- Dettaglio uscita: azioni sparse, nessuno stato di successo, possibile doppio tap.
- Profilo: era una pagina di impostazioni (link e logout), non un'identità.
- Storie: senza pausa, senza controlli accessibili, avanzamento non disattivabile; il replay era una rivelazione grafica presentata come movimento.
- Briefing: testo unico, senza separare dati misurati, confronti e interpretazione AI.
- Contrasti: il viola del logo `#8268F5` non è leggibile come testo piccolo sulle superfici (4,15:1).
- Il "grande ingranaggio blu" degli screenshot è il **pulsante strumenti di Expo Go**, non parte di Runngo: sparisce nelle build di sviluppo/produzione e si nasconde dal menu sviluppatore di Expo Go.

**Richiesto e non presente (implementato ora)**
- Distintivi calcolati dal server sui dati reali (`shared/badges.ts`, metodo `listBadges`).
- Personalizzazione del profilo persistente (`User.style`: accento, cornice avatar, 3 distintivi in evidenza).
- Fatti strutturati del briefing restituiti dall'API (`/api/ai/brief` → `facts`).

**Bloccato da dati, API o permessi**
- Recap di gruppo e briefing pre-corsa: nessun dato aggregato per uscita né endpoint; non mostrati.
- Percorso delle attività Strava/file: l'importazione salva solo i riepiloghi.
- Apple Salute diretto (HealthKit): richiede modulo nativo, entitlement e build di sviluppo; non disponibile in Expo Go.
- Registrazione GPS in background: richiede build di sviluppo.
- Esportazione immagini delle storie: non c'è una libreria di cattura; la condivisione è solo testo con anteprima.
- Zone di privacy sui percorsi: i tracciati sono visibili solo al proprietario (`getWorkoutLog` è privato) e non vengono esportati, quindi oggi non c'è nulla da mascherare verso altri.

## Direzione

"Running club premium: energia atletica, chiarezza editoriale, calore sociale."

- **Una prossima azione per schermata.** La Home ha un solo protagonista contestuale (uscita imminente, recap appena pronto, sessione di oggi, invito a trovare un gruppo, primo passo).
- **Persone prima dei numeri.** Avatar dei partecipanti, organizzatore, club; i totali storici vivono nel Profilo.
- **Gerarchia editoriale.** Titoli forti, separatori e spazio al posto di card ovunque; card riservate a elementi tappabili.
- **Colore con regole.** Neutri dominanti, turchese per azione e selezione, viola solo per storie, identità e traguardi, verde solo per conferme.
- **Movimento che informa.** Pressione, apertura sheet e storie; niente animazioni decorative; rispetto della riduzione movimento.

## Destinazioni

| Tab | Responsabilità |
| --- | --- |
| Home | Ciò che conta adesso: prossima corsa o recap, settimana, anteprime da club e compagni |
| Esplora | Trovare uscite e percorsi: ricerca, "vicino a me" su richiesta, filtri in sheet |
| Club | I propri gruppi: identità, prossima uscita, obiettivo collettivo, partecipazione |
| Social | Attività dei compagni, racconti, sfide come sezione |
| Profilo | Identità pubblica, metriche, traguardi; impostazioni dietro un'icona discreta |

Registrare un allenamento: icona nell'header della Home, azione principale quando c'è una sessione oggi, pagina Allenamento.

## Token (`mobile/src/constants/theme.ts`)

Contrasti misurati (WCAG, rapporto):

| Colore | su bg `#101418` | su surface `#191F25` | su elevated `#222A32` | uso |
| --- | --- | --- | --- | --- |
| text `#F4F7FA` | 17,2 | 15,5 | 13,5 | testo |
| textSecondary `#A8B3BF` | 8,7 | 7,8 | 6,8 | testo secondario |
| textTertiary `#939EA9` | 6,8 | 6,1 | 5,3 | etichette, meta |
| accent `#35C6CF` | 8,9 | 8,0 | 7,0 | azione, selezione |
| brand `#8268F5` | 4,6 | 4,2 | 3,6 | **solo riempimenti/icone grandi** |
| brandText `#9F8BFF` | 6,7 | 6,0 | 5,3 | testo viola |
| success `#38D39F` | 9,7 | 8,7 | 7,6 | conferme |
| controlBorder `#7A8693` | 5,0 | 4,5 | 3,9 | bordi dei campi (≥3:1) |

- `onAccent #04181A` su accent: 8,8. Bianco su `brandStrong #6B4FE0`: 5,5 (bianco su `#8268F5` era 4,0: scartato).
- Separatori `#2A313A` (1,3:1) solo decorativi, mai come unico confine di un controllo.

Tipografia (stack di sistema, Dynamic Type attivo): display 30, title1 22, title2 18, headline 16/600, body 16, subhead 14, footnote 13, caption 12; metriche con cifre tabulari e unità più piccole e secondarie.

Spazi 4/8 (4, 8, 12, 16, 20, 24, 32), margine laterale 20. Raggi: chip 8, controlli 12, card 16, sheet 24, pill. Target minimo 44×44.

Motion: pressione 120 ms, transizioni locali 200 ms, sheet e viewer 300 ms, rivelazione distintivi 600 ms una sola volta per sessione; tutto disattivato con "Riduci movimento".
