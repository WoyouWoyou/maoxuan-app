// Validate the copied resources, including Windows paths, before creating the installer.
const path = require('node:path')
const fs = require('node:fs/promises')
const { createHash } = require('node:crypto')

module.exports = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : path.join(context.appOutDir, 'resources')
  const source = await fs.readFile(
    path.join(context.packager.projectDir, 'resources', 'articles.json')
  )
  const installed = await fs.readFile(path.join(resources, 'articles.json'))
  const hash = (data) => createHash('sha256').update(data).digest('hex')
  if (hash(source) !== hash(installed)) throw new Error('安装包正文与音频生成正文不一致')
  const { checkCoreAudio } = await import('./check-core-audio.mjs')
  await checkCoreAudio(path.join(resources, 'core-audio', 'v1'))
}
