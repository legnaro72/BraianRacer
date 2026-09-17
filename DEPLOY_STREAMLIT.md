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

Per attivare **Foto ♥**, aggiungi i Secrets del backend Google Apps Script già deployato (senza pubblicarli su GitHub):

```toml
GOOGLE_DRIVE_WEBAPP_URL = "https://SCRIPT.GOOGLE.COM/macros/s/.../exec"
GOOGLE_DRIVE_API_TOKEN = "INSERISCI_IL_TOKEN_DEL_BACKEND"
SUPERVISOR_PASSWORD = "INSERISCI_QUI_UNA_PASSWORD_FORTE"
```

Le foto sono caricate e lette attraverso Apps Script, mentre lista, autore e stato Flipbook restano in Atlas. La cartella Drive rimane privata e non vengono esposti URL Drive agli invitati. La password supervisore serve soltanto ad approvare o rimuovere gli scatti dal Flipbook.

Per consentire agli sposi di eliminare una foto, Apps Script deve accettare anche:

```json
{"token":"...", "action":"delete", "fileId":"..."}
```

e rispondere con `{"ok":true,"fileId":"..."}` soltanto dopo aver spostato il file nel cestino di Drive. Streamlit rimuove il record Atlas esclusivamente dopo questa conferma. L'operazione deve essere idempotente: una seconda richiesta sullo stesso file deve restituire `ok=true`, così un errore Atlas successivo alla cancellazione Drive può essere recuperato senza lasciare un record bloccato.

Il sorgente completo del backend, inclusa l'azione `delete`, è in `google_apps_script/Code.gs`. Dopo averlo copiato nell'editor Apps Script, occorre aggiornare il deployment della web app creando una **nuova versione**; il semplice salvataggio del progetto non aggiorna l'URL `/exec` già usato da Streamlit.

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
