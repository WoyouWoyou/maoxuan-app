package com.liamreed.maoxuan.mobile;

import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.X509TrustManager;

final class LanSyncTrust {
    static URL endpoint(String address) throws Exception {
        URL url = new URL(address);
        String[] parts = url.getHost().split("[.]");
        if (!url.getProtocol().equals("https") || !url.getPath().equals("/sync")
                || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null
                || parts.length != 4 || url.getPort() < 1 || url.getPort() > 65535) {
            throw new Exception("配对地址无效");
        }
        int[] ip = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("[0-9]{1,3}")) throw new Exception("需要局域网 IPv4 地址");
            ip[i] = Integer.parseInt(parts[i]);
            if (ip[i] > 255) throw new Exception("地址无效");
        }
        if (!(ip[0] == 10 || (ip[0] == 192 && ip[1] == 168)
                || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31))) {
            throw new Exception("只能连接局域网电脑");
        }
        return url;
    }

    static X509TrustManager pinned(String fingerprint) throws Exception {
        if (!fingerprint.matches("[a-f0-9]{64}")) throw new Exception("证书指纹无效");
        return new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                throw new CertificateException("不支持客户端证书");
            }
            public void checkServerTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                try {
                    if (chain.length == 0) throw new Exception("缺少证书");
                    chain[0].checkValidity();
                    byte[] digest = MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
                    StringBuilder hex = new StringBuilder();
                    for (byte b : digest) hex.append(String.format("%02x", b & 255));
                    if (!MessageDigest.isEqual(hex.toString().getBytes(StandardCharsets.US_ASCII),
                            fingerprint.getBytes(StandardCharsets.US_ASCII))) {
                        throw new Exception("电脑身份已变化，请重新配对");
                    }
                } catch (Exception error) { throw new CertificateException(error); }
            }
        };
    }
}
