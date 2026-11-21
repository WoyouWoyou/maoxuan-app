import { useMapViewport } from './useMapViewport'
import { useState } from 'react'
import {
  ArrowCounterClockwise,
  Minus,
  Plus,
  Tree,
  TreeEvergreen,
  Plant,
  Compass
} from '@phosphor-icons/react'
import { MARCH_LEGS, MARCH_NODES, type MarchProgress } from '@shared/long-march'
import { satelliteImage, terrainImage } from './assets'

// Geographic raster: WGS84 extent [98, 23, 117, 38], north up.
const project = (lon: number, lat: number) => [((lon - 98) / 19) * 1400, ((38 - lat) / 15) * 1105]
const provinces = [
  ['四川', 100.4, 32.2],
  ['云南', 100.5, 25],
  ['贵州', 107.6, 26.4],
  ['广西', 109, 24],
  ['江西', 115.2, 28],
  ['陕西', 109, 35.6],
  ['甘肃', 103.3, 36.1],
  ['湖南', 112.5, 28]
] as const
const labelOffset: Record<string, [number, number]> = {
  yudu: [-74, -12],
  maogong: [-70, -24],
  jiajin: [18, -12],
  lazikou: [-82, -24],
  hadapu: [24, -10],
  chishui: [-72, -25],
  zunyi: [16, 22]
}
export function NodePlantIcon({ nodeId, size = 20 }: { nodeId: string; size?: number }) {
  if (['jinshajiang', 'luding', 'jiajin', 'maogong', 'lazikou'].includes(nodeId))
    return <TreeEvergreen size={size} weight="duotone" />
  if (['chishui', 'ruoergai'].includes(nodeId)) return <Plant size={size} weight="duotone" />
  return <Tree size={size} weight="duotone" />
}
export function RouteMap({
  progress,
  selected,
  onSelect
}: {
  progress: MarchProgress
  selected: string
  onSelect(id: string): void
}) {
  const { zoom, pan, surface, drag, moveTo, moveBy, adjustZoom, reset } = useMapViewport()
  const [satellite, setSatellite] = useState(true)
  return (
    <section
      className={`march-map ${satellite ? 'is-satellite' : ''}`}
      aria-label="中央红军长征路线地图"
    >
      <div
        ref={surface}
        className={`march-map-surface${zoom > 1 ? ' is-zoomed' : ''}`}
        tabIndex={0}
        role="group"
        aria-label="可拖动地图，方向键平移，加减键缩放，0 复位"
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') return
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [35, 0],
            ArrowRight: [-35, 0],
            ArrowUp: [0, 35],
            ArrowDown: [0, -35]
          }
          if (moves[e.key]) {
            e.preventDefault()
            moveBy(...moves[e.key])
          }
          if (e.key === '+' || e.key === '=') adjustZoom(0.25)
          if (e.key === '-') adjustZoom(-0.25)
          if (e.key === '0') reset()
        }}
        onPointerDown={(e) => {
          if (
            zoom <= 1 ||
            e.button !== 0 ||
            !e.isPrimary ||
            (e.target as HTMLElement).closest('button')
          )
            return
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current)
            moveTo({
              x: drag.current.px + e.clientX - drag.current.x,
              y: drag.current.py + e.clientY - drag.current.y
            })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onLostPointerCapture={() => {
          drag.current = null
        }}
      >
        <div
          className="march-map-scene"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img
            src={satellite ? satelliteImage : terrainImage}
            alt="中国西南至陕北的真实地形影像底图"
            draggable={false}
          />
          <svg viewBox="0 0 1400 1105" className="march-map-routes" aria-hidden="true">
            {provinces.map(([name, lon, lat]) => {
              const [x, y] = project(lon, lat)
              return (
                <text key={name} x={x} y={y} className="march-province">
                  {name}
                </text>
              )
            })}
            {MARCH_LEGS.map((leg, i) => {
              const points = leg.map(([lon, lat]) => project(lon, lat).join(',')).join(' ')
              const done = progress.unlocked.includes(MARCH_NODES[i].id)
              return (
                <g key={i}>
                  <polyline points={points} className="march-route-underlay" />
                  <polyline
                    points={points}
                    className={`march-route ${done ? 'is-complete' : ''}`}
                  />
                </g>
              )
            })}
          </svg>
          {MARCH_NODES.map((n, i) => {
            const [x, y] = project(n.longitude, n.latitude)
            const count = progress.plants[n.id] ?? 0
            const reachable = i === 0 || progress.unlocked.includes(MARCH_NODES[i - 1].id)
            const offset = labelOffset[n.id] ?? [16, -16]
            return (
              <button
                key={n.id}
                className={`march-pin ${selected === n.id ? 'is-selected' : ''} ${progress.unlocked.includes(n.id) ? 'is-grown' : ''} ${reachable ? '' : 'is-future'}`}
                style={{ left: `${x / 14}%`, top: `${y / 11.05}%` }}
                onClick={() => onSelect(n.id)}
                aria-pressed={selected === n.id}
                aria-label={`${n.name}，${count}/${n.target}，${reachable ? '已抵达' : '待前行'}`}
              >
                <span className="march-pin-dot" />
                {count > 0 && (
                  <span className="march-map-trees">
                    <NodePlantIcon nodeId={n.id} size={24} />
                    <small>{count}</small>
                  </span>
                )}
                <span className="march-pin-label" style={{ left: offset[0], top: offset[1] }}>
                  {n.name}
                  <small>{n.date}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="march-map-top">
        <button onClick={() => setSatellite((v) => !v)}>
          {satellite ? '卫星地形' : '地势晕渲'} · 切换
        </button>
        <span>
          <Compass size={16} /> 北
        </span>
      </div>
      <div className="march-map-controls">
        <button aria-label="放大地图" disabled={zoom >= 3} onClick={() => adjustZoom(0.25)}>
          <Plus />
        </button>
        <button aria-label="缩小地图" disabled={zoom <= 1} onClick={() => adjustZoom(-0.25)}>
          <Minus />
        </button>
        <button aria-label="复位地图" onClick={reset}>
          <ArrowCounterClockwise />
        </button>
      </div>
      <div className="march-map-legend">
        <span>━ 已走过</span>
        <span>┄ 待前行</span>
      </div>
      <div className="march-map-credit">
        影像 © Esri, Maxar, Earthstar Geographics · 路线为历史走廊示意，非导航轨迹
      </div>
    </section>
  )
}
