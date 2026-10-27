# Accesso Google nell’app Runngo

Il pulsante **Continua con Google** è presente sia in accesso sia in creazione account. Il modulo nativo viene caricato solo dopo il tocco, fuori da Expo Go, con configurazione disponibile. Il token ID viene inviato a `/api/auth/google`; il server verifica firma Google, emittente, audience e scadenza, poi crea o collega l’account e restituisce la sessione nel cookie HttpOnly. I nuovi account attraversano lo stesso tutorial dei registrati con email. Annullare la scelta dell’account non apre una sessione.

## Configurazione richiesta

1. Nel progetto Google Cloud crea un Client ID OAuth **Web**. Imposta il suo valore sul server come `GOOGLE_CLIENT_ID`. Lo stesso ID pubblico arriva all’app da `/api/health`; l’app lo passa come `webClientId` al Google SDK, così l’audience del token corrisponde a quella verificata dal backend. Non serve un client secret nell’app.
2. Per iPhone crea un Client ID OAuth **iOS** con bundle ID `it.runngo.app`. Imposta `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` nell’ambiente della build mobile (esempio in `mobile/.env.example`). `mobile/app.config.ts` registra tramite il config plugin lo schema iOS derivato dal Client ID. Senza questo valore l’accesso iOS segnala che la configurazione manca.
3. Per Android registra le credenziali OAuth Android per il package `it.runngo.app` e le impronte SHA-1 dei certificati delle build usate (debug, release e Play App Signing se utilizzato). L’app chiede un ID token con l’audience del Client ID Web. Devono essere disponibili Google Play Services.
4. Configura la schermata consenso Google e gli utenti di test se il progetto è in modalità test.
5. Crea e installa una **nuova build nativa** (per esempio `npx expo run:ios` / `npx expo run:android` nell’ambiente di sviluppo adatto, oppure una build EAS configurata e firmata). Pubblicare soltanto un aggiornamento JavaScript o un QR Expo Go non aggiunge il modulo nativo o lo schema di ritorno alla build già installata.

I Client ID sono pubblici; nessun segreto va scritto nelle variabili `EXPO_PUBLIC_*`. Il client secret non è richiesto da questo flusso mobile. Non usare ID segnaposto in una build da distribuire.

## Compatibilità e verifica

Expo Go non include il modulo Google: il pulsante rimane visibile e spiega che occorre Runngo installata, senza tentare di importare un modulo assente e far diventare nera la schermata. Email e password restano disponibili. Il nuovo pulsante è per iOS/Android; il vecchio client web conserva il proprio flusso Google.

Test locali: successo confermato dal backend, annullamento, rifiuto server, configurazione assente, Expo Go, assenza Play Services e assenza ID token. Si aggiungono i test esistenti della verifica OIDC. Typecheck, lint dei file modificati, build web/server ed export bundle iOS verificati. Il login con Google reale richiede le credenziali sopra e una prova su una build nativa firmata; non è stato verificato con un account Google reale né pubblicato.

Riferimenti: [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/) · [Installazione Expo del Google SDK](https://react-native-google-signin.github.io/docs/setting-up/expo).
