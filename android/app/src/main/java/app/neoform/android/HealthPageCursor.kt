package app.neoform.android

/** Older Health Connect providers may finish pagination with "" instead of null. */
class HealthPageCursor(private val maxPages: Int = 100) {
    private val seen = mutableSetOf<String>()
    private var pages = 0
    fun next(raw: String?): String? {
        pages++
        if (raw.isNullOrBlank()) return null
        check(pages < maxPages && seen.add(raw)) { "Health Connect pagination did not finish" }
        return raw
    }
}
