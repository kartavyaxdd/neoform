package app.neoform.android
import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.Duration
import kotlinx.coroutines.CancellationException
class HealthReadException(val metric: String, cause: Exception) : Exception("Health Connect read failed", cause)
class HealthReader(private val context: Context): HealthSource {
    private suspend fun <T> reading(metric: String, block: suspend () -> T): T = try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { throw HealthReadException(metric, e) }
    companion object {
        val permissions = linkedMapOf(
            "steps" to HealthPermission.getReadPermission(StepsRecord::class),
            "sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class),
            "weight" to HealthPermission.getReadPermission(WeightRecord::class),
            "nutrition" to HealthPermission.getReadPermission(NutritionRecord::class),
            "resting-heart-rate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            "hrv-rmssd" to HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
            "respiratory-rate" to HealthPermission.getReadPermission(RespiratoryRateRecord::class),
            "skin-temperature" to HealthPermission.getReadPermission(SkinTemperatureRecord::class))
        const val backgroundPermission = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
    }
    fun availability(): String = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install-required"
        else -> "unsupported"
    }
    private fun client() = HealthConnectClient.getOrCreate(context)
    fun feature(feature: Int): Boolean = availability() == "available" && client().features.getFeatureStatus(feature) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    fun requested(): Set<String> = permissions.filterKeys { it != "skin-temperature" || feature(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE) }.values.toSet()
    override suspend fun backgroundGranted(): Boolean = feature(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) && backgroundPermission in client().permissionController.getGrantedPermissions()
    override suspend fun granted(): List<String> {
        if (availability() != "available") return emptyList()
        val granted = client().permissionController.getGrantedPermissions()
        val kinds = permissions.filterValues { it in granted }.keys.toMutableList()
        if ("nutrition" in kinds) kinds.add("protein")
        return kinds
    }
    suspend fun disconnect() { if (availability() == "available") client().permissionController.revokeAllPermissions() }
    private fun sourceName(source: String): String = try {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(source, 0)).toString().take(200)
    } catch (_: Exception) { source }
    override suspend fun read(previous: JSONObject?): JSONObject {
        check(availability() == "available") { "Health Connect needs installation or an update." }
        val client = client()
        val now = Instant.now()
        val zone = ZoneId.systemDefault()
        val start = now.minus(Duration.ofDays(30))
        val range = TimeRangeFilter.between(start, now)
        val granted = granted()
        val rows = JSONArray()
        var clipped = false
        fun add(kind: String, id: String, source: String, startAt: Instant, endAt: Instant, value: Double, unit: String, metadata: Metadata? = null): JSONObject? {
            if (rows.length() >= 10000) { clipped = true; return null }
            val row = JSONObject().put("kind", kind).put("id", id).put("source", source)
                .put("sourceName", if (source == "health-connect-aggregate") "Health Connect · prioritized sources" else sourceName(source))
                .put("startAt", startAt.toEpochMilli()).put("endAt", endAt.toEpochMilli())
                .put("day", endAt.atZone(zone).toLocalDate().toString()).put("value", value).put("unit", unit)
            metadata?.let { m ->
                row.put("recordingMethod", m.recordingMethod)
                m.device?.let { d -> row.put("device", listOf(d.manufacturer ?: "", d.model ?: "", d.type.toString()).joinToString("|").take(200)) }
            }
            rows.put(row)
            return row
        }
        if ("steps" in granted) {
            // Use platform aggregation and user source priority; never sum raw mirrored step records.
            var day = start.atZone(zone).toLocalDate()
            while (!day.isAfter(now.atZone(zone).toLocalDate())) {
                val from = maxOf(day.atStartOfDay(zone).toInstant(), start)
                val to = minOf(day.plusDays(1).atStartOfDay(zone).toInstant(), now)
                if (from < to) {
                    val result = reading("steps") { client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(from, to))) }
                    result[StepsRecord.COUNT_TOTAL]?.let {
                        add("steps", "steps-$day", "health-connect-aggregate", from, to.minusMillis(1), it.toDouble(), "count")
                    }
                }
                day = day.plusDays(1)
            }
        }
        if ("sleep" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("sleep") { client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.filter { it.endTime <= now }.forEach {
                    add("sleep", it.metadata.id, it.metadata.dataOrigin.packageName, it.startTime, it.endTime,
                        Duration.between(it.startTime, it.endTime).toMillis() / 60000.0, "min", it.metadata)?.apply {
                        val sleep = HealthImportPolicy.sleep(it.startTime.toEpochMilli(), it.endTime.toEpochMilli(), it.stages.map { stage -> Triple(stage.startTime.toEpochMilli(), stage.endTime.toEpochMilli(), stage.stage) })
                        put("asleepMinutes", sleep.asleep); put("awakeMinutes", sleep.awake); put("stageCoverage", sleep.coverage)
                    }
                }
                token = reading("sleep") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("weight" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("weight") { client.readRecords(ReadRecordsRequest(WeightRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.forEach { add("weight", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.weight.inKilograms, "kg", it.metadata) }
                token = reading("weight") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("nutrition" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("nutrition") { client.readRecords(ReadRecordsRequest(NutritionRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.filter { it.endTime <= now }.forEach {
                    it.protein?.let { protein -> add("protein", it.metadata.id, it.metadata.dataOrigin.packageName, it.startTime, it.endTime, protein.inGrams, "g", it.metadata) }
                    it.energy?.let { energy -> add("nutrition", it.metadata.id, it.metadata.dataOrigin.packageName, it.startTime, it.endTime, energy.inKilocalories, "kcal", it.metadata) }
                }
                token = reading("nutrition") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("resting-heart-rate" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("resting-heart-rate") { client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.forEach { add("resting-heart-rate", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.beatsPerMinute.toDouble(), "bpm", it.metadata) }
                token = reading("resting-heart-rate") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("hrv-rmssd" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("hrv-rmssd") { client.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.forEach { add("hrv-rmssd", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.heartRateVariabilityMillis, "ms", it.metadata) }
                token = reading("hrv-rmssd") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("respiratory-rate" in granted) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("respiratory-rate") { client.readRecords(ReadRecordsRequest(RespiratoryRateRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.forEach { add("respiratory-rate", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.rate, "breaths/min", it.metadata) }
                token = reading("respiratory-rate") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("skin-temperature" in granted && feature(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE)) {
            var token: String? = null
            val cursor = HealthPageCursor()
            do {
                val result = reading("skin-temperature") { client.readRecords(ReadRecordsRequest(SkinTemperatureRecord::class, range, pageSize = 500, pageToken = token)) }
                result.records.forEach { record -> record.deltas.forEach { delta ->
                    add("skin-temperature", record.metadata.id + ":" + delta.time.toEpochMilli(), record.metadata.dataOrigin.packageName, delta.time, delta.time, delta.delta.inCelsius, "°C", record.metadata)?.put("context", "location:" + record.measurementLocation)
                } }
                token = reading("skin-temperature") { cursor.next(result.pageToken) }
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        val metricStatus = JSONObject()
        for (kind in permissions.keys + "protein") {
            val any = (0 until rows.length()).any { rows.getJSONObject(it).optString("kind") == kind }
            metricStatus.put(kind, if(kind == "skin-temperature" && !feature(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE)) "unsupported" else if(kind !in granted) "denied" else if(clipped) "partial" else if(any) "imported" else "empty")
        }
        return JSONObject().put("metricStatus",metricStatus).put("version", 2).put("enabled", true).put("syncedAt", now.toEpochMilli())
            .put("permissions", JSONArray(granted)).put("records", rows).put("sources", previous?.optJSONObject("sources") ?: JSONObject()).put("clipped", clipped)
    }
}
