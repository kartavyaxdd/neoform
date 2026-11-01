package app.neoform.android

data class UpdateRelease(val applicationId: String, val version: String, val versionCode: Long,
    val sha: String, val apkSha256: String, val bytes: Long, val url: String)
data class UpdateIdentity(val applicationId: String, val version: String, val versionCode: Long, val signers: Set<String>)
object UpdatePolicy {
    const val ORIGIN = "https://neoform-bca721354a.kartavya-neoform.workers.dev"
    const val APK_PATH = "/downloads/neoform.apk"
    const val MAX_BYTES = 25L * 1024 * 1024
    fun valid(r: UpdateRelease) = r.applicationId == "app.neoform.android" &&
        r.versionCode in 1..Int.MAX_VALUE.toLong() && r.bytes in 1000..MAX_BYTES &&
        r.version.matches(Regex("[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}(?:[-+][a-zA-Z0-9.-]{1,40})?")) &&
        r.sha.matches(Regex("[a-f0-9]{40}")) && r.apkSha256.matches(Regex("[a-f0-9]{64}")) && r.url == APK_PATH
    fun accepts(installed: UpdateIdentity, candidate: UpdateIdentity, release: UpdateRelease) =
        valid(release) && installed.applicationId == release.applicationId && candidate.applicationId == release.applicationId &&
        candidate.versionCode == release.versionCode && candidate.version == release.version && candidate.versionCode > installed.versionCode &&
        candidate.signers.isNotEmpty() && candidate.signers == installed.signers
    fun integrity(r: UpdateRelease, bytes: Long, hash: String) = valid(r) && r.bytes == bytes && r.apkSha256 == hash
}
