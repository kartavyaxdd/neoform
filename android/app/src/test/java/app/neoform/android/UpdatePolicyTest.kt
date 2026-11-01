package app.neoform.android

import org.junit.Assert.*
import org.junit.Test

class UpdatePolicyTest {
    private val release = UpdateRelease("app.neoform.android", "1.2.0", 99, "a".repeat(40), "b".repeat(64), 14000000, "/downloads/neoform.apk")
    private val installed = UpdateIdentity("app.neoform.android", "1.1.0", 53, setOf("trusted"))
    @Test fun onlyTheFixedAppAndBoundedManifestAreAccepted() {
        assertTrue(UpdatePolicy.valid(release))
        for (bad in listOf(
            release.copy(applicationId="other.app"), release.copy(versionCode=0),
            release.copy(versionCode=Int.MAX_VALUE.toLong()+1), release.copy(bytes=30000000),
            release.copy(bytes=0), release.copy(sha="bad"), release.copy(apkSha256=""),
            release.copy(url="https://evil.example/app.apk"), release.copy(url="/downloads/../app.apk"),
        )) assertFalse(UpdatePolicy.valid(bad))
    }
    @Test fun downgradesWrongVersionsAndDifferentSigningKeysNeverReachInstaller() {
        val candidate = installed.copy(version="1.2.0", versionCode=99)
        assertTrue(UpdatePolicy.accepts(installed,candidate,release))
        assertFalse(UpdatePolicy.accepts(installed,candidate.copy(signers=setOf("other")),release))
        assertFalse(UpdatePolicy.accepts(installed,candidate.copy(signers=emptySet()),release))
        assertFalse(UpdatePolicy.accepts(installed,candidate.copy(applicationId="other"),release))
        assertFalse(UpdatePolicy.accepts(installed,candidate.copy(versionCode=98),release))
        assertFalse(UpdatePolicy.accepts(installed,candidate.copy(version="2.0.0"),release))
        assertFalse(UpdatePolicy.accepts(installed.copy(versionCode=99),candidate,release))
        assertFalse(UpdatePolicy.accepts(installed.copy(versionCode=100),candidate,release))
    }
    @Test fun checksumAndLengthMustBothMatchExactly() {
        assertTrue(UpdatePolicy.integrity(release,14000000,"b".repeat(64)))
        assertFalse(UpdatePolicy.integrity(release,14000001,"b".repeat(64)))
        assertFalse(UpdatePolicy.integrity(release,14000000,"c".repeat(64)))
    }
}
