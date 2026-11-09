import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.liamreed.maoxuan.mobile',
  appName: '毛选实用工具箱',
  webDir: 'dist',
  backgroundColor: '#f7f5f0',
  plugins: {
    // Keep the WebView inside the system bars, including on Android 15+.
    // Pair with viewport-fit=contain; cover would enable edge-to-edge again.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'contain',
      style: 'LIGHT',
      hidden: false
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false
    }
  }
}
export default config
