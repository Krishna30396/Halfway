package app.halfway.meet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app whether meetup alerts can pop up and show on the lock screen,
 * and opens the right Android settings page when they can't.
 */
@CapacitorPlugin(name = "AlertSettings")
public class AlertSettingsPlugin extends Plugin {

    private static final String CHANNEL_ID = "halfway_alerts";

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject result = new JSObject();
        result.put("enabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            if (channel != null) {
                // HIGH and above pop up as a banner over other apps.
                result.put("popUp", channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH);
                result.put("lockScreen", channel.getLockscreenVisibility() != Notification.VISIBILITY_SECRET);
                result.put("channel", true);
            } else {
                result.put("channel", false);
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        Context ctx = getContext();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ID);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(android.net.Uri.parse("package:" + ctx.getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (Exception e) {
            // Some phones don't have the per-channel page; fall back to the app's page.
            ctx.startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(android.net.Uri.parse("package:" + ctx.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            );
        }
        call.resolve();
    }
}
