/** Historical corridor: Central Red Army, October 1934–October 1935. */
export interface MarchNode {
  id: string
  name: string
  chapter: string
  date: string
  longitude: number
  latitude: number
  landscape: 'south' | 'plateau' | 'north'
  plant: string
  habitat: string
  story: string
  target: number
}
export const TREE_COST = 10
export const DAILY_GROWTH_LIMIT = 20
export const STATION_WAIT_MS = 72 * 60 * 60 * 1000
export const ACTIVITY_POINTS = 10
export const MARCH_NODES: readonly MarchNode[] = [
  {
    id: 'yudu',
    name: '于都',
    chapter: '从这里出发',
    date: '1934.10',
    longitude: 115.415,
    latitude: 25.952,
    landscape: 'south',
    plant: '香樟',
    habitat: '赣南河谷的常绿阔叶树',
    story: '中央红军从瑞金、于都等地出发，在于都集结渡河，踏上战略转移的征途。',
    target: 4
  },
  {
    id: 'xiangjiang',
    name: '湘江',
    chapter: '向前的勇气',
    date: '1934.11',
    longitude: 111.08,
    latitude: 25.88,
    landscape: 'south',
    plant: '桂花',
    habitat: '桂北村落与庭院的景观树',
    story: '红军在广西兴安、全州一带突破湘江封锁线，继续向西前进。',
    target: 4
  },
  {
    id: 'zunyi',
    name: '遵义',
    chapter: '转折之地',
    date: '1935.01',
    longitude: 106.927,
    latitude: 27.7,
    landscape: 'south',
    plant: '香樟',
    habitat: '黔北城镇与低山的常绿树',
    story: '遵义会议成为中国革命历史上一个生死攸关的转折点。让一次新的思考，在这里扎根。',
    target: 4
  },
  {
    id: 'chishui',
    name: '赤水',
    chapter: '灵活的智慧',
    date: '1935.01—03',
    longitude: 105.99,
    latitude: 28.59,
    landscape: 'south',
    plant: '楠竹',
    habitat: '赤水竹海的代表性景观植物',
    story: '四渡赤水是往复机动的行军过程。图中以渡口与走廊概括展示，不代表单一连续道路。',
    target: 4
  },
  {
    id: 'jinshajiang',
    name: '金沙江',
    chapter: '走出重围',
    date: '1935.05',
    longitude: 102.37,
    latitude: 26.28,
    landscape: 'plateau',
    plant: '云南松',
    habitat: '滇中山地的乡土针叶树',
    story: '红军从皎平渡等渡口渡过金沙江，摆脱围追堵截，转向北进。',
    target: 4
  },
  {
    id: 'luding',
    name: '泸定',
    chapter: '天险通途',
    date: '1935.05',
    longitude: 102.234,
    latitude: 29.914,
    landscape: 'plateau',
    plant: '高山栎',
    habitat: '大渡河两岸适宜海拔的山地林木',
    story: '红军强渡大渡河、飞夺泸定桥。桥与峡谷，见证向前的决心。',
    target: 4
  },
  {
    id: 'jiajin',
    name: '夹金山',
    chapter: '越过雪线',
    date: '1935.06',
    longitude: 102.72,
    latitude: 30.86,
    landscape: 'plateau',
    plant: '冷杉',
    habitat: '生长在雪线以下山坡，峰顶不植树',
    story: '红军翻越夹金山。这里的树种在山麓与林线之下，让雪峰保持本来的样子。',
    target: 4
  },
  {
    id: 'maogong',
    name: '懋功',
    chapter: '山间相逢',
    date: '1935.06',
    longitude: 102.36,
    latitude: 30.995,
    landscape: 'plateau',
    plant: '云杉',
    habitat: '今小金一带的山地针叶林',
    story: '红一、四方面军在懋功地区会师。山间相逢，汇聚新的力量。',
    target: 4
  },
  {
    id: 'ruoergai',
    name: '若尔盖',
    chapter: '穿过草地',
    date: '1935.08',
    longitude: 102.96,
    latitude: 33.0,
    landscape: 'plateau',
    plant: '高原柳灌丛',
    habitat: '适宜地带的乡土灌木，保留草地湿地',
    story: '长征穿过川西北草地。这里用乡土柳灌丛表达成长，不把天然湿地改造成森林。',
    target: 4
  },
  {
    id: 'lazikou',
    name: '腊子口',
    chapter: '险关之后',
    date: '1935.09',
    longitude: 103.89,
    latitude: 34.13,
    landscape: 'plateau',
    plant: '云杉',
    habitat: '岷山峡谷的山地针叶林',
    story: '突破腊子口，红军打开北上通道。走过险关，前方又是一片天地。',
    target: 4
  },
  {
    id: 'hadapu',
    name: '哈达铺',
    chapter: '曙光渐近',
    date: '1935.09',
    longitude: 104.22,
    latitude: 34.18,
    landscape: 'north',
    plant: '山杨',
    habitat: '陇南山地与村落周边的乡土树',
    story: '红军在哈达铺休整，进一步明确北上方向。把走过的路，变成继续向前的力量。',
    target: 4
  },
  {
    id: 'wuqi',
    name: '吴起',
    chapter: '陕北曙光',
    date: '1935.10',
    longitude: 108.176,
    latitude: 36.927,
    landscape: 'north',
    plant: '旱柳',
    habitat: '陕北沟谷与河岸的乡土树',
    story: '中央红军抵达吴起镇，完成长征。这一程的终点，也是新征途的起点。',
    target: 4
  }
]
/** Approximate historical corridor waypoints, not a navigation track. Includes the Chishui reversals. */
export const MARCH_LEGS: readonly (readonly [number, number][])[] = [
  [
    [115.415, 25.952],
    [115.1, 25.2],
    [114.35, 25.1],
    [113.7, 25.5],
    [112.6, 25.5],
    [111.08, 25.88]
  ],
  [
    [111.08, 25.88],
    [110.4, 26.15],
    [109.7, 26.25],
    [109.15, 26.2],
    [108.67, 26.97],
    [107.47, 27.07],
    [106.9, 27.15],
    [106.927, 27.7]
  ],
  [
    [106.927, 27.7],
    [106.84, 28.13],
    [106.0, 28.59],
    [105.78, 28.02],
    [105.05, 27.85],
    [105.5, 27.65],
    [106.1, 28.3],
    [106.82, 28.13],
    [106.9, 27.7],
    [106.1, 28.3],
    [105.99, 28.59]
  ],
  [
    [105.99, 28.59],
    [106.2, 27.9],
    [106.5, 27.15],
    [106.7, 26.6],
    [105.9, 26.5],
    [105.3, 26.2],
    [104.28, 26.85],
    [103.7, 25.5],
    [102.5, 25.2],
    [102.37, 26.28]
  ],
  [
    [102.37, 26.28],
    [102.25, 26.66],
    [102.25, 27.4],
    [102.2, 28.3],
    [102.5, 28.9],
    [102.234, 29.914]
  ],
  [
    [102.234, 29.914],
    [102.4, 30.3],
    [102.72, 30.86]
  ],
  [
    [102.72, 30.86],
    [102.36, 30.995]
  ],
  [
    [102.36, 30.995],
    [102.48, 31.9],
    [103.0, 32.65],
    [102.96, 33.0]
  ],
  [
    [102.96, 33.0],
    [103.1, 33.6],
    [103.89, 34.13]
  ],
  [
    [103.89, 34.13],
    [104.22, 34.18]
  ],
  [
    [104.22, 34.18],
    [104.8, 34.9],
    [105.32, 35.4],
    [106.0, 35.8],
    [107.0, 36.2],
    [108.176, 36.927]
  ]
]
export type MarchActivityKind = 'reading' | 'reflection' | 'action' | 'journal'
export interface MarchActivity {
  id: string
  kind: MarchActivityKind
  createdAt: string
}
export interface MarchProgress {
  earned: number
  todayEarned: number
  unlockAt: Record<string, string>
  unlocked: string[]
  spent: number
  balance: number
  counts: Record<MarchActivityKind, number>
  plants: Record<string, number>
  completed: boolean
  collected: string[]
}
