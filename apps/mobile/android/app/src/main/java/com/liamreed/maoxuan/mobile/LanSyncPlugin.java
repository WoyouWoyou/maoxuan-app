package com.liamreed.maoxuan.mobile;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import javax.net.ssl.*;
import java.net.*;
import java.security.*;
import java.security.cert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
@CapacitorPlugin(name="LanSync")
public class LanSyncPlugin extends Plugin {
 @PluginMethod public void minimize(PluginCall call) {
  getActivity().runOnUiThread(()->{getActivity().moveTaskToBack(true);call.resolve();});
 }

 @PluginMethod public void exchange(PluginCall call) {
  new Thread(()->{
   HttpsURLConnection connection=null;
   try {
    String address=call.getString("url", ""), fingerprint=call.getString("fingerprint", ""), token=call.getString("token", ""), body=call.getString("body", "");
    URL url=LanSyncTrust.endpoint(address);
    if(!token.matches("[a-f0-9]{64}"))throw new Exception("配对凭据无效");
    byte[] payload=body.getBytes(StandardCharsets.UTF_8);if(payload.length>20000000)throw new Exception("同步数据超过20MB");
    TrustManager[] trust={LanSyncTrust.pinned(fingerprint)};
    SSLContext context=SSLContext.getInstance("TLS");context.init(null,trust,new SecureRandom());
    connection=(HttpsURLConnection)url.openConnection();connection.setSSLSocketFactory(context.getSocketFactory());connection.setHostnameVerifier((host,session)->host.equals(url.getHost()));connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(30000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+token);connection.setFixedLengthStreamingMode(payload.length);
    try(OutputStream out=connection.getOutputStream()){out.write(payload);}
    int status=connection.getResponseCode();if(status!=200)throw new Exception("同步请求被拒绝（"+status+"），请检查配对码或电脑端错误");
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1){if(bytes.size()+n>20000000)throw new Exception("同步响应超过20MB");bytes.write(chunk,0,n);}}
    JSObject result=new JSObject();result.put("body",bytes.toString("UTF-8"));call.resolve(result);
   }catch(Exception e){call.reject("局域网同步失败："+e.getMessage());}finally{if(connection!=null)connection.disconnect();}
  }).start();
 }
}
