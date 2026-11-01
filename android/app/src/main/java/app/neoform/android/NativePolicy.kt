package app.neoform.android

/** Small shared boundary rules, independently testable without a device or private state. */
object NativePolicy {
    fun callbackAllowed(active: Boolean, finishing: Boolean, destroyed: Boolean, mainThread: Boolean): Boolean = active && !finishing && !destroyed && mainThread
    fun apiPathAllowed(path: String): Boolean = path.matches(Regex("^/api/[a-zA-Z0-9_/?=&.%-]+$")) && !path.contains("..") && !path.contains('%')
    fun healthAllowed(profile: String?, authenticated: String?, locked: Boolean, expiresAt: Long, now: Long): Boolean =
        profile == "sharma" && authenticated == "sharma" && locked && expiresAt > now
    fun deliverAlarm(version: Long, current: Long, enabled: Boolean, deadline: Long, now: Long): Boolean =
        version == current && enabled && deadline > 0 && now >= deadline && now - deadline <= 120000
}
