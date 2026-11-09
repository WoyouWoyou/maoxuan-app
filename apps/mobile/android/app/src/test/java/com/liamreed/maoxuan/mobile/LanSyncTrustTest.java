package com.liamreed.maoxuan.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
import java.security.MessageDigest;
import java.security.cert.*;
public class LanSyncTrustTest {
    @Test public void onlyPrivateIpv4HttpsSyncEndpointsAreAllowed() throws Exception {
        assertEquals("192.168.1.2", LanSyncTrust.endpoint("https://192.168.1.2:4321/sync").getHost());
        for (String url : new String[]{"http://192.168.1.2:4321/sync", "https://8.8.8.8:443/sync", "https://192.168.1.2:443/other", "https://192.168.1.2:443/sync?token=abc", "https://user@192.168.1.2:443/sync", "https://192.168.999.1:443/sync"}) {
            try { LanSyncTrust.endpoint(url); fail("Unsafe endpoint accepted"); } catch (Exception expected) { }
        }
    }
    @Test public void acceptsExactCertificateAndRejectsMismatchAndEmptyChain() throws Exception {
        X509Certificate cert=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(getClass().getResourceAsStream("/lan-sync-test-cert.pem"));
        StringBuilder pin=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()))pin.append(String.format("%02x",b&255));
        LanSyncTrust.pinned(pin.toString()).checkServerTrusted(new X509Certificate[]{cert},"RSA");
        try { LanSyncTrust.pinned("0".repeat(64)).checkServerTrusted(new X509Certificate[]{cert},"RSA");fail("Wrong certificate accepted"); } catch(CertificateException expected) { }
        try { LanSyncTrust.pinned(pin.toString()).checkServerTrusted(new X509Certificate[0],"RSA");fail("Empty certificate accepted"); } catch(CertificateException expected) { }
    }
}
