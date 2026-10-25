# Accesso Google in Runngo ed Expo Go

Il nuovo onboarding mantiene il flusso HTTPS Google Identity Services già configurato e pubblicato. Non viene richiesto il modulo Google nativo.

1. L’app crea un tentativo con `/api/auth/google/mobile/start`.
2. Apre `/api/auth/google/mobile/page` nel browser di sistema; lo script Google è servito da `/api/auth/google/mobile/client.js`.
3. Il server verifica il consenso/token Google e lega il risultato al tentativo monouso con nonce.
4. Soltanto l’app che possiede il segreto di polling può completare lo scambio tramite `/api/auth/google/mobile/poll` e ricevere il cookie HttpOnly.
5. L’app aggiorna la sessione; i nuovi account proseguono nella configurazione iniziale.

Il client OAuth Web del progetto podismoapp, GOOGLE_CLIENT_ID su Cloud Run e l’origine autorizzata `https://podismo-social-122967414084.europe-west1.run.app` sono già configurati dall’utente. Questo flusso non richiede SHA-1 Android, client OAuth iOS, client secret nell’app o una development build.

Il consenso Google è In test: possono accedere gli utenti di prova. Un annullamento non apre una sessione e il polling viene revocato. Nessun token viene salvato nei sorgenti.

La variante SDK nativo aggiunta dal commit remoto 73e7e43 non è stata adottata: avrebbe disabilitato Google proprio in Expo Go. Conservati invece il nuovo pulsante e l’introduzione prima dell’accesso. Manifest e lockfile non aggiungono dipendenze.

Verifiche automatiche in `tests/googleMobile.test.ts`, `tests/googleMobileHttp.test.ts` e `tests/oidc.test.ts`. Prima di Expo si verificano health, pagina Google e client.js sul server rilasciato. Il consenso con un account reale su iPhone resta da verificare sul dispositivo.
