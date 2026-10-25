# Accesso Google in Runngo

Il server supportava già la verifica degli ID token Google. Il client Expo Go ora apre una pagina HTTPS del server con il pulsante ufficiale Google Identity Services. Dopo il consenso si chiude la pagina per tornare a Runngo: la richiesta HTTP dell'app conclude l'accesso e riceve il normale cookie HttpOnly.

Il tentativo scade dopo cinque minuti. Il browser e l'app possiedono due credenziali temporanee diverse, conservate solo in memoria; il browser non può ritirare la sessione mobile. L'ID token Google arriva al server tramite POST, viene verificato con le chiavi ufficiali e con un nonce legato al tentativo, e non viene salvato. Il ritiro della sessione è monouso. Non serve una nuova dipendenza nativa.

## Configurazione

Al controllo iniziale del 25 ottobre 2026 `/api/health` restituiva `googleClientId: null`. Nel file `google-services.json` fornito durante il lavoro è stato trovato un client OAuth Web del medesimo progetto `podismoapp` (numero `122967414084`). Il rilascio può riutilizzare quel client ID pubblico impostando `GOOGLE_CLIENT_ID`; resta necessario verificare le origini autorizzate e la schermata di consenso in Google Auth Platform.

1. Creare o riutilizzare un client OAuth di tipo **Applicazione web**.
2. Autorizzare l'origine JavaScript `https://podismo-social-122967414084.europe-west1.run.app` (e le eventuali altre origini effettivamente usate dall'app).
3. Configurare nome Runngo, recapito, schermata di consenso, link privacy e stato di pubblicazione/tester richiesti da Google.
4. Impostare sul servizio Cloud Run `GOOGLE_CLIENT_ID` con il client ID ottenuto. Il client ID è pubblico; questo flusso non richiede un client secret.

Non sono stati inventati client ID e non sono stati salvati segreti nel repository. `google-services.json` non è stato aggiunto a git. In assenza di configurazione il pulsante spiega che si può continuare con email e password.

Riferimenti: [configurazione ufficiale Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [API JavaScript Google e nonce](https://developers.google.com/identity/gsi/web/reference/js-reference), [WebBrowser Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/).

Verifica automatica: stato isolato, segreti separati, nonce, concorrenza, scadenza, annullamento, monouso, route HTTP, rifiuto delle credenziali non firmate e delle origini estranee. Il consenso reale su iPhone e il collegamento Google richiedono il client OAuth configurato e una prova con account reale.
