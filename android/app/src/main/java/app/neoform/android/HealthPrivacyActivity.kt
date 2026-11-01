package app.neoform.android

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Button

/** Available from Android's permission screen without exposing a profile or health cache. */
class HealthPrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 48, 48, 48) }
        content.addView(TextView(this).apply {
            textSize = 22f
            text = "Health Connect and NEOFORM"
        })
        content.addView(TextView(this).apply {
            textSize = 17f
            setPadding(0, 24, 0, 24)
            text = "NEOFORM can read steps, staged sleep, body weight, logged energy/protein, resting heart rate, optional HRV RMSSD and breathing rate, plus supported skin-temperature deviations. Each data permission is optional.\n\n" +
                "Records, source choices, recovery estimates and health preferences stay encrypted on this phone, outside cloud workout state, existing backups, Gemini, analytics and logs. Readings are visible only inside authenticated Sharma. Separately enabled background imports can continue privately while the profile is locked; this never unlocks the profile.\n\n" +
                "The experimental recovery index compares observations with personal baselines. It is not a medical assessment, Welltory's proprietary score, or a percentage of muscle recovery. Missing observations stay unknown. Health data never fills pain, fatigue, muscle-recovery or RIR answers.\n\n" +
                "Automatic next-set reductions are off until explicitly enabled. They require fresh lower signals, your current check-in, reported effort, confirmed rest/execution and an independent performance-based recommendation. Only one supported upcoming load can be reduced per exercise/workout, with Undo. No sets, completed observations or future routines are rewritten.\n\n" +
                "Foreground imports read up to 30 available days. Enable private background imports requests separate permission and schedules work every 12 hours. Android battery restrictions and source-app delays can prevent twice-daily success or fresh readings. No persistent service, health writes, extended-history or medical-record permissions are used.\n\n" +
                "Revoke individual permissions in Health Connect at any time. More → Health Connect offers Disconnect and Delete imported data; both cancel background enrollment and clear imported records. Source-app data and workout history are preserved. Consumed adjustment guards retain ordinary workout/exercise IDs to prevent duplicate changes after reconnecting.\n\n" +
                "You can use NEOFORM without Health Connect."

        })
        content.addView(Button(this).apply { text = "Done"; setOnClickListener { finish() } })
        setContentView(ScrollView(this).apply { addView(content) })
    }
}
