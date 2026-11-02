import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.liamreed.maoxuan.mobile',
  appName: '毛选实用工具箱',
  webDir: 'dist',
  backgroundColor: '#f7f5f0',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false
    }
  }
}
export default config
