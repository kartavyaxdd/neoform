package app.neoform.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicInteger

/** Synthetic provider + real Keystore/WorkManager; isolated emulators only. */
@RunWith(AndroidJUnit4::class)
class HealthImportDeviceTest {
 private val context = InstrumentationRegistry.getInstrumentation().targetContext
 private class Source(val wait: CompletableDeferred<Unit>? = null): HealthSource {
    val started = CompletableDeferred<Unit>(); val calls=AtomicInteger(); val active=AtomicInteger(); val maximum=AtomicInteger()
    @Volatile var allowed=true
    override suspend fun granted() = if(allowed) listOf("sleep") else emptyList()
    override suspend fun backgroundGranted() = allowed
    override suspend fun read(previous: JSONObject?): JSONObject {
      calls.incrementAndGet(); val n=active.incrementAndGet(); maximum.updateAndGet { maxOf(it,n) }; started.complete(Unit)
      try { wait?.await(); return JSONObject().put("version",2).put("enabled",true).put("syncedAt",System.currentTimeMillis()).put("permissions",JSONArray(listOf("sleep"))).put("records",JSONArray()).put("sources",JSONObject()).put("fixture","new-synthetic") }
      finally { active.decrementAndGet() }
    }
 }
 private fun begin() {
   HealthImports.stop(context,true)
   PrivateVault(context).write("health-sharma",JSONObject().put("enabled",true).put("records",JSONArray()).put("sources",JSONObject()).put("fixture","old-synthetic"))
   HealthImports.enroll(context)
 }
 @Test fun scheduledAndManualReadsAreSerialized() = runBlocking {
   begin(); val release=CompletableDeferred<Unit>(); val source=Source(release)
   try { withTimeout(5000) {
      val first=async(Dispatchers.Default){HealthImports.sync(context,source,true)}
      source.started.await()
      val second=async(Dispatchers.Default){HealthImports.sync(context,source,false)}
      delay(80); assertEquals(1,source.calls.get()); release.complete(Unit)
      first.await(); second.await(); assertEquals(2,source.calls.get());assertEquals(1,source.maximum.get())
   } } finally { release.complete(Unit); HealthImports.stop(context,true) }
 }
 @Test fun disconnectFencesTheResultOfAnAlreadyRunningImport() = runBlocking {
   begin();val release=CompletableDeferred<Unit>();val source=Source(release)
   try { withTimeout(5000) { supervisorScope {
      val old=async(Dispatchers.Default){runCatching { HealthImports.sync(context,source,true) }}
      source.started.await(); HealthImports.stop(context,true); release.complete(Unit)
      assertTrue(old.await().isFailure);assertNull(PrivateVault(context).read("health-sharma"));assertFalse(HealthImports.status(context).optBoolean("backgroundEnabled"))
   } } } finally { release.complete(Unit); HealthImports.stop(context,true) }
 }
 @Test fun revocationDuringReadCannotPublishACompleteNewSnapshot() = runBlocking {
   begin();val release=CompletableDeferred<Unit>();val source=Source(release)
   try { withTimeout(5000) { supervisorScope {
      val old=async(Dispatchers.Default){runCatching { HealthImports.sync(context,source,true) }}
      source.started.await(); source.allowed=false; release.complete(Unit)
      assertTrue(old.await().isFailure); assertEquals("old-synthetic",PrivateVault(context).read("health-sharma")!!.optString("fixture"))
      val visible=HealthImports.snapshot(context,source){true}!!
      assertEquals(0,visible.optJSONArray("permissions")!!.length());assertTrue(visible.optBoolean("clipped"))
   } } } finally { release.complete(Unit);HealthImports.stop(context,true) }
 }
 @Test fun localEnrollmentSurvivesUiLockButDoesNotAuthorizeUiReads() = runBlocking {
   begin();val source=Source()
   try {
     assertFalse(NativePolicy.healthAllowed(null,"sharma",true,System.currentTimeMillis()+60000,System.currentTimeMillis()))
     assertTrue(runCatching { HealthImports.snapshot(context,source){false} }.isFailure)
     assertTrue(HealthImports.sync(context,source,true).optBoolean("enabled"))
     assertEquals(1,source.calls.get())
   } finally {HealthImports.stop(context,true)}
 }
 @Test fun changingSourcesFencesAnOldProviderRead() = runBlocking {
   begin();val release=CompletableDeferred<Unit>();val source=Source(release)
   try { withTimeout(5000) { supervisorScope {
     val old=async(Dispatchers.Default){runCatching { HealthImports.sync(context,source,true) }}
     source.started.await();HealthImports.updateSources(context,JSONObject().put("sleep","synthetic-other"));release.complete(Unit)
     assertTrue(old.await().isFailure)
     assertEquals("synthetic-other",PrivateVault(context).read("health-sharma")!!.optJSONObject("sources")!!.optString("sleep"))
   } } } finally { release.complete(Unit);HealthImports.stop(context,true) }
 }
}
