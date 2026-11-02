package com.liamreed.maoxuan.mobile;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state) { registerPlugin(LanSyncPlugin.class); super.onCreate(state); }
}
