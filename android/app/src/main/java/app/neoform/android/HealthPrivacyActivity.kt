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
            text = "NEOFORM can read steps, sleep sessions, body weight, logged nutrition energy and resting heart rate when you choose to connect. Each permission is optional.\n\n" +
                "Records stay encrypted on this phone and are visible only inside the authenticated locked Sharma profile. They are not uploaded to the shared workout workspace, cloud backups, Gemini, analytics or logs.\n\n" +
                "Health trends can prompt an optional readiness question. Only your explicit confirmation becomes ordinary workout context. Sensor data never fills pain, fatigue or effort answers, and never silently changes training targets.\n\n" +
                "Data is read while the app is open, up to the available preceding 30 days. NEOFORM does not write or delete source records. It requests no background, extended history or medical-record permissions. Source apps must supply the records; proprietary scores may not be available.\n\n" +
                "You can revoke individual permissions in Health Connect at any time. In NEOFORM → More → Health Connect, Disconnect revokes this app's permissions and deletes its cache. Delete imported data removes the cache and stops import until reconnected. Neither action deletes data from your ring or source apps.\n\n" +
                "You can use NEOFORM without Health Connect. These observations are not a medical assessment or a measured recovery score."
        })
        content.addView(Button(this).apply { text = "Done"; setOnClickListener { finish() } })
        setContentView(ScrollView(this).apply { addView(content) })
    }
}
