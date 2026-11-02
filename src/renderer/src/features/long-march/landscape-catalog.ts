import type { MarchNode } from '@shared/long-march'

/** Node-specific art direction stays independent of growth and persistence rules. */
export const landscapeCatalog: Record<string, { title: string; description: string }> = {
  yudu: {
    title: '贡水启程',
    description: '于都贡江开阔江面、东门古渡石阶与赣南低丘，晨雾中迎来曙光。'
  },
  xiangjiang: { title: '湘水长风', description: '桂北湘江江面、河岸沙洲与青山，倒映柔和晚霞。' },
  zunyi: {
    title: '黔北庭光',
    description: '遵义会议会址的砖木楼房、灰瓦与回廊，掩映在黔北绿意之中。'
  },
  chishui: {
    title: '丹霞竹瀑',
    description: '赤水地区的红色丹霞崖壁、飞瀑与竹林，以区域自然景观呈现这一站。'
  },
  jinshajiang: { title: '金沙云崖', description: '皎平渡一带金沙江的干热河谷、陡坡与渡口江面。' },
  luding: { title: '大渡桥横', description: '泸定桥铁索横跨大渡河，两岸山城与高山峡谷映入眼帘。' },
  jiajin: { title: '夹金晴雪', description: '夹金山雪峰、山口与高山草甸，冷杉林停留在林线以下。' },
  maogong: {
    title: '懋功山居',
    description: '小金地区的山谷、溪流与嘉绒藏式民居，群山间展开宁静聚落。'
  },
  ruoergai: {
    title: '草海回澜',
    description: '若尔盖开阔的高原草地与湿地河曲，远山、云影与水面相接。'
  },
  lazikou: {
    title: '峡关松声',
    description: '腊子口两侧陡峭山壁夹出狭窄通道，林木与急流沿峡谷延伸。'
  },
  hadapu: {
    title: '铺街晓色',
    description: '哈达铺的传统灰瓦木构街巷与古镇屋舍，山地光影映出安静秋色。'
  },
  wuqi: { title: '陕北曙光', description: '吴起的黄土沟壑、梯田与窑洞，河谷杨柳沐浴在金色晨光中。' }
}
export const landscapeInfo = (node: MarchNode) => landscapeCatalog[node.id]
