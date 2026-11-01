package app.neoform.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.io.File
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name = "NeoformNative", permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])])
class NeoformNativePlugin : Plugin() {
    companion object { const val ORIGIN = "https://neoform-bca721354a.kartavya-neoform.workers.dev" }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val requests = ConcurrentHashMap<String, HttpURLConnection>()
    private val cancelled = ConcurrentHashMap.newKeySet<String>()
    private lateinit var vault: PrivateVault
    private lateinit var health: HealthReader
    private lateinit var alarms: RestAlarms
    @Volatile private var activeProfile: String? = null
    @Volatile private var epoch = 0L
    @Volatile private var bound = false
    @Volatile private var healthJob: Job? = null
    private var healthRequest: PluginCall? = null
    private var healthRequestEpoch = 0L
    private var healthRequestBackground = false
    override fun load() { vault = PrivateVault(context); health = HealthReader(context); alarms = RestAlarms(context) }
    private fun liveView(): Boolean = NativePolicy.callbackAllowed(scope.isActive,activity.isFinishing,activity.isDestroyed,android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
    private fun PluginCall.safeResolve(data: JSObject? = null) {
        activity.runOnUiThread { if (liveView()) { if (data == null) resolve() else resolve(data) } }
    }
    private fun PluginCall.safeReject(message: String, code: String? = null) {
        activity.runOnUiThread { if (liveView()) { if (code == null) reject(message) else reject(message,code) } }
    }
    private fun trusted(): Boolean = bridge.localUrl.trimEnd('/') == "https://localhost" && bridge.serverUrl == null
    private fun execute(call: PluginCall, block: suspend () -> JSObject?) {
        if (!trusted()) { call.safeReject("Native access is limited to bundled NEOFORM."); return }
        scope.launch { try { call.safeResolve(block()) } catch (_: CancellationException) { call.safeReject("Operation cancelled.") }
            catch (e: HealthReadException) {
                android.util.Log.w("NeoformHealth", "healthSync:" + e.metric + ":" + e.cause?.javaClass?.simpleName)
                call.safeReject("Health Connect could not read this data type. Review permissions and try syncing again.", "HEALTH_READ_" + e.metric.uppercase().replace('-', '_'))
            }
            catch (_: SecurityException) { call.safeReject("Permission changed. Review Android permissions and sync again.") }
            catch (e: Exception) {
                if (call.methodName.startsWith("health")) android.util.Log.w("NeoformHealth", call.methodName + ":" + e.javaClass.simpleName)
                call.safeReject("Device operation unavailable. Reopen NEOFORM and try again.")
            } }
    }
    private fun auth(): JSONObject = vault.read("authentication") ?: JSONObject()
    private fun authorizedHealth(): Boolean {
        val a = auth()
        return bound && NativePolicy.healthAllowed(activeProfile, a.optString("profileId"), a.optBoolean("aiAccess"), a.optLong("expiresAt"), System.currentTimeMillis())
    }
    private fun requireHealth() { check(authorizedHealth()) { "Unlock Sharma to access Health Connect." } }
    @PluginMethod fun request(call: PluginCall) = execute(call) {
        val path = call.getString("path") ?: error("path")
        check(NativePolicy.apiPathAllowed(path))
        val method = call.getString("method") ?: "GET"
        check(method in listOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"))
        val id = call.getString("id") ?: error("id")
        check(id.length <= 100 && requests.size < 24)
        val oldAuth = auth()
        if (path == "/api/logout") HealthImports.stop(context, true)
        val authChange = path in listOf("/api/profiles/open", "/api/profiles/lock", "/api/logout", "/api/login", "/api/register")
        val at = synchronized(this@NeoformNativePlugin) {
            if (authChange) { epoch++; bound = false; activeProfile = null; healthJob?.cancel(); alarms.cancel() }
            epoch
        }
        val connection = (URL(ORIGIN + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; instanceFollowRedirects = false; connectTimeout = 20000; readTimeout = 90000
            setRequestProperty("Origin", ORIGIN)
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Neoform-Client", "2")
            val cookies = oldAuth.optJSONObject("cookies") ?: JSONObject()
            if (oldAuth.optLong("expiresAt") > System.currentTimeMillis()) {
                val names = cookies.keys().asSequence().filter { it in listOf("neoform_profile", "neoform_session") }.toList()
                if (names.isNotEmpty()) setRequestProperty("Cookie", names.joinToString("; ") { "$it=${cookies.getString(it)}" })
            }
            val headers = call.getObject("headers") ?: JSObject()
            for (key in headers.keys()) if (key.lowercase() in listOf("x-neoform-account", "x-rest-device-token"))
                setRequestProperty(key, headers.getString(key))
        }
        requests[id] = connection
        try {
            check(!cancelled.remove(id))
            call.getString("body")?.let { body ->
                check(body.toByteArray().size <= 16 * 1024 * 1024)
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val bytes = stream?.use { input ->
                val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                var n = input.read(buffer)
                while (n >= 0) { check(out.size() + n <= 32 * 1024 * 1024); out.write(buffer, 0, n); n = input.read(buffer) }
                out.toByteArray()
            } ?: byteArrayOf()
            check(bytes.size <= 32 * 1024 * 1024)
            val body = String(bytes, Charsets.UTF_8)
            synchronized(this@NeoformNativePlugin) {
                if (epoch == at && !cancelled.contains(id)) {
                    val a = auth()
                    val cookies = a.optJSONObject("cookies") ?: JSONObject()
                    for ((key, values) in connection.headerFields) if (key?.equals("set-cookie", true) == true) for (v in values) {
                        val parts = v.split(';'); val pair = parts[0].split('=', limit = 2)
                        if (pair.size == 2 && pair[0] in listOf("neoform_profile", "neoform_session")) {
                            if (pair[1].matches(Regex("[a-f0-9]{64}"))) cookies.put(pair[0], pair[1]) else cookies.remove(pair[0])
                            val age = parts.firstOrNull { it.trim().startsWith("Max-Age=", true) }?.substringAfter('=')?.toLongOrNull() ?: 0L
                            a.put("expiresAt", System.currentTimeMillis() + age.coerceIn(0, 604800) * 1000)
                        }
                    }
                    a.put("cookies", cookies)
                    if (path in listOf("/api/me", "/api/profiles/open") && status in 200..299) {
                        val identity = JSONObject(body)
                        a.put("profileId", identity.optString("profileId")); a.put("aiAccess", identity.optBoolean("aiAccess"))
                    }
                    if (path in listOf("/api/profiles/lock", "/api/logout") || (path == "/api/me" && status == 401)) {
                        a.remove("profileId"); a.put("aiAccess", false); bound = false; activeProfile = null; alarms.cancel()
                    }
                    vault.write("authentication", a)
                }
            }
            JSObject().put("status", status).put("body", body)
        } finally { connection.disconnect(); requests.remove(id); cancelled.remove(id) }
    }
    @PluginMethod fun cancel(call: PluginCall) {
        if (!trusted()) { call.safeReject("Open bundled NEOFORM first."); return }
        val id = call.getString("id") ?: ""
        if (cancelled.size < 100) cancelled.add(id)
        requests[id]?.disconnect(); call.safeResolve()
    }
    @PluginMethod fun bindProfile(call: PluginCall) = execute(call) {
        synchronized(this@NeoformNativePlugin) {
            val profile = call.getString("profile")
            if (activeProfile != profile) { epoch++; healthJob?.cancel(); alarms.cancel() }
            val a = auth()
            activeProfile = if (profile == a.optString("profileId") && a.optLong("expiresAt") > System.currentTimeMillis()) profile else null
            bound = activeProfile != null
        }
        JSObject()
    }
    @PluginMethod fun healthStatus(call: PluginCall) = execute(call) {
        requireHealth(); val at = epoch
        val availability = health.availability()
        val permissions = health.granted()
        val supported = health.feature(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)
        val granted = health.backgroundGranted()
        synchronized(this@NeoformNativePlugin) {
            requireHealth(); check(at == epoch)
            JSObject().put("availability",availability).put("permissions", JSONArray(permissions))
                .put("backgroundSupported",supported).put("backgroundGranted",granted).put("controls",HealthImports.status(context))
        }
    }
    @PluginMethod fun healthSnapshot(call: PluginCall) = execute(call) {
        requireHealth(); val at = epoch; healthJob = currentCoroutineContext()[Job]
        val s = HealthImports.snapshot(context,health) { at == epoch && authorizedHealth() }
        JSObject().put("snapshot",s ?: JSONObject.NULL)
    }
    @PluginMethod fun healthPreferences(call: PluginCall) = execute(call) {
        requireHealth(); val enabled = call.getBoolean("autoReduce")
        if (enabled != null) HealthImports.setAuto(context,enabled)
        JSObject().put("controls",HealthImports.status(context))
    }
    @PluginMethod fun healthReserveReduction(call: PluginCall) = execute(call) {
        requireHealth()
        val session = call.getString("session") ?: error("session"); val entry = call.getString("entry") ?: error("entry")
        check(session.matches(Regex("[a-zA-Z0-9_-]{1,100}")) && entry.matches(Regex("[a-zA-Z0-9_-]{1,100}")))
        val undo = call.getObject("undo")
        if (undo != null) check(undo.toString().length <= 10000 && undo.optString("sessionId") == session && undo.optString("entryId") == entry)
        JSObject().put("reserved",HealthImports.reserve(context,session,entry,undo))
    }
    @PluginMethod fun healthDisableBackground(call: PluginCall) = execute(call) {
        requireHealth(); HealthImports.stop(context); JSObject()
    }
    @PluginMethod fun healthEnableBackground(call: PluginCall) { requestHealthPermissions(call,true) }
    @PluginMethod fun healthConnect(call: PluginCall) { requestHealthPermissions(call,false) }
    private fun requestHealthPermissions(call: PluginCall, background: Boolean) {
        if (!trusted() || !authorizedHealth()) { call.safeReject("Unlock Sharma first."); return }
        if (health.availability() != "available") { call.safeReject("Install or update Health Connect first."); return }
        if (healthRequest != null) { call.safeReject("A permission request is already open."); return }
        if (background && !health.feature(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)) { call.safeReject("Background reads unavailable. Update Health Connect; foreground sync still works."); return }
        healthRequestBackground = background
        healthRequest = call
        healthRequestEpoch = epoch
        activity.runOnUiThread {
            try {
                if (healthRequest !== call || healthRequestEpoch != epoch || !authorizedHealth()) {
                    healthRequest = null; call.safeReject("Profile changed. Reopen Health Connect."); return@runOnUiThread
                }
                val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, health.requested() + (if (background) setOf(HealthReader.backgroundPermission) else emptySet()))
                startActivityForResult(call, intent, "healthPermissionResult")
            } catch (e: Exception) { healthRequest = null; call.safeReject("Android could not open Health Connect permissions.") }
        }
    }
    @ActivityCallback private fun healthPermissionResult(call: PluginCall?, result: ActivityResult) {
        val pending = healthRequest
        if (pending == null || pending.callbackId != call?.callbackId) return
        val background = healthRequestBackground
        val requestedEpoch = healthRequestEpoch
        healthRequest = null
        if (requestedEpoch != epoch) { pending.safeReject("Profile changed. Reopen Health Connect."); return }
        if (call == null) return
        execute(call) {
            val backgroundGranted = !background || health.backgroundGranted()
            synchronized(this@NeoformNativePlugin) { requireHealth(); check(requestedEpoch == epoch)
            val old = vault.read("health-sharma") ?: JSONObject().put("version", 1).put("syncedAt", 0).put("records", JSONArray()).put("sources", JSONObject())
            old.put("enabled", true); vault.write("health-sharma", old)
            if (background) { check(backgroundGranted); HealthImports.enroll(context) }
            }; JSObject() }
    }
    @PluginMethod fun healthSync(call: PluginCall) = execute(call) {
        requireHealth(); val at = epoch
        healthJob = currentCoroutineContext()[Job]
        val next = HealthImports.sync(context,health,false) { at == epoch && authorizedHealth() }
        JSObject().put("snapshot", next)
    }
    @PluginMethod fun healthCancel(call: PluginCall) {
        if (!trusted()) { call.safeReject("Open NEOFORM first."); return }
        synchronized(this@NeoformNativePlugin) { epoch++; healthJob?.cancel() }
        activity.runOnUiThread { healthRequest?.safeReject("Health connection cancelled."); healthRequest = null; call.safeResolve() }
    }
    @PluginMethod fun healthSources(call: PluginCall) = execute(call) {
        synchronized(this@NeoformNativePlugin) {
            requireHealth(); val s = vault.read("health-sharma") ?: error("Connect first")
            val sources = call.getObject("sources") ?: JSObject()
            for (key in sources.keys()) check(key in (HealthReader.permissions.keys + "protein") && sources.opt(key) is String && sources.optString(key).length <= 200)
            JSObject().put("snapshot", HealthImports.updateSources(context,sources))
        }
    }
    @PluginMethod fun healthDelete(call: PluginCall) = execute(call) {
        requireHealth(); synchronized(this@NeoformNativePlugin) { epoch++; healthJob?.cancel(); HealthImports.stop(context,true) }; JSObject()
    }
    @PluginMethod fun healthDisconnect(call: PluginCall) = execute(call) {
        requireHealth(); synchronized(this@NeoformNativePlugin) { epoch++; healthJob?.cancel(); HealthImports.stop(context,true) }
        health.disconnect(); JSObject()
    }
    @PluginMethod fun openHealthSettings(call: PluginCall) = execute(call) {
        requireHealth()
        val intent = if (health.availability() == "install-required") Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))
            else HealthConnectClient.getHealthConnectManageDataIntent(context)
        activity.startActivity(intent); JSObject()
    }
    @PluginMethod fun notificationStatus(call: PluginCall) = execute(call) {
        JSObject().put("enabled", alarms.enabled()).put("allowed", alarms.allowed()).put("armed", alarms.armed())
            .put("deliveredTimerId", alarms.deliveredTimerId()).put("deliveredDeadline", alarms.deliveredDeadline())
    }
    @PluginMethod fun enableNotifications(call: PluginCall) {
        if (!trusted()) { call.safeReject("Open NEOFORM first."); return }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED)
            requestPermissionForAlias("notifications", call, "notificationPermissionResult")
        else { alarms.enable(); call.safeResolve(JSObject().put("allowed", alarms.allowed())) }
    }
    @PermissionCallback private fun notificationPermissionResult(call: PluginCall) {
        if (alarms.allowed()) alarms.enable()
        call.safeResolve(JSObject().put("allowed", alarms.allowed()))
    }
    @PluginMethod fun restSchedule(call: PluginCall) = execute(call) {
        val timer = call.getString("timerId") ?: error("timer")
        check(timer.length <= 200)
        JSObject().put("armed", alarms.schedule(timer, call.getDouble("endAt")?.toLong() ?: 0, call.getBoolean("sound", true) == true))
    }
    @PluginMethod fun restCancel(call: PluginCall) = execute(call) { alarms.cancel(); JSObject() }
    @PluginMethod fun disableNotifications(call: PluginCall) = execute(call) { alarms.disable(); JSObject() }
    @PluginMethod fun background(call: PluginCall) { activity.runOnUiThread { activity.moveTaskToBack(true); call.safeResolve() } }
    @PluginMethod fun setTheme(call: PluginCall) {
        if (!trusted()) { call.safeReject("Open bundled NEOFORM first."); return }
        val dark = call.getBoolean("dark", false) == true
        activity.runOnUiThread {
            if (!liveView()) return@runOnUiThread
            val color = android.graphics.Color.parseColor(if (dark) "#0d1625" else "#eaf0f8")
            activity.window.statusBarColor = color; activity.window.navigationBarColor = color
            bridge.webView.setBackgroundColor(color)
            androidx.core.view.WindowInsetsControllerCompat(activity.window, bridge.webView).apply {
                isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark
            }
            call.safeResolve()
        }
    }
    @PluginMethod fun shareFile(call: PluginCall) = execute(call) {
        val mime = call.getString("mime") ?: "image/png"
        check(mime in listOf("image/png", "application/json", "application/x-ndjson", "text/csv"))
        val name = (call.getString("name") ?: "neoform.png").replace(Regex("[^a-zA-Z0-9._-]"), "_").take(150)
        val data = call.getString("base64") ?: error("file")
        check(data.length <= 24 * 1024 * 1024)
        val bytes = Base64.decode(data, Base64.DEFAULT)
        val save = call.getBoolean("save", false) == true
        if (save && Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, mime); put(MediaStore.Downloads.IS_PENDING, 1) }
            val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("storage")
            try {
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("storage")
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0); context.contentResolver.update(uri, values, null, null)
            } catch (e: Exception) { context.contentResolver.delete(uri, null, null); throw e }
        } else {
            val dir = File(context.cacheDir, "shared").apply { mkdirs() }
            dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000 }?.forEach { it.delete() }
            val file = File(dir, name); file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }, "Share NEOFORM"))
        }
        JSObject()
    }
    override fun shouldOverrideLoad(url: Uri): Boolean? {
        if (url.scheme == "https" && url.host == "localhost") return false
        if (url.scheme in listOf("https", "http", "mailto")) try { activity.startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Exception) {}
        return true
    }
    override fun handleOnDestroy() {
        synchronized(this) { epoch++; bound=false; activeProfile=null; healthRequest=null }
        scope.cancel(); requests.values.forEach { it.disconnect() }
    }
    override fun handleOnResume() {
        if (liveView()) bridge.webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('neoform:foreground'))",null)
    }
    override fun handleOnPause() { healthJob?.cancel() }
}
