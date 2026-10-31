package app.neoform.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID
import androidx.test.core.app.ActivityScenario
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Runs only against fresh isolated emulator installations, never personal phones. */
@RunWith(AndroidJUnit4::class)
class HealthDeviceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private fun assertBundledBridge(scenario: ActivityScenario<MainActivity>) {
        val deadline = System.currentTimeMillis() + 45000
        var result = ""
        while (System.currentTimeMillis() < deadline && !result.contains("bridge-ready")) {
            val latch = CountDownLatch(1)
            val value = AtomicReference("")
            scenario.onActivity { activity ->
                activity.bridge.webView.evaluateJavascript("""
                    (function() {
                      if (!window.Capacitor || !window.Capacitor.Plugins.NeoformNative) return 'loading';
                      if (!window.__neoformSmokeStarted) {
                        window.__neoformSmokeStarted = true;
                        var native = window.Capacitor.Plugins.NeoformNative;
                        native.notificationStatus().then(function(s) {
                          return native.healthStatus().then(function() { window.__neoformSmoke = 'health-leak'; }, function() {
                            window.__neoformSmoke = typeof s.enabled === 'boolean' ? 'bridge-ready' : 'bad-native-response';
                          });
                        }).catch(function() { window.__neoformSmoke = 'bridge-failed'; });
                      }
                      return window.__neoformSmoke || 'waiting';
                    })()
                """.trimIndent()) { reply -> value.set(reply); latch.countDown() }
            }
            assertTrue(latch.await(5, TimeUnit.SECONDS))
            result = value.get()
            assertFalse(result.contains("health-leak"))
            assertFalse(result.contains("bridge-failed"))
            if (!result.contains("bridge-ready")) Thread.sleep(500)
        }
        assertTrue("Bundled app must load and reach its native bridge: $result", result.contains("bridge-ready"))
    }
    @Test fun bundledAppCanCallNativeBridgeWithoutExposingHealth() {
        // Every creation and recreation must pass. A failure is never retried.
        repeat(3) {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                assertBundledBridge(scenario)
                scenario.recreate()
                assertBundledBridge(scenario)
            }
        }
    }
    @Test fun privateHealthCacheIsEncryptedAndExcludedFromBackup() {
        val name = "qa-health-${UUID.randomUUID()}"
        val vault = PrivateVault(context)
        val record = JSONObject().put("fixture", "synthetic-health-private-marker").put("profile", "sharma")
        try {
            vault.write(name, record)
            val bytes = File(context.noBackupFilesDir, "$name.enc").readBytes()
            assertFalse(String(bytes, Charsets.ISO_8859_1).contains("synthetic-health-private-marker"))
            assertEquals(record.toString(), vault.read(name)?.toString())
            assertEquals(0, context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP)
        } finally { vault.delete(name) }
        assertNull(vault.read(name))
    }
    @Test fun healthProviderAndPermissionStatesAreExplicit() = runBlocking {
        val reader = HealthReader(context)
        assertTrue(reader.availability() in listOf("available", "install-required", "unsupported"))
        // A fresh app must never receive health permissions merely by being installed.
        assertTrue(reader.granted().isEmpty())
        assertEquals(5, HealthReader.permissions.size)
        assertTrue(HealthReader.permissions.values.none { it.contains("WRITE_") || it.contains("BACKGROUND") || it.contains("HISTORY") })
    }
    @Test fun staleOrCancelledRestAlarmsCannotQualifyForDelivery() {
        assertFalse(NativePolicy.deliverAlarm(1, 2, true, 1000, 1500))
        assertFalse(NativePolicy.deliverAlarm(2, 2, true, 1000, 121001))
        val alarms = RestAlarms(context)
        alarms.disable()
        assertFalse(alarms.armed())
        assertFalse(alarms.schedule("synthetic", System.currentTimeMillis() + 10000, false))
        alarms.cancel()
    }
}
