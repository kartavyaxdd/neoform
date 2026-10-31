package app.neoform.android

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
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

class HealthReader(private val context: Context) {
    companion object {
        val permissions = linkedMapOf(
            "steps" to HealthPermission.getReadPermission(StepsRecord::class),
            "sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class),
            "weight" to HealthPermission.getReadPermission(WeightRecord::class),
            "nutrition" to HealthPermission.getReadPermission(NutritionRecord::class),
            "resting-heart-rate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class))
    }
    fun availability(): String = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install-required"
        else -> "unsupported"
    }
    private fun client() = HealthConnectClient.getOrCreate(context)
    suspend fun granted(): List<String> {
        if (availability() != "available") return emptyList()
        val granted = client().permissionController.getGrantedPermissions()
        return permissions.filterValues { it in granted }.keys.toList()
    }
    suspend fun disconnect() { if (availability() == "available") client().permissionController.revokeAllPermissions() }
    private fun sourceName(source: String): String = try {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(source, 0)).toString().take(200)
    } catch (_: Exception) { source }
    suspend fun read(previous: JSONObject?): JSONObject {
        check(availability() == "available") { "Health Connect needs installation or an update." }
        val client = client()
        val now = Instant.now()
        val zone = ZoneId.systemDefault()
        val start = now.minus(Duration.ofDays(30))
        val range = TimeRangeFilter.between(start, now)
        val granted = granted()
        val rows = JSONArray()
        var clipped = false
        fun add(kind: String, id: String, source: String, startAt: Instant, endAt: Instant, value: Double, unit: String) {
            if (rows.length() >= 10000) { clipped = true; return }
            rows.put(JSONObject().put("kind", kind).put("id", id).put("source", source)
                .put("sourceName", if (source == "health-connect-aggregate") "Health Connect · prioritized sources" else sourceName(source))
                .put("startAt", startAt.toEpochMilli()).put("endAt", endAt.toEpochMilli())
                .put("day", endAt.atZone(zone).toLocalDate().toString()).put("value", value).put("unit", unit))
        }
        if ("steps" in granted) {
            // Use platform aggregation and user source priority; never sum raw mirrored step records.
            var day = start.atZone(zone).toLocalDate()
            while (!day.isAfter(now.atZone(zone).toLocalDate())) {
                val from = maxOf(day.atStartOfDay(zone).toInstant(), start)
                val to = minOf(day.plusDays(1).atStartOfDay(zone).toInstant(), now)
                if (from < to) {
                    val result = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(from, to)))
                    result[StepsRecord.COUNT_TOTAL]?.let {
                        add("steps", "steps-$day", "health-connect-aggregate", from, to.minusMillis(1), it.toDouble(), "count")
                    }
                }
                day = day.plusDays(1)
            }
        }
        if ("sleep" in granted) {
            var token: String? = null
            do {
                val result = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range, pageSize = 500, pageToken = token))
                result.records.filter { it.endTime <= now }.forEach {
                    add("sleep", it.metadata.id, it.metadata.dataOrigin.packageName, it.startTime, it.endTime,
                        Duration.between(it.startTime, it.endTime).toMillis() / 60000.0, "min")
                }
                token = result.pageToken
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("weight" in granted) {
            var token: String? = null
            do {
                val result = client.readRecords(ReadRecordsRequest(WeightRecord::class, range, pageSize = 500, pageToken = token))
                result.records.forEach { add("weight", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.weight.inKilograms, "kg") }
                token = result.pageToken
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("nutrition" in granted) {
            var token: String? = null
            do {
                val result = client.readRecords(ReadRecordsRequest(NutritionRecord::class, range, pageSize = 500, pageToken = token))
                result.records.filter { it.endTime <= now }.forEach {
                    it.energy?.let { energy -> add("nutrition", it.metadata.id, it.metadata.dataOrigin.packageName, it.startTime, it.endTime, energy.inKilocalories, "kcal") }
                }
                token = result.pageToken
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        if ("resting-heart-rate" in granted) {
            var token: String? = null
            do {
                val result = client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range, pageSize = 500, pageToken = token))
                result.records.forEach { add("resting-heart-rate", it.metadata.id, it.metadata.dataOrigin.packageName, it.time, it.time, it.beatsPerMinute.toDouble(), "bpm") }
                token = result.pageToken
            } while (token != null && rows.length() < 10000)
            if (token != null) clipped = true
        }
        return JSONObject().put("version", 1).put("enabled", true).put("syncedAt", now.toEpochMilli())
            .put("permissions", JSONArray(granted)).put("records", rows).put("sources", previous?.optJSONObject("sources") ?: JSONObject()).put("clipped", clipped)
    }
}
