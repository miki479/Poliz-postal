# Continuazione del lavoro v0 — 27 ottobre 2026

## Provenienza e integrazione

Il fetch di GitHub ha trovato `origin/main` a `68208dc` (PR #2), con le modifiche v0 nel commit **3371ec8**. Sono state adattate alla versione mobile già pubblicata, sul branch locale `claude/podismo-social`; non sono stati sostituiti i 59 commit locali precedenti con la vecchia base remota. Nessun push GitHub eseguito.

Il titolo del commit v0 cita Geist, ma i font sono file generati in `.vinext/` per un'anteprima web: non configurano i font dell'app Expo. Non sono stati copiati cache, registri Wrangler o database temporanei. `.gitignore` ora esclude queste due cartelle. Nessuna dipendenza aggiunta.

## Modifiche completate

- **Data e ora separate**: `mobile/src/components/DateField.tsx`, `mobile/src/lib/dateParts.ts`, re-export in `ui.tsx`. Due controlli compatti, calendario e orologio nativi su telefono, input accessibili nel browser. La modifica del giorno conserva l'orario e viceversa. Su iOS si conferma con Fatto; chiudere annulla la bozza. Sheet e temi riutilizzano le regole esistenti di Riduci movimento e Chiaro/Scuro. Corretto anche il limite precedente di Android, dove `datetime` apriva soltanto il giorno e non rendeva modificabile l'ora.
- **Visibilità compatta**: `components/event/VisibilitySwitch.tsx`, `app/evento/form.tsx`. Pubblica / Gruppo / Solo link, sia nel primo passo sia nell'editor del riepilogo. I gruppi compaiono soltanto quando necessari; selezione automatica se ce n'è uno solo. Con testo ingrandito o larghezza ridotta i controlli diventano verticali. Conservati validazione e annullamento delle modifiche per campo.
- **Ricerca località**: `components/PlacePicker.tsx`. Pulsante Cerca più evidente, pulizia di risultati/errori cambiando testo, protezione delle risposte obsolete e dopo lo smontaggio, blocco di doppi invii durante la richiesta. Il valore animato nasce una sola volta senza letture di ref durante il render.
- **Barra con Registra centrale e Profilo**: `components/RecordTabBar.tsx`, `(tabs)/_layout.tsx`. Ripresa la struttura v0 con Home / Esplora / Registra / Community / Profilo. Mantenuti Liquid Glass iOS 26, fallback accessibile e temi neutri. Adeguate le API di v0 (`navigation`) a quelle effettive di Expo 58 (`emitter` e `navigateToTab`). Social resta una route esistente, senza aggiungere Messaggi o Garmin.

### Adattamenti necessari rispetto a v0

L'autocompletamento remoto proposto da v0 non è stato attivato: il servizio pubblico Nominatim usato dalla configurazione attuale lo vieta. La ricerca richiede quindi Cerca o Invio. [Policy del provider](https://operations.osmfoundation.org/policies/nominatim/). La prova browser controlla che scrivere non invii richieste e che il pulsante ne invii una sola. Per avere suggerimenti remoti durante la digitazione occorre un provider che lo consenta.

La correzione `relativeFromNow` per Hermes era già presente e testata; è stata conservata. Non sono stati reintrodotti il tema turchese, il nuovo accento arancione globale o il bagliore animato continuo del pulsante: il comando principale rimane gerarchico nei temi neutri richiesti dall'utente.

## Verifiche

- Typecheck root e mobile: passati.
- **463 test in 60 file**, tutti passati, incluso encoder MP4 reale.
- Nuovi test: conservazione indipendente di data/ora, annullamento e conferma della bozza, visibilità con testo al 200%, navigazione Registra/Profilo e mantenimento del vetro. Aggiornato il test precedente dopo l'estrazione del componente barra.
- `npm run build`: passato, con il solo avviso Vite preesistente sulla dimensione del client web.
- Lint mirato di DateField, RecordTabBar, VisibilitySwitch, PlacePicker, modulo uscita e layout tab: pulito.
- Export iOS e web: passati.
- E2E mobile nel browser a 375 px: Home, Community, Profilo, proposta fino al riepilogo, modifica giorno e ora, visibilità privata, ricerca geografica manuale senza doppioni e testo al 135%, nessun errore JavaScript. Script: `scripts/e2e-mobile-community.mjs`; immagini in `test-results/v0-*.png` e `community-*.png`. Solo dati simulati locali.

Nessun telefono fisico collegato: calendario/orologio nativi e materiale Liquid Glass non sono stati osservati su iPhone. Il calendario del piano e il replay GPS non sono stati modificati in questo intervento.

## Commit e rilascio

- `40a3c7b`: data e ora.
- `c06a998`: visibilità e località.
- `31ce054`: barra, test e cache escluse.

Modifiche soltanto mobile: nessun aggiornamento API richiesto. Health e risorse Google verificati HTTP 200 prima della pubblicazione Expo. Server compatibile confermato: `podismo-social-00026-n95`.

Expo iOS branch `main`, runtime `1.0.0`, codice `31ce054`, gruppo **bbe00d27-f01c-4327-ab9f-192cf4dafe5c**, update `01a17e6f-5107-7527-91d0-cf2d3ba602c8`. [QR aggiornato](runngo-expo-v0-2026-10-27.png).
