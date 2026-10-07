package app.halfway.meet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlertSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
