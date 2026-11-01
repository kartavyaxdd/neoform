package app.neoform.android

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong

/** Public release downloads never use the workout transport, cookies or private vault. */
@CapacitorPlugin(name = "AppUpdates")
class AppUpdatesPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    private val generation = AtomicLong()
    @Volatile private var job: Job? = null
    @Volatile private var connection: HttpURLConnection? = null
    @Volatile private var permissionCall: String? = null
    private var permissionGeneration = 0L
    @Volatile private var openingSystemUI = false
    private val directory get() = File(context.cacheDir,"updates").apply { mkdirs() }
    private val apk get() = File(directory,"neoform.apk")
    private val manifest get() = File(directory,"release.json")
    private fun trusted() = bridge.localUrl.trimEnd('/') == "https://localhost" && bridge.serverUrl == null
    private fun ui(block: () -> Unit) = activity.runOnUiThread {
        if (scope.isActive && !activity.isFinishing && !activity.isDestroyed) block()
    }
    private fun resolve(call: PluginCall, data: JSObject = JSObject()) = ui { call.resolve(data) }
    private fun reject(call: PluginCall, message: String) = ui { call.reject(message) }
    private fun perform(call: PluginCall, block: suspend (Long) -> Unit) {
        if (!trusted()) { reject(call,"Open bundled NEOFORM to check for updates."); return }
        scope.launch {
            if (!mutex.tryLock()) { reject(call,"An update check is already running."); return@launch }
            val at = generation.get()
            job = currentCoroutineContext()[Job]
            try {
                check(permissionCall == null && !openingSystemUI)
                block(at)
            } catch (_: CancellationException) { reject(call,"Update cancelled. Tap Check for updates to try again.") }
              catch (_: Exception) { reject(call,"Could not verify or download the update. Check your connection and try again.") }
            finally { connection?.disconnect(); connection=null; job=null; mutex.unlock() }
        }
    }
    private fun ensure(at: Long) { check(generation.get() == at && scope.isActive && job?.isActive == true) }
    private fun installed() = UpdateArchive.installed(context)
    private fun number(json: JSONObject, name: String): Long {
        val value = json.get(name)
        check(value is Number && value.toString().matches(Regex("[0-9]+")))
        return value.toString().toLong()
    }
    private fun parse(json: JSONObject) = UpdateRelease(json.getString("applicationId"),json.getString("version"),
        number(json,"versionCode"),json.getString("sha"),json.getString("apkSha256"),number(json,"bytes"),json.getString("url"))
        .also { check(UpdatePolicy.valid(it)) }
    private fun json(r: UpdateRelease) = JSONObject().put("applicationId",r.applicationId).put("version",r.version)
        .put("versionCode",r.versionCode).put("sha",r.sha).put("apkSha256",r.apkSha256).put("bytes",r.bytes).put("url",r.url)
    private fun result(r: UpdateRelease, available: Boolean) = JSObject().put("status",if (available) "ready" else "latest")
        .put("version",r.version).put("versionCode",r.versionCode)
    private fun connect(path: String): HttpURLConnection {
        check(path.startsWith("/downloads/") && !path.contains(".."))
        return (URL(UpdatePolicy.ORIGIN+path).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects=false; useCaches=false; connectTimeout=15000; readTimeout=30000
            setRequestProperty("Accept-Encoding","identity"); setRequestProperty("Cache-Control","no-cache")
            setRequestProperty("Cookie",""); connection=this
            check(responseCode == 200)
        }
    }
    private suspend fun fetchRelease(at: Long): UpdateRelease {
        ensure(at)
        val c = connect("/downloads/release.json?check="+System.currentTimeMillis())
        try {
            val buffer = java.io.ByteArrayOutputStream()
            c.inputStream.use { input ->
                val bytes=ByteArray(2048)
                while (true) {
                    currentCoroutineContext().ensureActive(); ensure(at)
                    val n=input.read(bytes); if(n<0) break
                    check(buffer.size()+n <= 16384); buffer.write(bytes,0,n)
                }
            }
            return parse(JSONObject(buffer.toString("UTF-8")))
        } finally { c.disconnect(); connection=null }
    }
    private fun verified(file: File, release: UpdateRelease) = UpdateArchive.verified(context,file,release,installed())
    @PluginMethod fun status(call: PluginCall) {
        if (!trusted()) { reject(call,"Open bundled NEOFORM first."); return }
        scope.launch {
            try {
                val current=installed()
                resolve(call,JSObject().put("version",current.version).put("versionCode",current.versionCode))
            } catch (_: Exception) { reject(call,"Could not read this app version.") }
        }
    }
    @PluginMethod fun check(call: PluginCall) = perform(call) { at ->
        val release=fetchRelease(at); ensure(at)
        resolve(call,result(release,release.versionCode>installed().versionCode))
    }
    @PluginMethod fun download(call: PluginCall) = perform(call) { at ->
        val release=fetchRelease(at)
        if (release.versionCode<=installed().versionCode) { resolve(call,result(release,false)); return@perform }
        if (!verified(apk,release)) {
            val partial=File(directory,"download.tmp.apk")
            try {
                val c=connect(UpdatePolicy.APK_PATH+"?sha="+release.sha)
                check(c.contentLengthLong<0 || c.contentLengthLong==release.bytes)
                val started=SystemClock.elapsedRealtime()
                c.inputStream.use { input -> partial.outputStream().use { output ->
                    val bytes=ByteArray(32768); var total=0L
                    while(true) {
                        currentCoroutineContext().ensureActive(); ensure(at)
                        check(SystemClock.elapsedRealtime()-started < 120000)
                        val n=input.read(bytes); if(n<0) break
                        total+=n; check(total<=release.bytes && total<=UpdatePolicy.MAX_BYTES); output.write(bytes,0,n)
                    }
                } }
                c.disconnect(); connection=null
                ensure(at); check(verified(partial,release))
                check(!apk.exists() || apk.delete()); check(partial.renameTo(apk))
            } finally { partial.delete() }
        }
        ensure(at)
        val temp=File(directory,"release.tmp"); temp.writeText(json(release).toString())
        check(!manifest.exists() || manifest.delete()); check(temp.renameTo(manifest))
        resolve(call,result(release,true))
    }
    @PluginMethod fun install(call: PluginCall) = beginInstall(call,false)
    private fun beginInstall(call: PluginCall, returningFromPermission: Boolean) = perform(call) { at ->
        val release=parse(JSONObject(manifest.readText())); check(verified(apk,release)); ensure(at)
        openingSystemUI=true
        ui {
            if (generation.get()!=at) { openingSystemUI=false; reject(call,"Update cancelled."); return@ui }
            if (!returningFromPermission && !activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                openingSystemUI=false; reject(call,"Return to NEOFORM and check for updates again."); return@ui
            }
            try {
                openingSystemUI=true
                if (!context.packageManager.canRequestPackageInstalls()) {
                    permissionCall=call.callbackId; permissionGeneration=at
                    startActivityForResult(call,Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+context.packageName)),"installPermissionResult")
                } else {
                    val uri=FileProvider.getUriForFile(context,"${context.packageName}.fileprovider",apk)
                    activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri,"application/vnd.android.package-archive")
                        clipData=ClipData.newRawUri("NEOFORM update",uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    })
                    resolve(call)
                }
            } catch (_: Exception) {
                permissionCall=null; openingSystemUI=false
                reject(call,"Android could not open the installer. Check installation permissions and try again.")
            }
        }
    }
    @ActivityCallback private fun installPermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null || permissionCall != call.callbackId) return
        permissionCall=null; openingSystemUI=false
        if (permissionGeneration!=generation.get()) { reject(call,"Update cancelled."); return }
        if (!context.packageManager.canRequestPackageInstalls()) {
            reject(call,"Installation permission was not enabled. Tap Check for updates to try again."); return
        }
        beginInstall(call,true)
    }
    private fun cancelWork() {
        generation.incrementAndGet(); connection?.disconnect(); job?.cancel()
        val pending=permissionCall; permissionCall=null
        if (pending!=null) ui {
            bridge.getSavedCall(pending)?.let { it.reject("Update cancelled."); bridge.releaseCall(it) }
        }
    }
    @PluginMethod fun cancel(call: PluginCall) {
        if (!trusted()) { reject(call,"Open bundled NEOFORM first."); return }
        cancelWork(); resolve(call)
    }
    override fun handleOnPause() { if (!openingSystemUI) cancelWork() }
    override fun handleOnResume() { if (permissionCall == null) openingSystemUI=false }
    override fun handleOnDestroy() { cancelWork(); scope.cancel() }
}
