import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
export async function shareBackup(content: string, filename: string) {
  const result = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  })
  await Share.share({ title: '毛选随身读 · 本地备份', url: result.uri, dialogTitle: '保存备份到…' })
}
