# Turno Reale

Web app mobile per confrontare la produzione dei turni **Michele & Simone** e **Gabriele & Arthur**.

## Regole già impostate

- mattina: 8 ore produttive;
- pomeriggio: 6 ore e 45 minuti produttivi;
- venerdì: 1 ora in meno per entrambi;
- pausa effettuata: 30 minuti sottratti al turno;
- turno unico: salvato nello storico ma escluso dal confronto;
- personale predefinito: 4 addetti; sotto 4 il turno viene segnalato come personale ridotto;
- confronto principale: totale fusti + bag per ora netta, con i tre formati sempre mostrati separatamente.

## Pubblicazione su Render

Il file `render.yaml` è già pronto per un **Blueprint** Render:

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
