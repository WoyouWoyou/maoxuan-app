// Runs for macOS and Windows packaging; release builds must contain all five articles.
module.exports = async function beforePack() {
  const { checkCoreAudio } = await import('./check-core-audio.mjs')
  await checkCoreAudio()
}
