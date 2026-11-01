package app.neoform.android
import org.json.JSONObject
/** Provider boundary permits deterministic concurrency/permission tests without personal records. */
interface HealthSource {
    suspend fun granted(): List<String>
    suspend fun backgroundGranted(): Boolean
    suspend fun read(previous: JSONObject?): JSONObject
}
