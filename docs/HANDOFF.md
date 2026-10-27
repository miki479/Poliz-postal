# Runngo — punto di passaggio (25 ottobre 2026)

> **Ultimo rilascio, 27 ottobre 2026:** temi Chiaro/Scuro neutri, barra Liquid Glass nativa iOS 26 con fallback accessibile, piano semplificato e salto con motivazione al posto del check-in. Replay con punto e linea sincronizzati per frame e indicatori separati sui circuiti chiusi. Codice `3d4c8d9`, server `00026-n95`, Expo iOS gruppo `0e097b9f-d670-4846-92a7-79af4ef22f1c`. **459 test/59 file**, typecheck, build, export e prova browser passati. [Resoconto e limiti della verifica nativa](PLAN-GLASS-2026-10-27.md), [QR attuale](runngo-expo-plan-glass-2026-10-27.png).

> **Aggiornamento replay e palette, 26 ottobre 2026:** percorso disegnato progressivamente, niente play/pausa o giri, partenza e arrivo animati; dicitura allenamento e colori blu/ambra/rosa/lavanda/viola. Codice `7a0d4de`, server `00025-nh5`, Expo iOS gruppo `4d1bc0ff-5ea0-4743-8c66-a51c29af90fe`. 452 test/57 file passati. [Resoconto e limiti della prova nativa](REPLAY-COLORS-2026-10-26.md), [QR attuale](runngo-expo-replay-colors-2026-10-26.png).

> **Ultimo rilascio, 26 ottobre 2026:** piano con testata fissa e struttura dei riferimenti, guida NHS, compagni confermati, follower gestibili, riepilogo per campo, miniature e MP4. Codice `28867b9`; server `00024-5v5` pubblicato prima di Expo iOS gruppo `1e5134dd-985a-4dd6-bbb2-082b551a2e53`. **449 test/56 file**, typecheck, build, lint mirato, export iOS e prova browser del piano a 375 px passati. [Resoconto e limiti](PLAN-2026-10-26.md), [QR attuale](runngo-expo-plan-2026-10-26.png). Le pubblicazioni sotto sono storiche.

> **Aggiornamento del 26 ottobre 2026:** quattro comandi Home/Esplora/Registra/Community, riorganizzazione Profilo e Allenamento, replay GPS nativo, creazione per proposte, ritrovo abituale esplicito e correzione del passo. Codice `e236e79`, server `00023-pg2` pubblicato prima dell’app, Expo iOS gruppo `453b6fc8-2f9a-4bfb-abb2-ab6a406fd4ac`. **425 test/52 file**, typecheck, build, export e prove browser passati. Non tutte le nuove funzioni del testo sono completate: leggere limiti e verifiche nel [resoconto](COMMUNITY-2026-10-26.md). [QR attuale](runngo-expo-community-2026-10-26.png).

Documento per chi riprende il lavoro (persona o altra AI). Descrive cosa esiste, cosa è stato fatto, cosa manca e come verificare, rilasciare e pubblicare.

> **Ultima modifica del 25 ottobre 2026:** Registra ora è fissa: heatmap in alto, card delle opzioni apribile e Avvia in basso. Codice `54f859f`, Expo iOS gruppo `fc920778-3af1-4973-9135-7613abeb3d0d`, server compatibile invariato `00022-njl`. 410 test/49 file, typecheck, lint mirato, build ed export iOS passati. [Resoconto](RECORDING-LAYOUT-2026-10-25.md), [QR aggiornato](runngo-expo-recording-fixed-2026-10-25.png).

> **Revisione precedente del 25 ottobre 2026:** integrato il commit remoto `73e7e43` con onboarding e correzioni registrazione, mantenendo Google compatibile con Expo Go e il replay stabile. Corretti revoca heatmap e statistiche attraverso interruzioni GPS. Codice `f076abc`, server `00022-njl`, Expo iOS gruppo `d72fc5e7-7d22-48f5-945a-086d6357627e`. **406 test in 48 file**, typecheck, build, export ed E2E browser del percorso iniziale passati. [Resoconto completo](REVIEW-2026-10-25.md) e [QR aggiornato](runngo-expo-review-2026-10-25.png).

> **Aggiornamento UI precedente del 25 ottobre 2026:** corretti crash Integrazioni, figure, wizard e collegamento dei racconti; aggiunti attrezzatura, mappe aggregate con consenso distinto e comando Registra. Server `00021-dq4`, Expo iOS gruppo `4d981c85-1fb8-4cc7-93ed-7339348c0203`. Dettagli, file, test, limiti e QR nel [resoconto UI](RELEASE-UI-2026-10-25.md).

> **Aggiornamento precedente del 25 ottobre 2026:** backup sicuro `67c2c5f`; le modifiche successive sono salvate in commit separati. Sono implementati anche i cinque livelli persistenti, retry modifica uscita, selettori adattivi, inviti alle singole uscite, filtro geografico server, misure GPX/TCX, zone Strava autorizzate e accesso Google. Apple Salute/HealthKit resta esclusa. Per stato finale, file, commit, test e limiti leggere [RELEASE-2026-10-25.md](RELEASE-2026-10-25.md). Le sezioni storiche sotto descrivono il passaggio iniziale; i TODO risolti sono elencati nel resoconto di rilascio.

---

## 1. Il progetto in breve

| Parte | Dove | Note |
|---|---|---|
| App nativa (quella vera) | `mobile/` | Expo SDK 58, expo-router, si prova con **Expo Go** sull'iPhone |
| Logica di dominio | `shared/` | TypeScript puro, condiviso da server, app e web. Test in `tests/` (vitest) |
| Server API | `server/` | Node, deploy su **Cloud Run** con dati su **Firestore** |
| Vecchio client web | `src/` | Deve solo continuare a compilare |
| Mockup di riferimento | `docs/mockups/` | Le 4 immagini a cui l'app deve assomigliare (vedi §5) |

- **Server:** progetto Google Cloud `podismoapp`, regione `europe-west1`, servizio `podismo-social`, `--max-instances 1`.
  URL: https://podismo-social-122967414084.europe-west1.run.app (`/api/health` per lo stato).
- **Expo:** account `mikifikone`, progetto `runngo`, id `a4379409-221f-4209-99a9-4e21f1eeb9c3`, aggiornamenti su branch `main`.
- **Email di configurazione:** `mikiforte1@gmail.com` è usata **solo** come recapito obbligatorio per il servizio di geocoding (variabile `GEO_CONTACT_EMAIL` su Cloud Run). Non compare da nessuna parte nell'app.
- **Segreti:** il token Cloudflare e il client secret Strava erano stati incollati in chat: **vanno rigenerati**. Non sono scritti in nessun file.

### Comandi

```bash
# dalla root C:\Poliz-postal
npx tsc --noEmit -p .          # typecheck server + shared + web
npx vitest run                 # tutti i test (ultimo esito: 49 file, 410 test, tutti verdi)
npm run build                  # build web + server

# dentro mobile/
npx tsc --noEmit               # typecheck app (ultimo esito: pulito)
npx expo export --platform ios --output-dir <cartella-temp>   # prova del bundle
```

Il lint (`npx expo lint`) **non è configurato**: manca la configurazione ESLint in `mobile/`.

### Rilascio del server

```bash
gcloud run deploy podismo-social --source . --region europe-west1 --allow-unauthenticated --max-instances 1 --quiet
curl -s https://podismo-social-122967414084.europe-west1.run.app/api/health
```

Le variabili d'ambiente e i segreti già impostati restano tra un deploy e l'altro.

### Pubblicazione per Expo Go e QR

```bash
cd mobile
npx eas-cli update --branch main --environment production --message "..." --non-interactive
# prendi l'"Update group ID" dall'output, poi:
python -c "import segno; segno.make('exp://u.expo.dev/a4379409-221f-4209-99a9-4e21f1eeb9c3/group/<GROUP_ID>', error='m').save('runngo-qr.png', scale=10, border=3)"
```

---

## 2. Cosa è online adesso

- **Server Cloud Run:** revisione `podismo-social-00022-njl`, 100% del traffico. Comprende le nuove API di configurazione iniziale e la revoca condivisa delle heatmap, oltre alle funzioni precedenti.
- **Expo Go iPhone:** branch `main`, runtime `1.0.0`, gruppo `fc920778-3af1-4973-9135-7613abeb3d0d`, codice `54f859f`. [QR aggiornato](runngo-expo-recording-fixed-2026-10-25.png).
- **Verifiche:** typecheck root/mobile, 410 test in 49 file, build web/server ed export iOS passati. La route con mappe richiede verifica nativa. E2E precedente del percorso iniziale nel browser con API simulate: introduzione → registrazione → tutorial → creatore piano, senza errori JavaScript. Non sostituisce la prova nativa su iPhone.
- Health e risorse Google 200 prima di Expo. Google rimane HTTPS/Expo Go, consenso In test per i soli utenti di prova; nessun SDK Google nativo aggiunto. Strava conserva scope `read,activity:read,profile:read_all`.
- Calendario, RouteReplay.tsx e routeGeometry.ts invariati; per tracce interrotte un componente esterno mostra solo i segmenti acquisiti. Apple Salute esclusa. Lint mirato delle nuove schermate pulito; restano le segnalazioni generali preesistenti.
- [Layout registrazione](RECORDING-LAYOUT-2026-10-25.md), [resoconto revisione](REVIEW-2026-10-25.md), [rilascio UI precedente](RELEASE-UI-2026-10-25.md), [primo rilascio](RELEASE-2026-10-25.md). Commit locali, nessun push GitHub.

> Ordine rispettato: server, controlli health/Google, poi Expo. Le sezioni 3 e 4 sotto sono il passaggio storico iniziale; per lo stato attuale fanno fede i resoconti.

---

## 3. Fatto ma NON ancora pubblicato (nei file del progetto, verificato con typecheck e test)

### 3.1 Primo giro di rifinitura (tutto implementato e revisionato)

- **Tracciato GPS fluido** (`mobile/src/components/RouteReplay.tsx`, `mobile/src/lib/routeGeometry.ts`, `tests/routeGeometry.test.ts`).
  - Causa dello scatto: il replay ridisegnava la polilinea nativa della mappa a ogni passo.
  - Ora la geometria (tutti i punti, nessuna semplificazione) si costruisce una volta e la parte percorsa è un livello SVG animato sul thread UI (Reanimated), con alone e punto di testa.
  - La polilinea nativa resta statica. Ci sono un fallback se la regione della mappa non arriva, la chiave del tracciato su tutti i punti e una correzione del lampeggio su iOS.
- **Selettori della creazione uscita** (`mobile/src/components/EventDials.tsx`, `shared/eventLevel.ts`, `tests/eventLevel.test.ts`):
  - distanza con −/+, numero animato, scala trascinabile e distanza personalizzata;
  - ritmo con figura animata che accelera col passo;
  - barra del livello a 5 gradini con stima automatica da tipo, distanza e ritmo, modificabile trascinando. Una scelta manuale non viene sovrascritta. Il server ha solo 3 livelli: `toServerLevel` converte.
- **Card delle uscite con icone** (`mobile/src/components/cards.tsx`, `mobile/src/constants/eventStyle.ts`): al posto delle pillole, icone di visibilità, club, patto (una per modalità), percorso e posti limitati, con descrizioni accessibili.
- **Racconti** (`mobile/src/components/StoryCard.tsx`, `mobile/src/components/RouteTrace.tsx`, `mobile/src/app/allenamento/storie/[id].tsx`, `mobile/src/components/Results.tsx`, `mobile/src/lib/storyPalette.ts`):
  - nelle card il **vero percorso** disegnato in modo progressivo; senza GPS una decorazione dichiaratamente astratta;
  - racconto con numeri che entrano di lato e contano fino al valore reale, riflessi, particelle e varianti per corsa, camminata e attività combinate;
  - sequenza di conquista dei riconoscimenti solo alla prima visione, più leggera nelle successive.
- **"Sei tu?" senza scroll e calendario** (`mobile/src/app/allenamento/piano.tsx`, `mobile/src/components/ToneBanner.tsx`, `mobile/src/components/PlanCalendar.tsx`):
  - banner compatti e una riga riassuntiva con un foglio per le modifiche;
  - corrette risposte AI vecchie che sovrascrivevano le nuove, il doppio tocco e i numeri sbagliati nell'anteprima;
  - nel calendario solo scintille e riflessi aggiunti, **ingresso invariato** come richiesto.

### 3.2 Revisione del GPS (fatta)
Sette correzioni in `RouteReplay.tsx` e `routeGeometry.ts`, 20/20 test verdi.

### 3.3 Nuovo modello dati (fatto, va rilasciato sul server)
- **Tipi:** `SportId` ora include `trail`, `run_walk` (Corsa + camminata) e `other` (Altro). Il file centrale è `shared/sports.ts`.
  - Strava: TrailRun diventa trail, Hike resta camminata.
  - Record: il trail ha solo distanza e durata; Corsa + camminata non entra nei tempi della corsa; Altro non ha record di prestazione.
  - Il campo facoltativo `WorkoutLog.trail` marca i racconti Strava di trail.
- **Patto di corsa:** nuove modalità `takeTurns` (A turno), `pairs` (In coppia) e `selfPace` (Self pace), in `shared/pact.ts`.
  - Self pace è incompatibile con "Nessuno resta indietro" e "Ritmo inclusivo": il server lo rifiuta.
  - I patti già salvati restano validi.
- **Test:** `tests/sportTypes.test.ts` (31) e un test di integrazione Strava.

### 3.4 Allineamento ai mockup (fatto in parte)
- ✅ **Creazione uscita** (completata e revisionata):
  - stepper a 4 passi Attività, Dettagli, Patto, Riepilogo;
  - tessere dei 5 tipi, distanza, ritmo e livello come nel mockup, patto a tessere;
  - nuovi componenti in `mobile/src/components/event/` (Stepper, EventFrame, GradientButton, Reveal, SectionTitle, TypePicker, PactPicker, colors).
- ✅ **Home, card, club e partecipanti** (completata e revisionata):
  - card grandi "Uscite di gruppo" con gradiente al posto della foto;
  - sezioni "I miei club" e "Uscite pubbliche";
  - card club completa;
  - partecipanti con le schede;
  - ricerca località come nel mockup.

---

## 4. Cosa resta da fare

### 4.1 Allineamento ai mockup: 3 gruppi da finire
Tutti in **tema scuro**: dove il mockup è chiaro si riproduce la stessa struttura con i colori scuri. Al posto delle foto si usano gradienti con la figura dell'attività. Solo dati reali.

1. **Dettaglio attività, mappa, statistiche, racconto, inviti**: interrotto a metà, i file possono essere parzialmente modificati.
   - File: `mobile/src/app/allenamento/log/[id].tsx`, `mobile/src/components/ActivityStats.tsx`, `mobile/src/app/allenamento/storie/[id].tsx`, `mobile/src/components/StoryCard.tsx`, `mobile/src/components/InviteSheet.tsx`, `mobile/src/app/notifiche.tsx`, `mobile/src/lib/storyPalette.ts`, nuovo `mobile/src/components/LatestCard.tsx`.
   - In `mobile/src/components/RouteReplay.tsx` si toccano solo la scheda dei marker e gli overlay, **non** la logica dell'animazione.
   - Riferimenti: `02-panoramica-12-riquadri.webp` riquadri 3, 4, 5, 6, 7 e `03-riconoscimenti.png` riquadri 1 e 2.
   - Da fare anche: usare `l.trail` per mostrare "Trail" nei racconti Strava di trail.
2. **Profilo e riconoscimenti**: un tentativo precedente ha già esteso `mobile/src/constants/achievements.ts` con i badge esagonali.
   - Da fare:
     - ridisegnare `AwardMark` in esagono, mantenendo export e props;
     - schermate Riconoscimenti (Tutti / Record / Traguardi), Dettaglio riconoscimento, Collezione per sport e per categoria;
     - Obiettivi con anello settimanale e barre, con i dati reali di `shared/goals.ts`;
     - profilo con contatori e schede Attività / Racconti / Medaglie;
     - in `mobile/src/app/record.tsx` aggiungere `'trail'` alla lista `SPORTS`.
   - Riferimenti: `03-riconoscimenti.png`, `02-panoramica-12-riquadri.webp` riquadro 2 e `04-piano-briefing-profilo.webp` riquadro 6. Niente Garmin.
3. **Piano, briefing e racconti Strava**: `mobile/src/app/allenamento/piano.tsx`, `mobile/src/components/ToneBanner.tsx`, `mobile/src/app/integrazioni.tsx`, `mobile/src/app/allenamento/index.tsx`.
   - Riferimento: `04-piano-briefing-profilo.webp` riquadri 1, 2 e 5. Il calendario (`PlanCalendar.tsx`) **non va rifatto**.

Le istruzioni dettagliate, una per gruppo, sono nello script del workflow:
`C:\Users\mikel\.claude\projects\C--Poliz-postal\7ed7f3f3-ee82-42f6-82d4-612985e7ca59\workflows\scripts\runngo-fedelta-mockup-wf_d32c0e0f-923.js`.
In quel file i percorsi delle immagini puntano alla cartella temporanea: ora le immagini sono anche in `docs/mockups/`.

In **Claude Code**, nella stessa sessione, si riprende da dove si era fermato, riusando i gruppi già finiti:

```
Workflow({ scriptPath: "<percorso dello script qui sopra>", resumeFromRunId: "wf_d32c0e0f-923" })
```

### 4.2 Dopo l'allineamento
1. Typecheck in entrambi i progetti, `npx vitest run`, `npm run build`, export del bundle iOS.
2. Rilascio del server (§1), poi controllo di `/api/health`.
3. `eas update` e generazione del QR (§1).
4. **Prova su telefono.** Niente di tutto questo è stato provato su un dispositivo reale: fluidità del GPS, gesti dei selettori e conflitti con lo scroll, animazioni, VoiceOver, "Riduci movimento", schermi piccoli.

### 4.3 Problemi noti e limiti
- `useReduceMotion()` (`mobile/src/components/ui.tsx`) vale `false` al primo render: con movimento ridotto qualcosa può animarsi per un fotogramma. Alcuni componenti lo aggirano già; andrebbe corretto alla fonte.
- `LEVEL_LABEL` in `mobile/src/lib/format.ts` conosce solo i 3 livelli del server: "Principiante" e "Avanzato" diventano "Tranquillo" e "Sostenuto" nel dettaglio dell'uscita.
- In `mobile/src/app/evento/form.tsx`, se il caricamento di un'uscita da modificare fallisce, la rotella resta per sempre.
- I selettori di tipo in `club/form.tsx`, `attivita-form.tsx` e `profilo-modifica.tsx` ora hanno 5 opzioni: va controllato che vadano a capo bene.
- Web (`src/screens/EventForm.tsx`): il campo ritmo compare anche per "Altro".
- **Mancano ancora:**
  - zone cardiache: serve il permesso Strava `profile:read_all`;
  - frequenza cardiaca, dislivello e cadenza da GPX/TCX e Apple Salute;
  - inviti alle singole uscite: esiste solo l'invito al club;
  - filtro "vicino a me" lato server: oggi lo fa il telefono.
- **Non esistono, per scelta:** tab "Messaggi", collegamento Garmin, foto nelle card.
- Le cartelle Capacitor `android/` e `ios/` alla radice non sono usate dall'app nativa. Non sono state cancellate perché non è mai arrivata una conferma.
- **Regole di prodotto dell'utente:**
  - testi in italiano;
  - niente dati inventati;
  - mai errori tecnici mostrati;
  - animazioni che rispettano "Riduci movimento";
  - l'app deve somigliare ai mockup, comprese le azioni principali che lì compaiono.
