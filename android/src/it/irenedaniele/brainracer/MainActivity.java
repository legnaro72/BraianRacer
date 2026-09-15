package it.irenedaniele.brainracer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Thin Android client: the hosted app and Atlas remain the single source of truth. */
public final class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences prefs;
    private String appUrl;
    private boolean errorVisible;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(255,248,239));
        getWindow().setNavigationBarColor(Color.rgb(255,248,239));
        prefs=getSharedPreferences("wedding", MODE_PRIVATE);
        appUrl=prefs.getString("url", BuildConfig.APP_URL);
        if(valid(appUrl)) openApp(state); else setup();
    }

    static boolean valid(String value) {
        try {
            Uri u=Uri.parse(value);
            return "https".equals(u.getScheme()) && u.getHost()!=null
                && u.getUserInfo()==null && !u.getHost().equals("localhost")
                && !u.getHost().equals("127.0.0.1");
        } catch(Exception e) { return false; }
    }

    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }

    private void setup() {
        if(web!=null){web.destroy();web=null;}
        ScrollView scroll=new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(255,248,239));scroll.setFillViewport(true);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(26),dp(35),dp(26),dp(24));box.setGravity(android.view.Gravity.CENTER);
        ImageView image=new ImageView(this);image.setImageResource(R.drawable.couple_icon);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setContentDescription("Irene e Daniele in versione cartoon");
        box.addView(image,new LinearLayout.LayoutParams(dp(210),dp(210)));
        TextView title=new TextView(this);title.setText("Irene e Daniele\nLa festa continua!");
        title.setTextSize(27);title.setTextColor(Color.rgb(132,66,96));title.setGravity(17);
        box.addView(title);
        TextView intro=new TextView(this);
        intro.setText("Collega l'app Android all'indirizzo pubblico della web app. Lo inserisci una sola volta: gare, dediche e classifica saranno quelle del sito.");
        intro.setTextSize(16);intro.setPadding(0,dp(22),0,dp(16));box.addView(intro);
        EditText url=new EditText(this);url.setSingleLine(true);
        url.setHint("https://nome-app.streamlit.app");url.setText(appUrl==null?"":appUrl);
        url.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);
        url.setContentDescription("Indirizzo HTTPS pubblico del gioco");box.addView(url,new LinearLayout.LayoutParams(-1,-2));
        Button open=new Button(this);open.setText("Entra nella festa");
        open.setOnClickListener(v->{String value=url.getText().toString().trim();
            if(!valid(value)){url.setError("Inserisci un indirizzo pubblico completo che inizi con https://");return;}
            appUrl=value;prefs.edit().putString("url",value).apply();openApp(null);
        });box.addView(open,new LinearLayout.LayoutParams(-1,dp(58)));
        TextView hint=new TextView(this);hint.setText("Serve una connessione Internet. Per cambiare indirizzo tieni premuto il tasto Indietro.");
        hint.setTextSize(12);hint.setPadding(0,dp(20),0,0);box.addView(hint);
        scroll.addView(box);setContentView(scroll);
    }

    private void openApp(Bundle state) {
        web=new WebView(this);web.setBackgroundColor(Color.rgb(255,248,239));
        web.setFitsSystemWindows(true);setContentView(web,new ViewGroup.LayoutParams(-1,-1));
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri next=request.getUrl(),home=Uri.parse(appUrl);
                if("https".equals(next.getScheme())&&home.getHost().equals(next.getHost()))return false;
                if("https".equals(next.getScheme())||"http".equals(next.getScheme())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,next));}catch(Exception ignored){}
                }return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){
                if(!req.isForMainFrame()||errorVisible)return;
                errorVisible=true;new AlertDialog.Builder(MainActivity.this)
                    .setTitle("La festa non è raggiungibile")
                    .setMessage("Controlla Internet e che la web app sia online. Puoi riprovare o cambiare indirizzo.")
                    .setPositiveButton("Riprova",(d,w)->{errorVisible=false;web.loadUrl(appUrl);})
                    .setNegativeButton("Cambia indirizzo",(d,w)->{errorVisible=false;setup();})
                    .setOnCancelListener(d->errorVisible=false).show();
            }
        });
        if(state==null||web.restoreState(state)==null)web.loadUrl(appUrl);
    }

    @Override public boolean onKeyLongPress(int key,android.view.KeyEvent event){
        if(key==android.view.KeyEvent.KEYCODE_BACK){setup();return true;}
        return super.onKeyLongPress(key,event);
    }
    @Override public void onBackPressed(){
        if(web!=null&&web.canGoBack())web.goBack();
        else new AlertDialog.Builder(this).setTitle("Irene e Daniele")
            .setItems(new String[]{"Torna alla festa","Ricarica","Cambia indirizzo","Esci"},(d,w)->{
                if(w==1&&web!=null)web.reload();if(w==2)setup();if(w==3)finish();}).show();
    }
    @Override public void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(web!=null)web.saveState(state);}
    @Override public void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
