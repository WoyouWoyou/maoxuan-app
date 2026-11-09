package com.liamreed.maoxuan.mobile;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle state) {
  registerPlugin(LanSyncPlugin.class);
  super.onCreate(state);
  getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){
   @Override public void handleOnBackPressed(){if(getBridge()!=null)getBridge().triggerWindowJSEvent("maoxuan-back");}
  });
 }
}
