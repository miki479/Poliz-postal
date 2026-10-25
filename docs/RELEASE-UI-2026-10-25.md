# Runngo — rifiniture UI e mappe del 25 ottobre 2026

Intervento successivo al rilascio documentato in RELEASE-2026-10-25.md. Branch: `claude/podismo-social`. Backup sicuro: `67c2c5f`.

## Modifiche e file

- **Crash Integrazioni:** `shared/relativeTime.ts`, `mobile/src/lib/format.ts`, `src/format.ts`. La formattazione relativa è TypeScript puro, con testi italiani e date non valide gestite. Nessun uso rimasto di RelativeTimeFormat nel codice. Verificato anche il caricamento di stato Strava e storico vuoto senza collegamento.
- **Figure e selettori:** `mobile/src/components/SportIcon.tsx`, `mobile/src/lib/activityFigure.ts`, `paceInput.ts`, `components/EventDials.tsx`, `components/event/TypePicker.tsx`. Anatomia vettoriale articolata, interpolazione corsa/camminata e cadenza illustrativa legata a ritmo/livello. Animazione sul thread UI; Riduci movimento e pausa fuori focus. Ritmo con pannello numerico esplicito e conferma sopra la tastiera; livello trascinabile; card compatte con onde e selezione turchese/viola, adattive a 375 px e testo grande. La cadenza illustrativa della figura non viene registrata come misura dell'atleta.
- **Wizard e avatar:** `mobile/src/app/evento/form.tsx`, `components/event/EventFrame.tsx`, `ClubChoice.tsx`, `components/PlacePicker.tsx`, `AvatarCircle.tsx`, `ui.tsx`. Nessuna seconda scelta del tipo al passo Dettagli; campi essenziali compatti; visibilità e club separati; footer nel flusso per non coprire data e ora; ricerca con lente e Cerca, risposte obsolete ignorate; avatar circolari definiti. I fogli con input possono evitare la tastiera mantenendo il pulsante Salva raggiungibile.
- **Racconti e social:** `mobile/src/app/(tabs)/profilo.tsx`, `social.tsx`, `components/StoryCard.tsx`, `cards.tsx`, `Motion.tsx`, `shared/social.ts`, `shared/types.ts`. Profilo usava ancora una tessera statica duplicata: ora collega davvero StoryCard. Le anteprime mostrano percorso disegnabile, km e tempo soltanto se presenti; senza percorso rimane la figura. Spazio aggiuntivo per caratteri grandi e animazioni sospese fuori focus. Il feed disegna il GPS solo dopo una scelta esplicita del proprietario, escludendo estremi di 300 m, sensori e import. Chi seguire usa persone reali, con Segui e Nascondi.
- **Mappe e registrazione:** `mobile/src/components/RecordingDiscovery.tsx`, `mobile/src/app/registra.tsx`, `(tabs)/_layout.tsx`, `mobile/src/lib/recording.ts`, `shared/mapInsights.ts`. Stili notturna/standard/satellite/ibrida; calore globale o ultimi 7 giorni; percorsi realmente salvati; camera aggiornata dopo la readiness nativa e l'arrivo dei dati. Comando REGISTRA centrale con gradiente turchese/viola e due cicli di luce, disattivati con Riduci movimento. Proposte di sedute reali del piano e percorsi accessibili ordinati sulle distanze dello storico.
- **Attrezzatura:** `shared/gear.ts`, `shared/types.ts`, `shared/api.ts`, `shared/engine.ts`, `server/storage.ts`, `mobile/src/app/attrezzatura.tsx`, `(tabs)/profilo.tsx`, `allenamento/log/[id].tsx`, `registra.tsx`, `lib/recording.ts`. Collezione privata Firestore gear, aggiunta/modifica/riposo, associazione esplicita ai log Runngo e recupero della scelta nella bozza. Chilometri iniziali solo dichiarati; somma delle distanze note; totale omesso se manca lo storico iniziale o qualche distanza. Nessuna soglia di usura inventata. I suggerimenti possono usare le distanze delle uscite associate all'attrezzatura o lo storico reale dello stesso sport.

## Bug aggiuntivi corretti

- Il componente migliorato dei racconti non era collegato al Profilo: eliminato il doppione statico.
- La mappa poteva tentare il fit prima di onMapReady e non ricentrarsi sui dati arrivati dopo: attende la readiness e usa solo coordinate ricevute.
- Cambiando filtro potevano restare visibili risultati vecchi: la risposta è legata alla selezione e le richieste obsolete vengono ignorate.
- Una modifica a un log Strava poteva attivare shared e far comparire il riepilogo nel feed. `shared/training.ts` impone ora privato; `shared/engine.ts` filtra anche i vecchi flag erronei. Lo switch è nascosto per Strava. Resta valida la condivisione esplicita del solo riepilogo dei file, già prevista dall'app.
- Il salvataggio di più impostazioni poteva comunicare “Non salvato” dopo aver già aggiornato l'attività: messaggio distinto per un aggiornamento parziale, senza dettagli tecnici.

## Privacy delle nuove mappe

La condivisione dell'attività non autorizza il GPS. Il consenso al percorso nel feed è distinto dal consenso alla mappa di calore. La heatmap usa soltanto log Runngo con opt-in, celle di circa 300 m e almeno tre utenti distinti; risponde con celle aggregate, senza tracce individuali, identificativi o sensori. Non usa dati Strava o file. Ritirare il consenso rimuove subito il contributo. La posizione di ricerca non viene salvata.

## Verifiche

- `npx tsc --noEmit -p .`: passato.
- `cd mobile; npx tsc --noEmit`: passato.
- `npx vitest run`: **377 test in 40 file, tutti passati**.
- `npm run build`: passato; warning già presente sul chunk web oltre 500 kB.
- Export iOS: passato, 1897 moduli, bundle Hermes `entry-f786cbf6228016fe8c4b6c405b409d39.hbc`.
- Test nuovi/mirati: Intl assente, Strava scollegato, figure e input ritmo/livello, card a 375 px/testo grande, footer/avatar/ricerca, collegamento StoryCard/navigazione/dati assenti, readiness e livelli mappa, tastiera, navigazione Expo 58, proprietà e contatori gear, consenso GPS/aggregazione/privacy, storage Firestore e regressione riepiloghi Strava.
- Lint eseguito con il preset Expo già disponibile e una configurazione temporanea esterna. Il lint generale non è verde: 157 errori e 49 warning, con errori delle regole React Compiler presenti anche in calendario e replay protetti. Confrontati i file modificati con dfa273e e risolte le nuove segnalazioni; controllo mirato finale di barra, racconti, card e mappe senza errori. Nessuna configurazione ESLint o dipendenza aggiunta al repository.
- `git diff 67c2c5f -- mobile/src/components/PlanCalendar.tsx mobile/src/components/RouteReplay.tsx mobile/src/lib/routeGeometry.ts`: vuoto. Manifest e lockfile invariati. Nessun token o segreto aggiunto ai file.

## Commit

- `ecca28e`: crash RelativeTimeFormat e Strava scollegato.
- `b38c6fc`: figure, ritmo esplicito e trascinamento livello.
- `044dc82`: wizard compatto, visibilità, club, ricerca e avatar.
- `17faa75`: attrezzatura privata e mappe con consenso distinto.
- `8a1b46c`: riepiloghi Strava sempre privati.
- `f93bc33`: collegamento UI di racconti, mappe, navigazione, attrezzatura e relativi test.

## Limiti concreti

- Non è disponibile un iPhone collegato: fluidità, gesti, VoiceOver, confronto visivo pixel per pixel e comportamento reale della tastiera restano da provare. I test dei componenti eseguono il codice con driver nativi simulati e non sostituiscono la prova sul dispositivo.
- La revisione automatica delle autorizzazioni ha rifiutato il comando di avvio automatico dell'app Android, riportando soltanto “blocked by policy”. Non è stata aggirata: il dev server e il bundle esportato non vengono presentati come prova nell'app.
- **Punto 6 parziale:** il livello disponibile mostra percorsi realmente salvati; non esiste una fonte collegata di segmenti ufficiali o piste certificate. Non è stato creato un catalogo fittizio. Le heatmap possono quindi essere vuote finché non ci sono almeno tre contributori consenzienti nella stessa cella.
- Le schede allenamento usano le sedute effettive del piano personale. Se il piano manca, offrono di crearlo; non mostrano gli esempi Mile Effort/Interval Run come se fossero allenamenti assegnati.
- Google rimane in modalità In test, quindi solo utenti di prova. L'accesso reale con consenso Google e il consenso Strava su iPhone non sono stati eseguiti in questa sessione.
- Apple Salute/HealthKit esclusa, come richiesto. Nessuna nuova tab Messaggi, nessun collegamento Garmin. Commit locali sul branch richiesto, senza push GitHub.

## Pubblicazione

Server definitivo rilasciato **prima di Expo**: revisione `podismo-social-00021-dq4`, 100% del traffico. Comprende anche la correzione dei riepiloghi Strava; la revisione intermedia 00020 conteneva il primo blocco delle mappe.

- `GET /api/health`: 200, `ok:true`.
- `GET /api/auth/google/mobile/page`: 200, text/html.
- `GET /api/auth/google/mobile/client.js`: 200, text/javascript.
- Configurazione preesistente Google e Strava conservata dal deploy.

EAS Update iOS **pubblicato** dopo queste verifiche:

- Branch `main`, runtime `1.0.0`, piattaforma iOS.
- Codice: `f93bc331ef68573bb6d4dec220add84486c1a16a` (modifiche successive solo a documentazione e QR).
- Gruppo: `4d981c85-1fb8-4cc7-93ed-7339348c0203`.
- Update iOS: `01a17409-1caf-70fe-ad6f-2cfbfa88a13d`.
- [Dashboard EAS](https://expo.dev/accounts/mikifikone/projects/runngo/updates/4d981c85-1fb8-4cc7-93ed-7339348c0203).
- [QR Expo Go aggiornato](runngo-expo-ui-2026-10-25.png), con URL `exp://u.expo.dev/a4379409-221f-4209-99a9-4e21f1eeb9c3/group/4d981c85-1fb8-4cc7-93ed-7339348c0203`.
- Pubblicato il bundle iOS esportato e verificato usando `--skip-bundler --input-dir`. Nessuna variabile EAS production da incorporare.
