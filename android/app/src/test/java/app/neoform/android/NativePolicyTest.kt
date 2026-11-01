package app.neoform.android

import org.junit.Assert.*
import org.junit.Test

class NativePolicyTest {
    @Test fun callbacksRequireTheLiveMainThread() {
        assertTrue(NativePolicy.callbackAllowed(true,false,false,true))
        assertFalse(NativePolicy.callbackAllowed(true,false,false,false))
        assertFalse(NativePolicy.callbackAllowed(false,false,false,true))
        assertFalse(NativePolicy.callbackAllowed(true,true,false,true))
        assertFalse(NativePolicy.callbackAllowed(true,false,true,true))
    }
    @Test fun refusesOriginAndTraversalInjection() {
        assertTrue(NativePolicy.apiPathAllowed("/api/history/sessions?cursor=abc"))
        listOf("https://evil.test/api/me", "//evil.test/api/me", "/api/../password", "/api/%2e%2e", "/api/me#other").forEach { assertFalse(NativePolicy.apiPathAllowed(it)) }
    }
    @Test fun requiresBothBoundAndAuthenticatedLockedSharma() {
        assertTrue(NativePolicy.healthAllowed("sharma", "sharma", true, 2000, 1000))
        assertFalse(NativePolicy.healthAllowed(null, "sharma", true, 2000, 1000))
        assertFalse(NativePolicy.healthAllowed("sharma", "abhishek", true, 2000, 1000))
        assertFalse(NativePolicy.healthAllowed("sharma", "sharma", false, 2000, 1000))
        assertFalse(NativePolicy.healthAllowed("sharma", "sharma", true, 1000, 1000))
    }
    @Test fun expiresAndVersionsRestAlerts() {
        assertTrue(NativePolicy.deliverAlarm(2, 2, true, 1000, 1000))
        assertFalse(NativePolicy.deliverAlarm(1, 2, true, 1000, 1001))
        assertFalse(NativePolicy.deliverAlarm(2, 2, false, 1000, 1001))
        assertFalse(NativePolicy.deliverAlarm(2, 2, true, 0, 1001))
        assertFalse(NativePolicy.deliverAlarm(2, 2, true, 1000, 999))
        assertFalse(NativePolicy.deliverAlarm(2, 2, true, 1000, 121001))
    }
}
