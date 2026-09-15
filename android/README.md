# Irene e Daniele per Android

Il client Android apre la stessa web app HTTPS usata dal browser: partite, classifica e dediche sono conservate sul database configurato dal server. Non contiene credenziali Atlas e richiede Internet. Compatibile con Android 8.0 o successivo.

Il pacchetto firmato si trova in `artifacts/Irene-e-Daniele.apk`. Copialo sul telefono e aprilo, autorizzando l'installazione per l'app da cui apri il file, se Android lo richiede. L'APK non è pubblicato sul Play Store.

L'app apre direttamente `https://irenedaniele.streamlit.app/` a ogni avvio. Non esiste una schermata di configurazione e gli URL salvati dalle versioni precedenti vengono ignorati. Se manca Internet o il sito non risponde, compare un messaggio con il pulsante **Riprova**. Il menu Indietro permette di ricaricare o uscire.

Il profilo viene mantenuto nello storage della WebView Android. Browser e APK hanno storage distinti: condividono il sito e i dati pubblici, ma non trasferiscono automaticamente l'identità privata del giocatore tra dispositivi.

## Compilare

Richiede JDK e Android SDK con Build Tools 35.0.0 e piattaforma android-36:

```powershell
.\.venv\Scripts\python.exe scripts/build_android.py
```

L'URL è definito una sola volta nella costante interna `APP_URL` del builder. Il builder compila Java e risorse, produce il DEX, allinea l'APK e firma con APK Signature Scheme v2/v3. Esegue la verifica della firma e scrive l'hash SHA-256 accanto all'APK.

La chiave di firma e la relativa password vengono conservate soltanto in `.android-private`, esclusa da Git, dal pacchetto sorgenti e da Docker. Conservane una copia privata per poter aggiornare l'app già installata. Non pubblicare questa cartella. Per gli aggiornamenti incrementare `--version-code` nel builder.

Versione 1.1 (versionCode 2), firmata con la stessa chiave della versione 1.0 per consentire aggiornamenti. La firma e la struttura del pacchetto sono state verificate; la prova su un telefono Android reale resta da eseguire.
