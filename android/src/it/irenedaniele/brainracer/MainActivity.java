package it.irenedaniele.brainracer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.*;
import android.widget.*;

/** Dedicated HTTPS client. No URL preferences, setup screen or native JS bridge. */
public final class MainActivity extends Activity {
    private WebView web;
    private LinearLayout offline;
    private ProgressBar progress;
    private boolean failed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(255,248,239));
        getWindow().setNavigationBarColor(Color.rgb(255,248,239));
        FrameLayout root=new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255,248,239));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(255,248,239));
        web.setFitsSystemWindows(true);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        root.addView(progress,new FrameLayout.LayoutParams(-1,8));
        offline=new LinearLayout(this);offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(android.view.Gravity.CENTER);offline.setPadding(32,32,32,32);
        TextView message=new TextView(this);message.setText("La festa non è raggiungibile.\nÈ necessaria una connessione Internet. Controlla la connessione e riprova.");
        message.setTextSize(20);message.setGravity(17);message.setTextColor(Color.rgb(110,63,88));
        offline.addView(message);Button retry=new Button(this);retry.setText("Riprova");
        retry.setOnClickListener(v->loadHome());offline.addView(retry);
        offline.setVisibility(View.GONE);root.addView(offline,new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){
                progress.setProgress(value);progress.setVisibility(value<100&&!failed?View.VISIBLE:View.GONE);
            }
        });
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri next=request.getUrl();
                if("https".equals(next.getScheme())&&Uri.parse(BuildConfig.APP_URL).getHost().equals(next.getHost()))return false;
                if(request.isForMainFrame()&&("https".equals(next.getScheme())||"http".equals(next.getScheme()))){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,next));}catch(Exception ignored){}
                }return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){
                if(req.isForMainFrame())showOffline();
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse response){
                if(req.isForMainFrame()&&response.getStatusCode()>=400)showOffline();
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){
                handler.cancel();showOffline();
            }
        });
        // Always use the dedicated address, including upgrades with an old saved URL.
        // No restoreState: an old WebView history must never override the destination.
        loadHome();
    }
    private void loadHome(){
        failed=false;offline.setVisibility(View.GONE);web.setVisibility(View.VISIBLE);
        progress.setVisibility(View.VISIBLE);web.loadUrl(BuildConfig.APP_URL);
    }
    private void showOffline(){
        failed=true;progress.setVisibility(View.GONE);web.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);
    }
    @Override public void onBackPressed(){
        if(!failed&&web.canGoBack())web.goBack();
        else new AlertDialog.Builder(this).setTitle("Irene e Daniele")
            .setItems(new String[]{"Torna alla festa","Ricarica","Esci"},(d,w)->{
                if(w==1)loadHome();if(w==2)finish();}).show();
    }
    @Override public void onDestroy(){web.stopLoading();web.destroy();super.onDestroy();}
}
