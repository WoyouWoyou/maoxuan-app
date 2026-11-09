import { useEffect, useRef, useState } from 'react'

interface Pan {
  x: number
  y: number
}
const initial = { zoom: 1, pan: { x: 0, y: 0 } }

/** Center-origin scaling leaves half the extra image on each side of the viewport. */
export function boundMapPan(pan: Pan, zoom: number, width: number, height: number): Pan {
  const limitX = Math.max(0, (width * (zoom - 1)) / 2)
  const limitY = Math.max(0, (height * (zoom - 1)) / 2)
  return {
    x: Math.max(-limitX, Math.min(limitX, pan.x)) || 0,
    y: Math.max(-limitY, Math.min(limitY, pan.y)) || 0
  }
}

export function useMapViewport() {
  const surface = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(initial)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const constrain = (pan: Pan, zoom: number) =>
    boundMapPan(pan, zoom, surface.current?.clientWidth ?? 0, surface.current?.clientHeight ?? 0)
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      drag.current = null
      setViewport((v) => ({
        ...v,
        pan: boundMapPan(v.pan, v.zoom, element.clientWidth, element.clientHeight)
      }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const moveTo = (pan: Pan) => setViewport((v) => ({ ...v, pan: constrain(pan, v.zoom) }))
  const moveBy = (x: number, y: number) =>
    setViewport((v) => ({ ...v, pan: constrain({ x: v.pan.x + x, y: v.pan.y + y }, v.zoom) }))
  const adjustZoom = (delta: number) => {
    drag.current = null
    setViewport((v) => {
      const zoom = Math.max(1, Math.min(3, +(v.zoom + delta).toFixed(2)))
      return { zoom, pan: constrain(v.pan, zoom) }
    })
  }
  const reset = () => {
    drag.current = null
    setViewport(initial)
  }
  return { ...viewport, surface, drag, moveTo, moveBy, adjustZoom, reset }
}
