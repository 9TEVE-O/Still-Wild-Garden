package garden.stillwild.companion;

import android.annotation.SuppressLint;
import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class GardenWebView extends WebView {
    @SuppressLint("SetJavaScriptEnabled")
    GardenWebView(Context context, GardenRecord garden) throws Exception {
        super(context);
        WebSettings settings = getSettings();
        settings.setJavaScriptEnabled(true); // Only the compiled, bundled renderer, with numeric seed input.
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true); settings.setDomStorageEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        setBackgroundColor(0xff0a120e);
        setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if ("data".equals(request.getUrl().getScheme())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.stillwildSetGarden(" + garden.gardenJson() + ");", null);
            }
        });
        try (InputStream input = context.getAssets().open("garden.html"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            loadDataWithBaseURL("https://stillwild.invalid/", output.toString(StandardCharsets.UTF_8.name()), "text/html", "UTF-8", null);
        }
    }
    void sleep(boolean asleep) {
        evaluateJavascript("window.stillwildPause && window.stillwildPause(" + asleep + ");", null);
        if (asleep) onPause(); else onResume();
    }
}
