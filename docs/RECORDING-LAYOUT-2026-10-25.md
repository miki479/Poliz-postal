# Registrazione fissa — 25 ottobre 2026

Codice: `54f859f`, branch `claude/podismo-social`.

- Schermata di preparazione senza ScrollView principale: mappa di calore in alto, card compatta delle opzioni e comando Avvia fisso in basso con safe area.
- La card a livelli si apre in un pannello sovrapposto. Attività, contesto/gruppo, piano, attrezzatura, recupero bozza e condivisioni rimangono nel pannello; lo scroll è confinato alle opzioni aperte. Aprirlo non ridimensiona o sposta la mappa dietro.
- La mappa usa lo spazio rimanente e parte con il livello di calore globale visibile. Non vengono attivati consensi per contribuire né creati dati di calore quando mancano contributi.
- Se esiste una bozza, l’azione principale richiama il recupero esistente; scarto e dettagli rimangono nel pannello.
- La scelta dell’attrezzatura è controllata dalla schermata: non si azzera smontando e riaprendo il pannello.

File: `mobile/src/app/registra.tsx`, `mobile/src/components/RecordingSetupFrame.tsx`, `mobile/src/components/RecordingDiscovery.tsx`, `tests/recordingSetupLayout.test.ts`.

Verifiche: typecheck root/mobile, 410 test in 49 file, build web/server ed export iOS passati. Lint dei tre file mobile modificati senza errori. Test del layout fisso, ordine mappa/card/Avvia, safe area, apertura delle opzioni, azione Avvia separata e persistenza della selezione attrezzatura. Nessuna dipendenza o modifica al server, al calendario o al replay GPS.

Limite: l’export web riesce, ma la prova browser della route Registra si interrompe sul componente nativo delle mappe (`codegenNativeComponent` non disponibile sul web). Non è una prova della schermata su iPhone. Geometria e gesti nativi restano da verificare in Expo Go. Nessuna mappa dimostrativa è stata sostituita a quella reale.

Server già compatibile: revisione `podismo-social-00022-njl`; non è stato necessario un nuovo deploy. EAS Update iOS pubblicato su main, runtime 1.0.0:

- Gruppo `fc920778-3af1-4973-9135-7613abeb3d0d`.
- Update `01a1753f-e18c-7faa-953c-b2de6ed1726d`.
- Codice `54f859f5400103da3e222a05cc67cd200d938193`.
- [Dashboard EAS](https://expo.dev/accounts/mikifikone/projects/runngo/updates/fc920778-3af1-4973-9135-7613abeb3d0d).
- [QR Expo Go](runngo-expo-recording-fixed-2026-10-25.png).

Pubblicato il bundle iOS verificato tramite --input-dir e --skip-bundler. Le modifiche successive sono soltanto documentazione e QR. Commit locali, nessun push GitHub.
