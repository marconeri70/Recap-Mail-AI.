# Recap Mail AI

Webapp/PWA per trasformare conversazioni, telefonate, riunioni e meeting in una email di recap chiara e tutelante.

## Funzioni principali

- Trascrizione live dal microfono tramite browser.
- Registrazione audio dal microfono.
- Caricamento file audio/video.
- Collegamento opzionale a un backend AI per trascrivere file audio registrati.
- Pulizia rapida della trascrizione.
- Generazione email di recap con tono neutro, formale, collaborativo, sintetico o tutelante.
- Estrazione automatica di decisioni, azioni, scadenze e punti aperti.
- Copia email, apertura client email, download TXT ed EML.
- Storico locale sul dispositivo.
- Installabile come PWA.

## Limite importante sulle telefonate

Una webapp aperta nel browser non può catturare direttamente l'audio interno di una chiamata telefonica Android/iPhone.

Per usare l'app con una telefonata puoi:

1. mettere la telefonata in vivavoce e usare “Trascrivi live”;
2. caricare una registrazione autorizzata;
3. usare un meeting online registrato e caricare il file audio/video.

Usa sempre registrazioni e trascrizioni nel rispetto della normativa e della privacy.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub.
2. Carica tutti i file della cartella `recap-email-app`.
3. Vai in `Settings > Pages`.
4. Seleziona branch `main` e cartella `/root`.
5. Apri il link generato da GitHub Pages.
6. Da telefono: menu browser > “Aggiungi a schermata Home”.

## Trascrizione AI da file audio

La webapp pubblicata su GitHub Pages non deve contenere chiavi API. Per trascrivere file audio con AI devi usare un piccolo backend separato.

Nella cartella `backend` trovi un esempio Node/Express:

- riceve un file audio;
- lo invia all'API di trascrizione;
- restituisce il testo alla webapp;
- mantiene la chiave API solo sul server.

Dopo aver pubblicato il backend, inserisci l'URL nel campo “Endpoint AI opzionale”, per esempio:

```text
https://tuo-dominio.it/api/transcribe
```

## Uso consigliato

### Meeting live

1. Scrivi partecipanti e oggetto.
2. Inserisci nel campo “Nomi, termini tecnici” eventuali nomi difficili.
3. Premi “Trascrivi live”.
4. Alla fine premi “Pulisci testo”.
5. Premi “Usa nel recap”.
6. Premi “Genera email recap”.

### Telefonata

1. Metti la telefonata in vivavoce.
2. Appoggia il telefono vicino alla sorgente audio oppure usa un secondo dispositivo.
3. Premi “Trascrivi live”.
4. Controlla e correggi la trascrizione.
5. Genera il recap.

### File audio registrato

1. Carica il file audio/video.
2. Inserisci l'endpoint AI backend.
3. Premi “Trascrivi file con AI”.
4. Controlla la trascrizione.
5. Premi “Usa nel recap”.
6. Genera email.
