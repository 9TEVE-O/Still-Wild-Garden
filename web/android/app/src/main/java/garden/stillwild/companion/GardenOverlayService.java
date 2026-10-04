package garden.stillwild.companion;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.pm.ServiceInfo;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.ContextThemeWrapper;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.InputStream;

public final class GardenOverlayService extends Service {
    public static final String START = "garden.stillwild.SHOW", STOP = "garden.stillwild.HIDE";
    static final String CHANNEL = "floating-garden";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private Context ui;
    private FrameLayout root;
    private WindowManager.LayoutParams position;
    private GardenWebView web;
    private GardenRecord garden;
    private boolean expanded, attached, sleeping;
    private int screenWidth, screenHeight;

    @Override public void onCreate() {
        super.onCreate();
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Floating garden", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while your garden floats over other apps.");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !START.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        try {
            garden = GardenStore.read(this);
            NotificationManager notifications = getSystemService(NotificationManager.class);
            NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
            if (garden == null || !Settings.canDrawOverlays(this) || !notifications.areNotificationsEnabled() ||
                    channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                Toast.makeText(this, "Import your garden and enable overlay and floating-garden notifications first.", Toast.LENGTH_LONG).show();
                stopSelf(); return START_NOT_STICKY;
            }
            if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1, notification());
            if (!attached) {
                Context windowContext = this;
                if (Build.VERSION.SDK_INT >= 30) {
                    Display display = getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
                    if (display == null) throw new IllegalStateException("No display is available.");
                    windowContext = createDisplayContext(display).createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null);
                }
                ui = new ContextThemeWrapper(windowContext, R.style.AppTheme);
                windows = (WindowManager) windowContext.getSystemService(WINDOW_SERVICE);
                root = new FrameLayout(ui);
                position = new WindowManager.LayoutParams(dp(112), dp(80), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
                position.gravity = Gravity.TOP | Gravity.LEFT;
                position.setTitle("Stillwild floating garden");
                measureScreen();
                position.x = GardenStore.preferences(this).getBoolean("right", true) ? screenWidth - position.width : 0;
                position.y = Math.round(GardenStore.preferences(this).getFloat("vertical", .25f) * Math.max(0, screenHeight - position.height));
                render(false);
                windows.addView(root, position); attached = true;
                handler.post(lifecycle);
            }
        } catch (Exception e) {
            Toast.makeText(this, "The floating garden could not open. Check permissions and try again.", Toast.LENGTH_LONG).show();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent hide = PendingIntent.getService(this, 1, new Intent(this, GardenOverlayService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_garden).setContentTitle("Stillwild is floating")
            .setContentText("Tap to open. Hide keeps your garden growing.").setContentIntent(open)
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
            .addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_garden), "Hide", hide).build()).build();
    }

    private final Runnable lifecycle = new Runnable() {
        @Override public void run() {
            if (!attached) return;
            NotificationManager notifications = getSystemService(NotificationManager.class);
            NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
            if (!Settings.canDrawOverlays(GardenOverlayService.this) || !notifications.areNotificationsEnabled() || channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                stopSelf(); return;
            }
            boolean nowSleeping = !getSystemService(PowerManager.class).isInteractive() || getSystemService(KeyguardManager.class).isKeyguardLocked();
            if (nowSleeping != sleeping) {
                sleeping = nowSleeping; root.setVisibility(sleeping ? View.GONE : View.VISIBLE);
                if (web != null) web.sleep(sleeping);
            }
            handler.postDelayed(this, 1500);
        }
    };

    private void render(boolean unfold) {
        expanded = unfold;
        disposeWeb();
        root.removeAllViews();
        measureScreen();
        position.width = Math.min(dp(unfold ? 340 : 112), screenWidth);
        position.height = Math.min(dp(unfold ? 400 : 80), screenHeight);
        if (unfold) {
            LinearLayout panel = new LinearLayout(ui); panel.setOrientation(LinearLayout.VERTICAL); panel.setBackground(glass(dp(24)));
            panel.setPadding(dp(2), dp(2), dp(2), dp(2)); panel.setClipToOutline(true);
            root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout bar = new LinearLayout(ui); bar.setGravity(Gravity.CENTER_VERTICAL);
            TextView handle = new TextView(ui); handle.setText("stillwild.  ↕"); handle.setTextColor(0xffe2ead6); handle.setTextSize(19); handle.setPadding(dp(14), 0, 0, 0);
            handle.setContentDescription("Drag to move your garden"); handle.setOnTouchListener(new Drag());
            bar.addView(handle, new LinearLayout.LayoutParams(0, dp(52), 1));
            bar.addView(control("−", "Collapse garden", v -> render(false)), new LinearLayout.LayoutParams(dp(48), dp(48)));
            bar.addView(control("×", "Hide floating garden", v -> stopSelf()), new LinearLayout.LayoutParams(dp(48), dp(48)));
            panel.addView(bar);
            try {
                web = new GardenWebView(ui, garden); panel.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
                if (sleeping) web.sleep(true);
            } catch (Exception e) {
                TextView problem = new TextView(ui); problem.setText("The garden view could not open. Hide it and try again."); problem.setTextColor(Color.WHITE); panel.addView(problem);
            }
            TextView footer = new TextView(ui); footer.setText("Same garden. A smaller window."); footer.setTextSize(12); footer.setTextColor(0xffb1c3a4); footer.setPadding(dp(16), dp(12), dp(16), dp(12)); panel.addView(footer);
        } else {
            ImageView bubble = new ImageView(ui); bubble.setContentDescription("Stillwild garden. Tap to expand, drag to move.");
            bubble.setPadding(dp(12), dp(12), dp(12), dp(12)); bubble.setBackground(glass(dp(40))); bubble.setScaleType(ImageView.ScaleType.FIT_CENTER);
            try (InputStream image = getAssets().open("sapling.png")) { bubble.setImageBitmap(BitmapFactory.decodeStream(image)); }
            catch (Exception ignored) { bubble.setImageResource(R.drawable.ic_garden); }
            bubble.setOnClickListener(v -> render(true)); bubble.setOnTouchListener(new Drag());
            FrameLayout.LayoutParams orb = new FrameLayout.LayoutParams(dp(72), dp(72)); orb.gravity = Gravity.LEFT | Gravity.CENTER_VERTICAL; root.addView(bubble, orb);
            Button hide = control("×", "Hide floating garden", v -> stopSelf());
            FrameLayout.LayoutParams close = new FrameLayout.LayoutParams(dp(44), dp(44)); close.gravity = Gravity.RIGHT | Gravity.TOP; root.addView(hide, close);
        }
        clamp(); if (attached) updateWindow();
    }

    private Button control(String label, String description, View.OnClickListener click) {
        Button button = new Button(ui); button.setText(label); button.setTextSize(24); button.setTextColor(0xffd5e4ad);
        button.setPadding(0, 0, 0, 0); button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(0); button.setMinimumHeight(0);
        button.setBackground(glass(dp(24))); button.setContentDescription(description); button.setOnClickListener(click); return button;
    }
    private GradientDrawable glass(int radius) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xf233503c, 0xf0102118});
        shape.setCornerRadius(radius); shape.setStroke(dp(1), 0xff899e75); return shape;
    }

    private final class Drag implements View.OnTouchListener {
        private float downX, downY; private int startX, startY; private boolean moved;
        @Override public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX(); downY = event.getRawY(); startX = position.x; startY = position.y; moved = false; return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                    if (Math.hypot(dx, dy) > ViewConfiguration.get(ui).getScaledTouchSlop()) moved = true;
                    if (moved) { position.x = startX + Math.round(dx); position.y = startY + Math.round(dy); clamp(); updateWindow(); } return true;
                case MotionEvent.ACTION_UP:
                    if (!moved) view.performClick(); else snapAndSave(); return true;
                case MotionEvent.ACTION_CANCEL:
                    snapAndSave(); return true;
                default: return false;
            }
        }
    }
    private void snapAndSave() {
        boolean right = position.x + position.width / 2 > screenWidth / 2;
        position.x = right ? Math.max(0, screenWidth - position.width) : 0; clamp(); updateWindow();
        GardenStore.preferences(this).edit().putBoolean("right", right).putFloat("vertical", (float) position.y / Math.max(1, screenHeight - position.height)).apply();
    }
    private void clamp() { position.x = Math.max(0, Math.min(position.x, screenWidth - position.width)); position.y = Math.max(0, Math.min(position.y, screenHeight - position.height)); }
    private void updateWindow() { if (attached) try { windows.updateViewLayout(root, position); } catch (RuntimeException e) { stopSelf(); } }
    private void measureScreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowMetrics metrics = windows.getCurrentWindowMetrics();
            android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            screenWidth = Math.max(1, metrics.getBounds().width() - insets.left - insets.right);
            screenHeight = Math.max(1, metrics.getBounds().height() - insets.top - insets.bottom);
        } else {
            DisplayMetrics metrics = new DisplayMetrics(); windows.getDefaultDisplay().getMetrics(metrics); screenWidth = metrics.widthPixels; screenHeight = metrics.heightPixels;
        }
    }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); if (attached) render(expanded); }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (attached) { try { windows.removeView(root); } catch (RuntimeException ignored) { } attached = false; }
        disposeWeb();
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    private void disposeWeb() {
        if (web == null) return;
        if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
        web.stopLoading(); web.destroy(); web = null;
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
