# Recap Mail AI

Webapp/PWA per creare email di recap dopo conversazioni, telefonate o meeting.

## Funzioni

- Inserimento appunti o trascrizione
- Dettatura vocale dove supportata dal browser
- Estrazione semplice di decisioni, azioni e punti aperti tramite parole chiave
- Generazione email pronta da copiare
- Apertura client email con `mailto:`
- Download TXT ed EML
- Storico locale con `localStorage`
- Funzionamento offline tramite service worker

## Come pubblicarla su GitHub Pages

1. Crea un nuovo repository su GitHub, ad esempio `recap-mail-ai`.
2. Carica tutti i file contenuti in questa cartella.
3. Vai su **Settings > Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**.
5. Seleziona branch `main` e cartella `/root`.
6. Apri il link generato da GitHub Pages.

## Privacy

L'app non usa backend e non invia dati a server esterni. Lo storico resta nel browser/dispositivo dell'utente. La dettatura vocale dipende dal browser e dal sistema operativo: va usata solo con consenso e nel rispetto della privacy.

## Parole chiave utili negli appunti

Scrivi righe come:

- `Deciso: inviare il documento corretto entro domani.`
- `Azione: Marco prepara il riepilogo.`
- `Punto aperto: attendere conferma sulla data.`
- `Scadenza: venerdì mattina.`
