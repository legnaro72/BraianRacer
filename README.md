# Brain Racer

**Guida. Pensa. Vinci.** Un arcade in italiano: guida tra traffico e ostacoli, raccogli bonus e raggiungi il traguardo. Poi rispondi a tre domande prima di affrontare il livello successivo. Gioca da solo oppure sfida fino a cinque amici.

## Avvio locale

Richiede **Python 3.11 o superiore**. Dalla cartella del progetto:

### Windows / PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
streamlit run app.py
```

Se l'attivazione di PowerShell non è disponibile, usa direttamente:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
streamlit run app.py
```

Apri l'indirizzo mostrato da Streamlit. Non servono API key, account esterni, Node, un processo frontend o una compilazione JavaScript. SQLite viene inizializzato automaticamente e non viene cancellato all'avvio.

## Cosa include

- **Bouquet e cuori**: premi **F** o tocca **✿ BOUQUET** per lanciare fiori. Ogni palloncino a cuore colpito vale **+2 punti**, assegnati una sola volta dal server. Puoi tenere premuto per lanciare a intervalli regolari.
- **Pista a tutta finestra in prospettiva**: orizzonte, alberi e oggetti che crescono avvicinandosi, cabrio con i volti cartoon degli sposi. È una proiezione prospettica su Canvas, non un motore WebGL con modelli 3D.
- **Tre pose degli sposi** (ballo, abbraccio, salto) e sfondo tenue sfocato. Le immagini sono servite da `static/`: questa cartella deve essere pubblicata insieme al codice e `server.enableStaticServing` deve restare attivo.
- **APK Android firmato**: client della stessa web app, con icona degli sposi. Istruzioni di installazione e compilazione in [android/README.md](android/README.md).
- Auto degli sposi **Irene e Daniele**, con fiocchi, bouquet e targa I&D. Tieni premuto **↑**, **W**, **Shift** o **ACCELERA** sul touch per accelerare gradualmente fino a 1,6×.
- Pagina **Dediche**: ogni giocatore può lasciare un messaggio pubblico agli sposi, firmato con nickname e tag, fino a 800 caratteri, modificabile dal proprio profilo.
- Canvas animato con `requestAnimationFrame`, controlli A/D e frecce, pulsanti touch e trascinamento. Coordinate logiche 480 × 720 e movimento indipendente dalla risoluzione.
- Piste deterministiche con corsie, curve leggere, coni, barriere, olio, automobili e camion. Difficoltà crescente e limitata per rimanere giocabile.
- Tre vite, protezione dopo un urto di 1,3 secondi, scudo, stelle e rallentamento di quattro secondi. Particelle, traguardo, audio Web Audio facoltativo e vibrazione quando supportata.
- **224 domande curate in italiano**, in 16 categorie, con tre difficoltà. Validazione completa all'avvio e selezione senza ripetizioni fino all'esaurimento del mazzo.
- Quiz di tre domande da 15 secondi: corretta **+1**, errata/scaduta **−2**, stella **+1**. Sono ammessi punteggi negativi. Il quiz non costa vite.
- Profilo persistente, statistiche, quattro traguardi personali, classifica dei dieci migliori giocatori e un solo record per giocatore.
- Multiplayer reale da 2 a 6 giocatori: lobby, disponibilità, partenza comune, pit stop, quiz sincronizzati, classifica di livello e podio dopo cinque livelli.
- Recupero della partita al refresh, timeout di presenza, trasferimento dell'host in lobby, salvataggio idempotente di risposte, eventi e risultati.

## Come si gioca

1. Scegli un nickname di 3–16 caratteri (lettere, numeri, `_`, `-`). Nickname uguali sono consentiti e distinti da un tag.
2. Scegli **Partita singola** o **Multiplayer**.
3. Usa **← / →**, **A / D**, oppure trascina sulla pista. I pulsanti touch funzionano tenendoli premuti. In singolo **Spazio** mette in pausa; la pausa è disponibile anche con un pulsante.
4. Raccogli **★ stelle**, **⬡ scudi** e **◷ tempo lento**. Lo scudo assorbe un solo urto.
5. Dopo il traguardo rispondi alle tre domande. Il server decide il punteggio e la scadenza.
6. Continua al livello successivo. **Concludi e salva** / **Termina partita** conserva anche il risultato di una partita interrotta volontariamente.

Il suono è disattivato inizialmente: usa il pulsante musicale in alto. Il browser non riceve suoni prima di un'interazione. Le impostazioni audio restano nel browser. I font Google sono una miglioria facoltativa; i caratteri locali di riserva consentono l'uso senza connessioni esterne.

## Identità e refresh

Il server assegna un UUID al giocatore e un token casuale a 256 bit. Nel database viene memorizzato **soltanto l'hash del token**; l'originale resta in `localStorage`. Il nickname non autentica un giocatore. Riaprendo la stessa origine web con lo stesso browser viene ripristinato il profilo, insieme alla partita singola attiva o alla stanza in corso.

La simulazione e gli eventi non ancora confermati hanno un checkpoint locale separato per partita/livello. Se lo storage non è disponibile il gioco funziona durante la sessione, ma il profilo non sopravvive alla sua chiusura. Non sono previste password o recupero su un altro dispositivo. Cancellare lo storage locale elimina la possibilità di accedere a quel profilo. Due amici sullo stesso computer devono usare profili browser distinti o una finestra privata; due schede della stessa origine condividono il giocatore.

## SQLite

Senza `DATABASE_URL`, il file `brain_racer.db` viene creato nella cartella del progetto. WAL, chiavi esterne e `busy_timeout` sono abilitati. Ogni modifica usa `BEGIN IMMEDIATE`: anche processi distinti non possono superare contemporaneamente la capienza di una stanza o assegnare punti due volte.

L'inizializzazione usa `metadata.create_all`, senza `drop_all` o ricreazione distruttiva. È adatta allo schema iniziale: future modifiche strutturali richiederanno migrazioni esplicite e backup. I database e gli eventuali file WAL sono esclusi dal repository. Non conservare il database soltanto sul disco effimero di un hosting se desideri mantenere i record.

## MongoDB Atlas e Streamlit Cloud

Per la pubblicazione prevista usa **MongoDB Atlas** e segui [la guida passo passo](DEPLOY_STREAMLIT.md). Configura `MONGO_URI` nei secrets di Streamlit e `MONGO_DATABASE = "brain_racer"`. I dati di gioco e le dediche vengono conservati in questo database separato. Le collezioni vengono create al primo avvio. Il backend usa transazioni native MongoDB e richiede un replica set, come quello di Atlas.

Senza configurazione remota viene usato SQLite per le prove locali. Non usare SQLite sul disco temporaneo di Streamlit Cloud per conservare i dati degli ospiti.

## PostgreSQL e secrets (alternativa)

Il driver PostgreSQL è incluso. Configura un database e passa la sua URL tramite ambiente:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://USER:PASSWORD@HOST:5432/brain_racer"
streamlit run app.py
```

```bash
export DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST:5432/brain_racer'
streamlit run app.py
```

In alternativa crea **`.streamlit/secrets.toml`**:

```toml
DATABASE_URL = "postgresql+psycopg://USER:PASSWORD@HOST:5432/brain_racer"
```

Per un database gestito puoi aggiungere `?sslmode=require`, secondo le istruzioni del provider. Sono accettati anche i prefissi `postgres://` e `postgresql://`, normalizzati al driver psycopg. Le variabili d'ambiente prevalgono sui secrets. `.env.example` è un esempio: `.env` non viene caricato automaticamente. Non committare credenziali.

## Deployment multiplayer

Il progetto include `Dockerfile`, `compose.yaml`, `Procfile`, `render.yaml` e un launcher `scripts/serve.py` che rispetta la variabile `PORT` dell'hosting. Questi file preparano la pubblicazione, ma **non costituiscono una pubblicazione già avvenuta**: serve una destinazione autorizzata e la verifica dell'URL online.

### Render

`render.yaml` definisce l'app Python e un PostgreSQL persistente, collegati tramite secret gestito. Importa il repository come Blueprint nel tuo account Render. Il template usa risorse a pagamento per evitare database temporanei: prima di applicarlo controlla il costo proposto dal provider. Non sono stati attivati abbonamenti o risorse a pagamento da questo progetto. Il servizio esegue una verifica iniziale della banca domande e della connessione al database prima di avviare Streamlit.

Riferimenti ufficiali: [Blueprint Render](https://render.com/docs/blueprint-spec), [Docker con Streamlit](https://docs.streamlit.io/deploy/tutorials/docker).

### Server con Docker

Imposta in `.env` una password esadecimale casuale di almeno 32 caratteri come `POSTGRES_PASSWORD` (in questo esempio viene interpolata anche nell'URL, quindi usa caratteri URL-safe). Poi:

```bash
docker compose up -d --build
```

Il database usa un volume persistente ed è raggiungibile solo dalla rete interna dei container. L'app è esposta su `127.0.0.1:8501`: pubblicala con un reverse proxy HTTPS sul dominio scelto. Non usare `docker compose down -v` su un'installazione con dati da conservare, perché elimina il volume. Il container applicativo gira come utente non root.

### Streamlit Cloud o altro hosting Python

Tutti i dispositivi devono visitare **la stessa applicazione e lo stesso database**. Su Streamlit Community Cloud configura `app.py` come entrypoint: `requirements.txt` viene installato automaticamente. Aggiungi `MONGO_URI` e `MONGO_DATABASE` ai secrets seguendo [la guida](DEPLOY_STREAMLIT.md). Per un server gestito avvia Streamlit dietro un reverse proxy HTTPS che supporti WebSocket. Con più processi mantieni la sessione WebSocket sullo stesso worker e usa un database condiviso.

Per una prova sulla rete locale:

```bash
streamlit run app.py --server.address 0.0.0.0
```

Apri `http://IP-DEL-COMPUTER:8501` dai dispositivi nella stessa rete e consenti la porta nel firewall solo per la rete desiderata. Non sono necessari un server di gioco distinto, Redis o servizi AI. Il codice stanza viene condiviso manualmente dal giocatore.

## Architettura e sincronizzazione

`app.py` monta un **Custom Component v2** dentro un fragment Streamlit aggiornato una volta al secondo. Python gestisce identità, navigazione, selezione domande, stati e database; il componente visualizza quei dati e invia comandi. Il controller mantiene il Canvas esistente tra i render, senza azzerare l'animazione o i controlli.

La guida usa un generatore **xorshift32** equivalente in Python e JavaScript, inizializzato con seme della stanza e livello. La casualità delle particelle è separata. Si trasmettono eventi con UUID e snapshot di progresso circa ogni 850 ms, **mai fotogrammi o coordinate dei rivali**. Il pannello avversari riceve i dati nel refresh di un secondo. I pacchetti vengono ritentati fino alla conferma, senza riassegnare punti.

Ogni stanza conserva uno stato condiviso nel database:

```text
LOBBY → COUNTDOWN → DRIVING → QUIZ ↔ REVEAL
                                  ↓
                            ROUND_RESULTS
                                  ↓
               COUNTDOWN (livello successivo) / MATCH_RESULTS
```

La partenza è un timestamp UTC futuro di quattro secondi; il client stima lo scarto dell'orologio usando l'ora del server. La simulazione usa delta temporali limitati per evitare salti dopo blocchi della scheda. Il networking Streamlit non consente precisione da e-sport: chi riceve tardi il countdown può iniziare leggermente dopo, ma le scadenze restano condivise.

Il server apre il quiz quando tutti i piloti attivi hanno concluso o scadono **85 secondi**. Un DNF perde una vita e salta il quiz, senza penalità ai punti. I tre ID domanda sono salvati prima del quiz. Le risposte restano private e non vengono valutate pubblicamente finché tutti gli aventi diritto hanno risposto o scade il timer. Ogni rivelazione dura tre secondi, ogni riepilogo sette. I livelli successivi partono automaticamente.

Un heartbeat scrive la presenza circa ogni tre secondi. La perdita di connessione ha una tolleranza di **40 secondi**; poi il giocatore viene eliminato. In lobby l'host viene sostituito automaticamente. Durante la gara l'avanzamento non richiede l'host: qualunque client connesso può far avanzare la macchina a stati. Se nessuno è connesso non gira alcun processo in background: le scadenze vengono riconciliate al successivo accesso. Nascondere la scheda sospende l'animazione locale; in multiplayer il tempo server continua.

Le transazioni PostgreSQL bloccano una piccola riga di coordinamento tramite `SELECT FOR UPDATE`; SQLite usa il proprio lock di scrittura. Questo serializza le brevi mutazioni ed evita gare tra worker. È una scelta semplice per un arcade casuale: un servizio con molte stanze simultanee dovrà passare a lock per stanza e query aggregate per la classifica.

I record di risposta hanno chiave primaria `(partita, livello, domanda)`, gli eventi `(partita, UUID)`. Il risultato aggiorna la partita esistente una sola volta. Il server valida appartenenza, fase, livello, progresso rispetto al tempo trascorso, bonus effettivamente presenti nel percorso, unicità dell'ostacolo e invulnerabilità. Non accetta totali inviati dal client. La posizione della vettura resta client-side: queste protezioni limitano errori e manipolazioni semplici, senza pretendere un anti-cheat competitivo.

La classifica globale usa punti, livello, vite, durata più breve, data e UUID per un ordine deterministico. Il podio multiplayer usa punti, vite, livelli terminati, tempo totale di guida e UUID. La gara finisce dopo cinque livelli oppure quando rimane al massimo un pilota non eliminato; la classifica usa sempre tali criteri.

## Struttura

```text
app.py                    # Entrypoint Streamlit, navigazione e trasporto comandi
brain_racer/
  config.py               # Costanti e curva di difficoltà
  models.py               # Modelli SQLAlchemy
  database.py             # Inizializzazione e unità di lavoro transazionali
  game_service.py         # Regole, eventi e macchine a stati singolo/multiplayer
  course.py               # Generatore deterministico, versione Python
  scoring.py              # Punteggi e criteri di ordinamento
  leaderboard.py          # Record e statistiche
  questions.py            # Validazione, selezione e proiezione pubblica
assets/
  course.js               # Generatore deterministico, versione JavaScript
  game.js                 # Motore Canvas, input, checkpoint e audio
  ui.js                   # Interfaccia e renderer del componente v2
  game.css                # Identità visiva e layout responsive
data/
  questions.json          # Banca domande utilizzata a runtime
  questions_source.tsv    # Sorgente editoriale (separatore |)
scripts/build_questions.py
tests/                    # Regole, concorrenza, cinque livelli e motore JS
```

## Verifiche

```bash
pytest
python -m compileall -q app.py brain_racer scripts
```

Con Node disponibile, esegui anche i test del motore, senza installare pacchetti npm:

```bash
node --test tests/frontend.test.cjs
node --check assets/game.js
node --check assets/ui.js
```

I test Python coprono punteggi, vite, scudi, timeout, risposte ripetute, input errati, isolamento del giocatore, dati persistenti, rollback, leaderboard, richieste concorrenti, capienza, host, DNF, disconnessione, quiz privati e un'intera gara di cinque livelli. Se Node è presente, confrontano anche le piste Python/JavaScript. I test JavaScript verificano input, indipendenza dalla risoluzione, collisioni, bonus, conclusione e checkpoint.

`Streamlit AppTest` 1.55 non esegue il frontend dei Custom Components v2: la verifica del trasporto e del layout richiede il browser. Non considerare AppTest un sostituto del collaudo della guida.

Per modificare il mazzo, aggiorna `data/questions_source.tsv` ed esegui `python scripts/build_questions.py`: le risposte vengono mescolate in modo riproducibile. La banca generata è inclusa e non richiede questa operazione all'avvio.

## Collaudo manuale consigliato prima della pubblicazione

Usa due profili browser indipendenti, uno a dimensione smartphone. Verifica partenza comune, progressi, pit stop, quiz identico, segretezza della prima risposta, rivelazione comune, livello successivo e podio. Prova refresh e disconnessione, e controlla lo scorrimento a 320 px e in orizzontale. Il comportamento degli effetti sonori, della vibrazione e dei gesti fisici dipende dal dispositivo: prova anche su un telefono reale. La configurazione PostgreSQL va verificata contro il database di destinazione prima del deployment.
