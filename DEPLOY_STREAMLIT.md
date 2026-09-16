# Pubblicare Brain Racer per Irene e Daniele

## 1. Repository GitHub

Accedi a GitHub con l'account `legnaro72` e crea un repository chiamato `brain-racer`, inizializzandolo con un README. Carica i sorgenti nella radice del repository: `app.py` deve essere visibile subito, senza una cartella contenitore aggiuntiva. Il pacchetto `artifacts/brain-racer-source.zip` contiene soltanto i file da distribuire: estrai la cartella e caricane il contenuto, comprese `.streamlit` e `.github`.

Non caricare `.venv`, `brain_racer.db` o un file `secrets.toml` con credenziali reali.

## 2. Creare l'app Streamlit

Apri [Streamlit Community Cloud](https://share.streamlit.io/) con il tuo account abituale. Scegli **Create app**, seleziona il nuovo repository, il branch `main` e il file principale `app.py`. Nelle impostazioni avanzate scegli Python **3.11** se disponibile.

## 3. Collegare Atlas

Prima di avviare il deploy, inserisci nei **Secrets**:

```toml
MONGO_URI = "INCOLLA_QUI_IL_VALORE_REALE_DI_MONGO_URI"
MONGO_DATABASE = "brain_racer"
```

Puoi recuperare il valore di `MONGO_URI` dal file locale `C:\Progetti\torneo-Subbuteo-webapp-official\.streamlit\secrets.toml`. Copialo direttamente nel pannello privato di Streamlit. Mantieni `MONGO_DATABASE` uguale a `brain_racer`: il gioco usa un database separato da quello del torneo.

L'utente Atlas deve poter leggere e scrivere su `brain_racer`; l'accesso di rete Atlas deve consentire le connessioni dall'hosting. La connessione dal computer locale è stata verificata, ma questo non dimostra ancora che la rete di Streamlit Cloud abbia accesso.

## Album fotografico condiviso

Per attivare **Foto ♥**, crea un progetto Google Cloud, abilita Google Drive API e crea una service account. Crea sul tuo Drive una cartella dedicata alle foto del matrimonio e condividila con l'indirizzo email della service account come **Editor**. Aggiungi poi questi Secrets (senza pubblicarli su GitHub):

```toml
GOOGLE_DRIVE_FOLDER_ID = "ID_DELLA_CARTELLA"
GOOGLE_SERVICE_ACCOUNT_JSON = '''INCOLLA_QUI_IL_JSON_COMPLETO_DELLA_SERVICE_ACCOUNT'''
SUPERVISOR_PASSWORD = "Irene Daniele"
```

Le foto sono caricate nella cartella Drive e la loro lista, autore e stato Flipbook restano in Atlas. L'app rende ogni foto leggibile dagli invitati, come scelto per la galleria comune; la cartella Drive può restare privata. La password supervisore serve soltanto ad approvare o rimuovere gli scatti dal Flipbook.

## 4. Pubblicare e provare

Premi **Deploy** e attendi il completamento. Se compare un errore, apri i log da **Manage app** e condividi il tipo di errore senza credenziali.

Apri l'URL pubblico e verifica:

1. Registra un nickname e completa un livello, usando anche l'acceleratore.
2. Apri **Dediche**, salva un messaggio e ricarica: deve essere ancora presente.
3. Apri l'app da un secondo dispositivo o da una finestra privata. Verifica la dedica e prova una stanza multiplayer con due giocatori.
4. Riavvia l'app da Streamlit e verifica che dedica, profilo e risultati persistano su Atlas.
5. Controlla le impostazioni di condivisione dell'app e consenti l'accesso agli invitati tramite il link.

La pubblicazione è conclusa quando l'URL pubblico funziona e queste prove passano. Al momento il deploy e la prova completa del backend Atlas restano da eseguire.

Documentazione ufficiale: [deploy Streamlit](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy), [gestione secrets](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management).
