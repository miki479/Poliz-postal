# Turno Reale

Web app mobile per confrontare la produzione dei turni **Michele & Simone** e **Gabriele & Arthur**.

## Regole già impostate

- mattina: 8 ore produttive;
- pomeriggio: 7 ore produttive più 1 ora di lavaggio;
- venerdì: 1 ora in meno per entrambi;
- pausa effettuata: 30 minuti sottratti al turno;
- fermate e cambi: si possono aggiungere più eventi per turno scegliendo tipo e minuti; il totale viene sottratto dal tempo produttivo e resta visibile nel passaggio consegne;
- movimentazione 25 L: quando il turno contiene fusti da 25 L vengono sottratti automaticamente 15 minuti al mattino per il carico e 15 minuti al pomeriggio per lo scarico;
- pomeriggio con poca produzione: il tempo restante viene considerato automaticamente dedicato alle pulizie, senza generare un ritardo fittizio e senza aggiungere punti alla produzione;
- turno unico: salvato nello storico ma escluso dal confronto;
- personale predefinito: 4 addetti; sotto 4 il turno viene segnalato come personale ridotto;
- confronto principale: indice ponderato sulle velocità di riferimento (25 L: 120/h con due teste o 65/h con una testa; 20 L: 33/h; bag: 260/h), con i conteggi reali sempre mostrati separatamente;
- sfida valida: una giornata assegna una vittoria solo quando entrambi i turni hanno produzione per almeno metà del rispettivo tempo disponibile; in caso contrario mostra chi ha prodotto di più ma non dichiara un vincitore;
- indice 100: una linea lavora al proprio ritmo standard per l'intero turno; l'indice può superare 100 quando più linee lavorano contemporaneamente.
- bilancio tempo automatico: il mattino viene valutato sul lavoro giornaliero disponibile fino alla propria capacità; il pomeriggio completa il resto e il tempo rimanente è considerato pulizia;
- passaggio consegne: l'eventuale ritardo del mattino è mostrato come arretrato affidato al pomeriggio, insieme ai minuti recuperati o ancora mancanti.

## Pubblicazione su Render

Il file `render.yaml` è già pronto per un **Blueprint** Render. La pubblicazione usa una build statica servita da un processo Node minimale, senza dipendere da server di sviluppo:

1. carica questo progetto in un repository GitHub;
2. in Render scegli **New → Blueprint**;
3. collega il repository e conferma il servizio `turno-reale`;
4. a pubblicazione finita, apri l'indirizzo Render su iPhone.

Per usarla come un'app: in Safari tocca **Condividi → Aggiungi alla schermata Home**.

## Dati e backup

I dati restano nel browser dell'iPhone e non vengono inviati a un server. Il pulsante con l'icona database permette di scaricare un backup JSON in File/iCloud e di ripristinarlo. Cancellare i dati di Safari elimina anche i conteggi locali se non esiste un backup.

## Sviluppo locale

```bash
npm install
npm run dev
```

Build di verifica:

```bash
npm run build
```
