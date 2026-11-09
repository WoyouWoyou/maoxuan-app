/** Independent story art and narration. Reward landscape assets are never used here. */
const stories: Record<string, { image: string; audio: string }> = {
  yudu: {
    image: new URL('./assets/stories/yudu.png', import.meta.url).href,
    audio: new URL('./assets/stories/yudu.mp3', import.meta.url).href
  },
  xiangjiang: {
    image: new URL('./assets/stories/xiangjiang.png', import.meta.url).href,
    audio: new URL('./assets/stories/xiangjiang.mp3', import.meta.url).href
  },
  zunyi: {
    image: new URL('./assets/stories/zunyi.png', import.meta.url).href,
    audio: new URL('./assets/stories/zunyi.mp3', import.meta.url).href
  },
  chishui: {
    image: new URL('./assets/stories/chishui.png', import.meta.url).href,
    audio: new URL('./assets/stories/chishui.mp3', import.meta.url).href
  },
  jinshajiang: {
    image: new URL('./assets/stories/jinshajiang.png', import.meta.url).href,
    audio: new URL('./assets/stories/jinshajiang.mp3', import.meta.url).href
  },
  luding: {
    image: new URL('./assets/stories/luding.png', import.meta.url).href,
    audio: new URL('./assets/stories/luding.mp3', import.meta.url).href
  },
  jiajin: {
    image: new URL('./assets/stories/jiajin.png', import.meta.url).href,
    audio: new URL('./assets/stories/jiajin.mp3', import.meta.url).href
  },
  maogong: {
    image: new URL('./assets/stories/maogong.png', import.meta.url).href,
    audio: new URL('./assets/stories/maogong.mp3', import.meta.url).href
  },
  ruoergai: {
    image: new URL('./assets/stories/ruoergai.png', import.meta.url).href,
    audio: new URL('./assets/stories/ruoergai.mp3', import.meta.url).href
  },
  lazikou: {
    image: new URL('./assets/stories/lazikou.png', import.meta.url).href,
    audio: new URL('./assets/stories/lazikou.mp3', import.meta.url).href
  },
  hadapu: {
    image: new URL('./assets/stories/hadapu.png', import.meta.url).href,
    audio: new URL('./assets/stories/hadapu.mp3', import.meta.url).href
  },
  wuqi: {
    image: new URL('./assets/stories/wuqi.png', import.meta.url).href,
    audio: new URL('./assets/stories/wuqi.mp3', import.meta.url).href
  }
}
export function storyResources(id: string) {
  const resources = stories[id]
  if (!resources) throw new Error(`Unknown story asset: ${id}`)
  return resources
}
