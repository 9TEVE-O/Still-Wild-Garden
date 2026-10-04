package garden.stillwild.companion;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int IMPORT = 10, NOTIFICATIONS = 11;
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(32), dp(24), dp(24)); scroll.addView(body); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets;
        });
        TextView title = text("stillwild.", 42); title.setTypeface(Typeface.SERIF); body.addView(title);
        body.addView(text("Your garden, a little closer.", 19));
        status = text("", 17); status.setPadding(0, dp(24), 0, dp(16)); body.addView(status);
        body.addView(button("Open my website", v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://stillwild-garden.subzteveo.chatgpt.site")))));
        body.addView(text("On the website, open ⓘ and choose Save for Android. Import that file below to keep the same garden.", 15));
        body.addView(button("Import my garden", v -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
            startActivityForResult(intent, IMPORT);
        }));
        body.addView(button("Show floating garden", v -> requestStart()));
        body.addView(button("Hide floating garden", v -> { stopService(new Intent(this, GardenOverlayService.class)); refresh(); }));
        body.addView(text("Drag the small garden to move it. Tap to expand. Hide it here, on the bubble, or from its notification. Hiding it never resets its growth.", 15));
        body.addView(text("This companion works offline using your original seed and planting time. Android may hide overlays on protected screens or stop the app to save power. Open Stillwild to show it again.", 14));
    }

    @Override protected void onResume() { super.onResume(); refresh(); }
    private void refresh() {
        try {
            GardenRecord garden = GardenStore.read(this);
            status.setText(garden == null ? "Bring your existing garden here." : "Your garden is saved. Day " + (Math.max(0L, System.currentTimeMillis() - garden.bornAt) / 86400000L + 1) + ". Still growing.");
        } catch (Exception e) { status.setText("The saved garden could not be read. It has not been replaced."); }
    }

    private void requestStart() {
        try { if (GardenStore.read(this) == null) { explain("Import your garden first."); return; } }
        catch (Exception e) { explain("The saved garden could not be read. It has not been replaced."); return; }
        if (!Settings.canDrawOverlays(this)) {
            new AlertDialog.Builder(this).setTitle("Allow your garden to float")
                .setMessage("Turn on Display over other apps for Stillwild, then return and tap Show floating garden.")
                .setPositiveButton("Open settings", (d, w) -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))))
                .setNegativeButton("Later", null).show(); return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS); return;
        }
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) {
            new AlertDialog.Builder(this).setTitle("Keep the hide control nearby")
                .setMessage("Enable Stillwild notifications so its ongoing notification can show a Hide button.")
                .setPositiveButton("Open settings", (d, w) -> startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())))
                .setNegativeButton("Later", null).show(); return;
        }
        android.app.NotificationChannel channel = getSystemService(NotificationManager.class).getNotificationChannel(GardenOverlayService.CHANNEL);
        if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
            new AlertDialog.Builder(this).setMessage("Enable the Floating garden notification channel, then return and tap Show floating garden.")
                .setPositiveButton("Open settings", (d, w) -> startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID, GardenOverlayService.CHANNEL)))
                .setNegativeButton("Later", null).show(); return;
        }
        startOverlay();
    }

    private void startOverlay() {
        try { startForegroundService(new Intent(this, GardenOverlayService.class).setAction(GardenOverlayService.START)); }
        catch (RuntimeException e) { explain("Android could not start the floating garden. Check its overlay and notification permissions, then try again."); }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == NOTIFICATIONS) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) requestStart();
            else explain("The bubble is off. Enable notifications in Android Settings → Apps → Stillwild, then tap Show floating garden.");
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != IMPORT || result != RESULT_OK || data == null || data.getData() == null) return;
        try (InputStream input = getContentResolver().openInputStream(data.getData()); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalArgumentException("The file could not be opened.");
            byte[] buffer = new byte[1024]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > GardenRecord.MAX_BYTES) throw new IllegalArgumentException("Choose the small JSON file from Save for Android, not a gift or image.");
                output.write(buffer, 0, count);
            }
            GardenRecord record = GardenRecord.parse(output.toString(StandardCharsets.UTF_8.name()));
            GardenStore.importOnce(this, record); refresh(); explain("Your existing garden is saved. Its beginning has stayed the same.");
        } catch (Exception e) { explain("Could not import this garden. " + (e instanceof IllegalArgumentException ? e.getMessage() : "Use the JSON file from Save for Android.")); }
    }

    private void explain(String message) { new AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show(); }
    private TextView text(String value, int size) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(Color.rgb(226, 234, 214)); view.setPadding(0, dp(8), 0, dp(8)); return view; }
    private Button button(String value, View.OnClickListener action) { Button button = new Button(this); button.setText(value); button.setAllCaps(false); button.setMinHeight(dp(52)); button.setOnClickListener(action); return button; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
