# Runngo — punto di passaggio (25 ottobre 2026)

Documento per chi riprende il lavoro (persona o altra AI). Descrive cosa esiste, cosa è stato fatto, cosa manca e come verificare, rilasciare e pubblicare.

> ⚠️ **Niente è ancora salvato in git.** L'ultimo commit è `12f69af` sul branch `claude/podismo-social`. Tutta l'app nativa (`mobile/`) e gran parte di `shared/` e `tests/` sono file **non tracciati**. Prima di qualsiasi altra cosa: `git add` e commit, per non rischiare di perdere il lavoro.

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
npx vitest run                 # tutti i test (ultimo esito: 24 file, 288 test, tutti verdi)
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

- **Server su Cloud Run:** revisione `podismo-social-00015`, cioè il codice del deploy `00014` più `GEO_CONTACT_EMAIL`. La ricerca dei luoghi è attiva (`geocoding: true`).
  **Non** contiene ancora il nuovo modello dati del §3.3 (Trail, Corsa + camminata, Altro; patto A turno, In coppia, Self pace).
- **App su Expo Go:** ultimo aggiornamento pubblicato, gruppo `a7527328-fd5a-4032-ad02-6e9546281409` (QR in `runngo-qr-racconti.png`). Contiene il lavoro fino a "racconti nel profilo, mappa con marker, statistiche, uscite guidate, inviti", ma **nessuna** delle modifiche del §3.

> **Ordine obbligatorio per il prossimo rilascio:** prima il server (altrimenti rifiuta i nuovi tipi e le nuove modalità del patto), poi l'aggiornamento Expo.

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
