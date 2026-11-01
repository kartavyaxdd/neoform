package app.neoform.android

import android.content.Context
import androidx.health.connect.client.HealthConnectFeatures
import androidx.work.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/** Independent local enrollment authorizes import, never UI access or cloud requests. */
object HealthImports {
    private const val WORK = "neoform-sharma-health-12h"
    private const val CONTROL = "health-controls-sharma"
    private val gate = Any()
    private val imports = Mutex()
    private fun controls(context: Context) = PrivateVault(context).read(CONTROL) ?: JSONObject()
    private fun save(context: Context, c: JSONObject) = PrivateVault(context).write(CONTROL,c)
    fun status(context: Context): JSONObject = synchronized(gate) { controls(context) }
    fun setAuto(context: Context, enabled: Boolean) = synchronized(gate) {
        val c = controls(context); c.put("autoReduce",enabled); save(context,c)
    }
    fun reserve(context: Context, session: String, entry: String, undo: JSONObject? = null): Boolean = synchronized(gate) {
        val c = controls(context)
        if (!c.optBoolean("autoReduce")) return@synchronized false
        val key = "$session:$entry"
        val used = c.optJSONArray("reductions") ?: JSONArray()
        for (i in 0 until used.length()) if (used.optString(i) == key) return@synchronized false
        // Never evict an active session's guard; fail closed rather than reuse an old key.
        if (used.length() >= 4096) return@synchronized false
        used.put(key); c.put("reductions",used); if (undo != null) c.put("undo",undo); save(context,c); true
    }
    fun enroll(context: Context) = synchronized(gate) {
        check(PrivateVault(context).read("health-sharma")?.optBoolean("enabled") == true)
        val c = controls(context); c.put("backgroundEnabled",true).put("status","scheduled")
        c.put("generation",c.optLong("generation")+1); save(context,c)
        val request = PeriodicWorkRequestBuilder<HealthImportWorker>(12,TimeUnit.HOURS)
            .setInitialDelay(12,TimeUnit.HOURS).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.MINUTES).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK,ExistingPeriodicWorkPolicy.UPDATE,request)
    }
    fun stop(context: Context, clear: Boolean = false) = synchronized(gate) {
        val c = controls(context); c.put("generation",c.optLong("generation")+1).put("backgroundEnabled",false).put("status","disabled")
        if (clear) { c.put("autoReduce",false); c.remove("undo"); c.remove("lastAttemptAt"); c.remove("lastSuccessAt"); c.remove("importFailed"); PrivateVault(context).delete("health-sharma") }
        save(context,c); WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }
    fun updateSources(context: Context, sources: JSONObject): JSONObject = synchronized(gate) {
        val c = controls(context); c.put("generation",c.optLong("generation")+1); save(context,c)
        val vault = PrivateVault(context); val s = vault.read("health-sharma") ?: error("Connect first")
        s.put("sources",sources); vault.write("health-sharma",s); s
    }
    suspend fun snapshot(context: Context, reader: HealthSource, guard: () -> Boolean): JSONObject? {
        val permissions = reader.granted()
        return synchronized(gate) {
            check(guard()); val vault = PrivateVault(context); val s = vault.read("health-sharma") ?: return@synchronized null
            val rows = s.optJSONArray("records") ?: JSONArray(); val filtered = JSONArray()
            for (i in 0 until rows.length()) if (rows.getJSONObject(i).optString("kind") in permissions) filtered.put(rows.getJSONObject(i))
            s.put("permissions",JSONArray(permissions)).put("records",filtered)
            vault.write("health-sharma",s)
            if (controls(context).optBoolean("importFailed")) s.put("clipped",true)
            s
        }
    }
    fun unavailable(context: Context, status: String) = synchronized(gate) {
        val c = controls(context)
        if (c.optBoolean("backgroundEnabled")) { c.put("lastAttemptAt",System.currentTimeMillis()).put("status",status).put("importFailed",true); save(context,c) }
    }
    suspend fun sync(context: Context, reader: HealthSource, background: Boolean, guard: () -> Boolean = { true }): JSONObject = imports.withLock {
        val vault = PrivateVault(context)
        val at = synchronized(gate) {
            val c = controls(context); check(guard())
            check(!background || c.optBoolean("backgroundEnabled"))
            check(vault.read("health-sharma")?.optBoolean("enabled") == true)
            c.put("lastAttemptAt",System.currentTimeMillis()).put("status","importing"); save(context,c); c.optLong("generation")
        }
        try {
            if (background) check(reader.backgroundGranted())
            val next = withTimeout(60000) { reader.read(vault.read("health-sharma")) }
            val permissions = reader.granted()
            val permitted = !background || reader.backgroundGranted()
            synchronized(gate) {
                val c = controls(context)
                check(guard() && HealthImportPolicy.canCommit(at,c.optLong("generation"),vault.read("health-sharma")?.optBoolean("enabled") == true,permitted))
                check(!background || c.optBoolean("backgroundEnabled"))
                check(next.optJSONArray("permissions")?.toString() == JSONArray(permissions).toString())
                next.put("sources",vault.read("health-sharma")?.optJSONObject("sources") ?: JSONObject())
                vault.write("health-sharma",next)
                c.put("lastSuccessAt",System.currentTimeMillis()).put("importFailed",next.optBoolean("clipped")).put("status",if(next.optBoolean("clipped")) "partial" else "saved")
                save(context,c)
            }
            next
        } catch (e: Exception) {
            synchronized(gate) {
                val c = controls(context)
                if (at == c.optLong("generation") && guard()) { c.put("importFailed",true).put("status",if(e is SecurityException) "permission-required" else "needs-attention"); save(context,c) }
            }
            throw e
        }
    }
}
class HealthImportWorker(context: Context, params: WorkerParameters): CoroutineWorker(context,params) {
    override suspend fun doWork(): Result {
        if (!HealthImports.status(applicationContext).optBoolean("backgroundEnabled")) return Result.success()
        val reader = HealthReader(applicationContext)
        return try {
            if (!reader.backgroundGranted()) { HealthImports.unavailable(applicationContext,"permission-required"); Result.success() }
            else { HealthImports.sync(applicationContext,reader,true); Result.success() }
        }
        catch (_: kotlinx.coroutines.TimeoutCancellationException) { HealthImports.unavailable(applicationContext,"needs-attention"); if (HealthImportPolicy.retry(runAttemptCount)) Result.retry() else Result.success() }
        catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (_: SecurityException) { HealthImports.unavailable(applicationContext,"permission-required"); Result.success() }
        catch (_: Exception) { HealthImports.unavailable(applicationContext,"needs-attention"); if (HealthImportPolicy.retry(runAttemptCount)) Result.retry() else Result.success() }
    }
}
