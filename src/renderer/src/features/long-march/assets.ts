import type { MarchNode } from '@shared/long-march'
export const terrainImage = new URL('./assets/terrain.png', import.meta.url).href
export const satelliteImage = new URL('./assets/satellite.jpg', import.meta.url).href
export const marchMusic = new URL('./assets/qingtian-strings.mp3', import.meta.url).href
const landscapes: Record<string, string> = {
  yudu: new URL('./assets/nodes/yudu.png', import.meta.url).href,
  xiangjiang: new URL('./assets/nodes/xiangjiang.png', import.meta.url).href,
  zunyi: new URL('./assets/nodes/zunyi.png', import.meta.url).href,
  chishui: new URL('./assets/nodes/chishui.png', import.meta.url).href,
  jinshajiang: new URL('./assets/nodes/jinshajiang.png', import.meta.url).href,
  luding: new URL('./assets/nodes/luding.png', import.meta.url).href,
  jiajin: new URL('./assets/nodes/jiajin.png', import.meta.url).href,
  maogong: new URL('./assets/nodes/maogong.png', import.meta.url).href,
  ruoergai: new URL('./assets/nodes/ruoergai.png', import.meta.url).href,
  lazikou: new URL('./assets/nodes/lazikou.png', import.meta.url).href,
  hadapu: new URL('./assets/nodes/hadapu.png', import.meta.url).href,
  wuqi: new URL('./assets/nodes/wuqi.png', import.meta.url).href
}
export const landscapeFor = (node: MarchNode) => landscapes[node.id]
