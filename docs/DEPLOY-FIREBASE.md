# Deploy su Google Cloud Run + Firestore (progetto Firebase `podismoapp`, piano Blaze)

Architettura: **un solo container Cloud Run** serve client e API; i dati stanno in **Firestore** (solo il server li legge, con le credenziali di servizio; le regole bloccano ogni accesso dai client). Il login resta quello dell'app (non Firebase Auth).

> **Costi.** Blaze è a consumo. Cloud Run, Cloud Build, Artifact Registry, Secret Manager e Firestore hanno quote gratuite, ma **non ho verificato le cifre attuali**: controllale sulle pagine prezzi. Imposta un **avviso di budget** (Fatturazione → Budget e avvisi); gli avvisi non fermano la spesa, per questo si limita il servizio a 1 istanza.

## 1. Una tantum (console)
1. **Firestore:** console Firebase → *Firestore Database* → crea database in **modalità nativa**, regione `europe-west1`. (Il Realtime Database che hai nella configurazione non è usato.)
2. **API:** abilita *Cloud Run Admin*, *Cloud Build*, *Artifact Registry*, *Secret Manager*, *Cloud Firestore*.
3. **Budget:** crea un avviso (es. 5 €).

## 2. Comandi (da un terminale con `gcloud` e `firebase-tools` già loggati)
```bash
gcloud config set project podismoapp
firebase deploy --only firestore:rules               # blocca l'accesso diretto ai dati

# chiave di cifratura per i token (Strava); resta in Secret Manager
openssl rand -base64 32 | gcloud secrets create podismo-token-key --data-file=-
# il service account di Cloud Run deve poter leggere il secret e usare Firestore
PROJECT_NUMBER=$(gcloud projects describe podismoapp --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding podismo-token-key --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding podismoapp --member="serviceAccount:$SA" --role=roles/datastore.user

gcloud run deploy podismo-social \
  --source . --region europe-west1 --allow-unauthenticated \
  --max-instances 1 --min-instances 0 --memory 512Mi \
  --set-env-vars STORAGE=firestore,NODE_ENV=production,TRUST_PROXY=1,FIRESTORE_PROJECT_ID=podismoapp \
  --set-secrets TOKEN_ENCRYPTION_KEY=podismo-token-key:latest
```
Al termine Cloud Run stampa l'URL `https://podismo-social-XXXX.europe-west1.run.app`. **Impostalo come APP_URL** (serve per email e OAuth) e ripubblica:
```bash
gcloud run services update podismo-social --region europe-west1 --update-env-vars APP_URL=https://IL-TUO-URL
```

## 3. Verifica
`curl https://IL-TUO-URL/api/health` deve rispondere `{"ok":true,...}`. Apri l'URL dal telefono, registrati e crea un'uscita; in Firestore compaiono le collezioni `podismo_*`.

## 4. Opzionale: Firebase Hosting davanti
`firebase.json` inoltra tutto al servizio Cloud Run. Attenzione: Hosting inoltra **solo il cookie `__session`**, quindi imposta `SESSION_COOKIE_NAME=__session` e `ALLOWED_HOSTS=podismoapp.web.app` (o il tuo dominio), poi `firebase deploy --only hosting`. Non è provato in questo repository: se non ti serve un dominio personalizzato, usa direttamente l'URL di Cloud Run.

## Limiti da conoscere
- **Una sola istanza** (`--max-instances 1`): le regole sui posti e sulle sfide si appoggiano a uno stato in memoria; più istanze potrebbero sovrascriversi. Con `--min-instances 0` ogni avvio a freddo rilegge tutto Firestore (letture = numero di documenti): per un gruppo piccolo è poco, ma cresce con i dati.
- Le richieste che modificano dati rispondono dopo aver scritto su Firestore; se la scrittura fallisce la richiesta dà errore e le differenze vengono riprovate al salvataggio successivo.
- Verificato con un Firestore **finto** nei test (round trip, differenze, batch, errori). **Non ancora provato** con Firestore o Cloud Run reali.
