package app.neoform.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.core.content.FileProvider
import android.content.pm.PackageManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID
import androidx.test.core.app.ActivityScenario
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

/** APK parsing uses this fresh QA installation's own public binary, never user data. */
@RunWith(AndroidJUnit4::class)
class AppUpdateDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private fun shell(command: String) = instrumentation.uiAutomation.executeShellCommand(command).use {
        android.os.ParcelFileDescriptor.AutoCloseInputStream(it).bufferedReader().use { input -> input.readText() }
    }
    private fun node(root: AccessibilityNodeInfo?, match: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (root == null) return null
        if (match(root)) return root
        for (i in 0 until root.childCount) node(root.getChild(i),match)?.let { return it }
        return null
    }
    private fun waitUntil(message: String, condition: () -> Boolean) {
        val end=System.currentTimeMillis()+30000
        while(System.currentTimeMillis()<end) { if(condition()) return; Thread.sleep(100) }
        fail(message)
    }
    private fun js(scenario: ActivityScenario<MainActivity>, code: String): String {
        val latch=CountDownLatch(1); val value=AtomicReference("")
        scenario.onActivity { it.bridge.webView.evaluateJavascript(code) { result -> value.set(result); latch.countDown() } }
        assertTrue(latch.await(5,TimeUnit.SECONDS)); return value.get()
    }
    @Test fun realPermissionDenialRetryAndGrantContinueToAndroidInstaller() {
        check(android.os.Build.HARDWARE in listOf("ranchu","goldfish")) { "This scenario is only for isolated emulators." }
        shell("appops set app.neoform.android REQUEST_INSTALL_PACKAGES default")
        val dir=File(context.cacheDir,"updates").apply { mkdirs() }
        val apk=File(dir,"neoform.apk"); val manifest=File(dir,"release.json")
        try {
            instrumentation.context.assets.open("neoform-update.apk").use { input -> apk.outputStream().use { input.copyTo(it) } }
            val candidate=UpdateArchive.identity(context.packageManager.getPackageArchiveInfo(apk.absolutePath,PackageManager.GET_SIGNING_CERTIFICATES)!!)
            assertTrue(candidate.versionCode>UpdateArchive.installed(context).versionCode)
            manifest.writeText(JSONObject().put("applicationId",candidate.applicationId).put("version",candidate.version)
                .put("versionCode",candidate.versionCode).put("sha","a".repeat(40)).put("apkSha256",UpdateArchive.hash(apk.readBytes()))
                .put("bytes",apk.length()).put("url",UpdatePolicy.APK_PATH).toString())
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                waitUntil("Bundled update bridge must load") {
                    js(scenario,"Boolean(window.Capacitor && window.Capacitor.Plugins.AppUpdates)")=="true"
                }
                val install="""window.__updateResult='waiting';window.Capacitor.Plugins.AppUpdates.install().then(function(){window.__updateResult='installer-opened'},function(e){window.__updateResult=e.message});"""
                js(scenario,install)
                waitUntil("Android must open the per-app install permission screen") {
                    instrumentation.uiAutomation.rootInActiveWindow?.packageName?.toString()=="com.android.settings"
                }
                assertFalse(context.packageManager.canRequestPackageInstalls())
                shell("input keyevent 4")
                waitUntil("Denying permission must reject, without installing") {
                    js(scenario,"window.__updateResult || ''").contains("permission was not enabled")
                }
                js(scenario,install)
                waitUntil("Retry must reopen the permission control") {
                    node(instrumentation.uiAutomation.rootInActiveWindow) { it.isCheckable && it.isEnabled && !it.isChecked } != null
                }
                var toggle=node(instrumentation.uiAutomation.rootInActiveWindow) { it.isCheckable && it.isEnabled && !it.isChecked }!!
                while(!toggle.isClickable && toggle.parent!=null) toggle=toggle.parent
                assertTrue(toggle.performAction(AccessibilityNodeInfo.ACTION_CLICK))
                waitUntil("Permission changes only after the explicit system toggle") { context.packageManager.canRequestPackageInstalls() }
                shell("input keyevent 4")
                waitUntil("Granting permission must continue automatically to the Android update confirmation") {
                    node(instrumentation.uiAutomation.rootInActiveWindow) {
                        it.className?.toString()=="android.widget.Button" && it.text?.toString()?.lowercase() in listOf("update","install")
                    } != null
                }
                // Leave the system's final confirmation to the user. Do not replace the test process.
                shell("input keyevent 4")
                waitUntil("The native call must acknowledge the installer, never claim an installation") {
                    js(scenario,"window.__updateResult || ''").contains("installer-opened")
                }
            }
        } finally {
            shell("appops set app.neoform.android REQUEST_INSTALL_PACKAGES default")
            apk.delete(); manifest.delete()
        }
    }
    @Test fun realApkIdentityChecksumAndSigningCertificateAreVerifiedBeforeInstallation() {
        val dir=File(context.cacheDir,"qa-update-${UUID.randomUUID()}").apply { mkdirs() }
        val file=File(dir,"download.tmp.apk")
        try {
            File(context.applicationInfo.sourceDir).copyTo(file)
            val current=UpdateArchive.installed(context)
            val parsed=context.packageManager.getPackageArchiveInfo(file.absolutePath,PackageManager.GET_SIGNING_CERTIFICATES)!!
            assertEquals(current,UpdateArchive.identity(parsed))
            assertTrue(current.signers.isNotEmpty())
            val release=UpdateRelease(current.applicationId,current.version,current.versionCode,"a".repeat(40),
                UpdateArchive.hash(file.readBytes()),file.length(),UpdatePolicy.APK_PATH)
            // Simulate an older installation with the same real signing certificate.
            val previous=current.copy(versionCode=current.versionCode-1)
            assertTrue(UpdateArchive.verified(context,file,release,previous))
            assertFalse(UpdateArchive.verified(context,file,release,current))
            assertFalse(UpdateArchive.verified(context,file,release.copy(apkSha256="0".repeat(64)),previous))
            assertFalse(UpdateArchive.verified(context,file,release,previous.copy(signers=setOf("wrong-key"))))
            file.appendText("tampered")
            assertFalse(UpdateArchive.verified(context,file,release,previous))
        } finally { file.delete(); dir.delete() }
    }
    @Test fun installerCanReceiveOnlyAScopedContentUriAndNoPermissionIsGrantedByInstallation() {
        val dir=File(context.cacheDir,"updates").apply { mkdirs() }
        val file=File(dir,"qa-${UUID.randomUUID()}.apk").apply { writeText("synthetic") }
        try {
            val uri=FileProvider.getUriForFile(context,"${context.packageName}.fileprovider",file)
            assertEquals("content",uri.scheme)
            assertEquals("${context.packageName}.fileprovider",uri.authority)
            assertFalse(context.packageManager.canRequestPackageInstalls())
            val info=context.packageManager.getPackageInfo(context.packageName,PackageManager.GET_PERMISSIONS)
            assertTrue(info.requestedPermissions!!.contains("android.permission.REQUEST_INSTALL_PACKAGES"))
        } finally { file.delete() }
    }
}
