# Medaglie virtuali e acquisto fisico — 28 ottobre 2026

Codice: `cb16ca6`, branch `claude/podismo-social`, repository `miki479/Poliz-postal`.

## Comportamento

Il primo allenamento valido di almeno 21 km assegna «Traguardo 21 km», separatamente per corsa, camminata e trail. Non somma allenamenti diversi e non crea record di velocità: il record esistente della mezza maratona resta a 21,0975 km. Esclude attività modificate, tapis roulant e valori mancanti/non finiti, seguendo le regole dei riconoscimenti esistenti. La distanza proviene dall'attività e non costituisce una certificazione di gara.

Nell'elenco dei riconoscimenti e nel dettaglio di una medaglia conquistata può apparire un unico banner per il prodotto corrispondente. Apre il sito esterno del venditore; non aggiunge nome, email, ID o percorso al link. Un errore di apertura mostra un messaggio italiano. Rispetta i temi chiaro/scuro esistenti e non introduce animazioni o dipendenze.

**L'utente non ha ancora una pagina di vendita: il catalogo di produzione resta vuoto e il banner nascosto.** Nessun prodotto, prezzo, disponibilità o pagamento è inventato.

## Configurazione successiva

`GET /api/medals/catalog` restituisce `{ "offers": [] }` in assenza di configurazione. La variabile server `MEDAL_SHOP_CATALOG` accetta un array JSON di prodotti reali con questi campi pubblici:

| Campo | Significato |
|---|---|
| `id` | Identificatore univoco, lettere minuscole, numeri, trattino o underscore |
| `title` | Titolo commerciale reale, massimo 100 caratteri |
| `awardCode` | Codice del riconoscimento, per esempio `distance_21km` |
| `sport` | `running`, `walking`, `trail` oppure `strength` |
| `url` | URL HTTPS pubblico del prodotto o checkout esterno |

Si configura soltanto quando sono disponibili link e informazioni reali. Configurazione assente, JSON errato, link non validi o assenza della medaglia corrispondente nascondono il banner. Rimuovendo il prodotto dal catalogo si disattiva il collegamento al successivo caricamento, senza pubblicare nuovamente l'app. Non inserire segreti nel catalogo, che è pubblico.

La funzione è un collegamento commerciale facoltativo: non gestisce ordini, scorte, spedizioni, rimborsi o webhook PayPal/Stripe. Il sito esterno deve gestire queste operazioni. Il possesso della medaglia controlla la visibilità nell'app, non impedisce di condividere l'URL pubblico del negozio. Non sono stati creati account di pagamento.

## File

- `shared/records.ts`, `mobile/src/constants/achievements.ts`: nuovo traguardo e voce nella collezione.
- `shared/medalShop.ts`: validazione del catalogo e corrispondenza tra sport, riconoscimento e prodotto.
- `server/index.ts`, `.env.example`: endpoint pubblico e configurazione vuota predefinita.
- `mobile/src/components/PhysicalMedalBanner.tsx`: banner con apertura esterna ed errore comprensibile.
- `mobile/src/components/AwardConquest.tsx`, `mobile/src/app/riconoscimenti/[id].tsx`, `mobile/src/app/riconoscimenti/index.tsx`: punti di visualizzazione.
- `tests/medalShop.test.ts`, `tests/medalShopHttp.test.ts`, `tests/sportTypes.test.ts`: regole, sicurezza dei link, endpoint e isolamento sportivo.
- `scripts/e2e-mobile-medals.mjs`: prova browser del dettaglio a 375 px, solo con dati simulati locali.

## Verifiche

Passati: `npx tsc --noEmit -p .`, typecheck dentro `mobile/`, **470 test in 62 file**, `npm run build`, lint mirato dei nuovi componenti e delle schermate riconoscimenti, export iOS e web. Build con il solo avviso Vite preesistente sulla dimensione dei chunk web.

La prova browser verifica banner assente senza catalogo, presente con prodotto e medaglia corrispondenti, assente quando la distanza scende sotto soglia, senza errori JavaScript. Screenshot locale ispezionato: `test-results/physical-medal-test-catalog-375.png`. Nessun dato di prova è salvato nel server di produzione. Verificati inoltre link aperto senza parametri personali e risposte HTTP del catalogo configurato/vuoto nei test server.

Nessun iPhone fisico collegato: apertura del browser nativo e acquisto reale non provati. Il negozio non esiste ancora. Calendario del piano e replay GPS non modificati. Nessun push GitHub effettuato.

## Pubblicazione

Server pubblicato prima dell'app: **`podismo-social-00027-cth`**, traffico al 100%. Verificati HTTP 200 su `/api/health`, `/api/medals/catalog`, `/api/auth/google/mobile/page` e `/api/auth/google/mobile/client.js`. Catalogo di produzione confermato: `{"offers":[]}`. Variabili e segreti preesistenti conservati.

Expo iOS, branch `main`, runtime `1.0.0`, codice `cb16ca6`: gruppo **`0beaa2d9-4ec0-4416-9d8d-66e83bc184ee`**, update `01a1835a-1a2d-7b51-a456-99458b69eb83`. [QR Expo Go](runngo-expo-physical-medals-2026-10-28.png).
