package app.neoform.android;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(NeoformNativePlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().triggerWindowJSEvent("neoform:android-back");
            }
        });
    }
}
