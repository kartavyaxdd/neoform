package app.neoform.android

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class RestAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = context.getSharedPreferences("rest-alert", Context.MODE_PRIVATE)
        val version = intent.getLongExtra("version", -1)
        val deadline = prefs.getLong("deadline", 0)
        if (!NativePolicy.deliverAlarm(version, prefs.getLong("version", 0), prefs.getBoolean("enabled", false), deadline, System.currentTimeMillis())) return
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(context, 8001, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val channel = if (prefs.getBoolean("sound", true)) "rest-sound-v1" else "rest-silent-v1"
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Rest finished")
            .setContentText("Ready when you are. Open NEOFORM to continue.")
            .setContentIntent(open).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).build()
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled() || context.getSystemService(NotificationManager::class.java).getNotificationChannel(channel)?.importance == NotificationManager.IMPORTANCE_NONE) return
        try { NotificationManagerCompat.from(context).notify(8001, notification) } catch (_: SecurityException) { return }
        prefs.edit().putLong("deadline", 0).putLong("deliveredDeadline", deadline).putString("deliveredTimerId", prefs.getString("timerId", "")).apply()
    }
}

class RestAlarms(private val context: Context) {
    private val prefs = context.getSharedPreferences("rest-alert", Context.MODE_PRIVATE)
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val notifications = context.getSystemService(NotificationManager::class.java)
    private fun pending(version: Long) = PendingIntent.getBroadcast(context, 8001,
        Intent(context, RestAlarmReceiver::class.java).putExtra("version", version), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun allowed() = NotificationManagerCompat.from(context).areNotificationsEnabled()
    fun enabled() = prefs.getBoolean("enabled", false)
    fun armed() = enabled() && allowed() && prefs.getLong("deadline", 0) > System.currentTimeMillis()
    fun deliveredTimerId() = prefs.getString("deliveredTimerId", "") ?: ""
    fun deliveredDeadline() = prefs.getLong("deliveredDeadline", 0)
    fun enable() { prefs.edit().putBoolean("enabled", true).apply() }
    @Synchronized fun cancel() {
        alarms.cancel(pending(0))
        prefs.edit().putLong("version", prefs.getLong("version", 0) + 1).putLong("deadline", 0).apply()
        notifications.cancel(8001)
    }
    fun disable() { cancel(); prefs.edit().putBoolean("enabled", false).apply() }
    @Synchronized fun schedule(timerId: String, endAt: Long, sound: Boolean): Boolean {
        cancel()
        if (!enabled() || !allowed() || endAt <= System.currentTimeMillis() || endAt > System.currentTimeMillis() + 3600000) return false
        val channelId = if (sound) "rest-sound-v1" else "rest-silent-v1"
        val channel = NotificationChannel(channelId, if (sound) "Rest alerts" else "Silent rest alerts", NotificationManager.IMPORTANCE_HIGH)
        if (!sound) channel.setSound(null, null)
        notifications.createNotificationChannel(channel)
        if (notifications.getNotificationChannel(channelId).importance == NotificationManager.IMPORTANCE_NONE) return false
        val version = prefs.getLong("version", 0) + 1
        prefs.edit().putLong("version", version).putLong("deadline", endAt).putString("timerId", timerId).putBoolean("sound", sound).apply()
        // Inexact by design: no exact-alarm privilege or battery-optimization bypass.
        try { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, pending(version)) }
        catch (e: Exception) { cancel(); throw e }
        return true
    }
}
