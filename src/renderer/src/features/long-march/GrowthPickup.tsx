import { useEffect, useRef, useState } from 'react'
import './growth-pickup.css'

type Point = { x: number; y: number }

/** Observe committed rewards, so failed writes and repeated edits never create pickups. */
export function GrowthPickup() {
  const layer = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    let alive = true
    let earned: number | null = null
    let origin: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    let queue = Promise.resolve()
    const animations = new Set<Animation>()
    const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = element.animate(frames, options)
      animations.add(animation)
      void animation.finished.catch(() => {}).finally(() => animations.delete(animation))
      return animation
    }
    const capture = (event: MouseEvent) => {
      const control = (event.target as Element).closest('button, [role="button"], input[type="submit"]')
      if (!control) return
      const rect = control.getBoundingClientRect()
      origin = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    const pickup = (amount: number, start: Point) => {
      const host = layer.current
      if (!host) return
      setAnnouncement(`获得 ${amount} 成长值，已收入长征行囊`)
      const target = document.querySelector<HTMLElement>('[data-growth-target]')
      const rect = target?.getBoundingClientRect()
      const end = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : start
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const token = document.createElement('div')
      token.className = 'growth-pickup-token'
      token.innerHTML = '<span class="growth-pickup-bag"><span>✦</span></span>'
      const label = document.createElement('span')
      label.className = 'growth-pickup-label'
      label.textContent = `+${amount} 成长值`
      token.append(label)
      host.append(token)
      const x = Math.max(80, Math.min(window.innerWidth - 80, start.x))
      const y = Math.max(65, Math.min(window.innerHeight - 80, start.y))
      const at = (px: number, py: number, scale = 1, rotate = 0) =>
        `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`
      const flight = animate(token, reduced ? [
        { transform: at(x, y - 30), opacity: 0 },
        { transform: at(x, y - 30), opacity: 1, offset: 0.2 },
        { transform: at(x, y - 30), opacity: 0 }
      ] : [
        { transform: at(x, y, 0.3, -15), opacity: 0 },
        { transform: at(x, y - 62, 1.1, 8), opacity: 1, offset: 0.17 },
        { transform: at(x, y - 30), opacity: 1, offset: 0.34 },
        { transform: at(x, y - 36), opacity: 1, offset: 0.48 },
        { transform: at((x + end.x) / 2, Math.max(28, Math.min(y, end.y) - 100), 0.8, -12), opacity: 1, offset: 0.73 },
        { transform: at(end.x, end.y, 0.12), opacity: 0 }
      ], { duration: reduced ? 1000 : 1400, easing: 'ease-in-out', fill: 'forwards' })
      void flight.finished.then(() => {
        if (alive && target?.isConnected) animate(target, [
          { boxShadow: '0 0 0 0 rgba(116,158,83,0)', filter: 'brightness(1)' },
          { boxShadow: '0 0 0 7px rgba(116,158,83,.22)', filter: 'brightness(1.25)' },
          { boxShadow: '0 0 0 12px rgba(116,158,83,0)', filter: 'brightness(1)' }
        ], { duration: reduced ? 200 : 550 })
      }).catch(() => {}).finally(() => token.remove())
    }
    const refresh = () => {
      const start = { ...origin }
      queue = queue.then(async () => {
        try {
          const next = await window.api.march.get()
          if (!alive) return
          if (earned !== null && next.earned > earned) pickup(next.earned - earned, start)
          earned = next.earned
        } catch { /* Reward feedback must not interrupt the source action. */ }
      })
    }
    refresh()
    document.addEventListener('click', capture, true)
    window.addEventListener('sessions-changed', refresh)
    return () => {
      alive = false
      document.removeEventListener('click', capture, true)
      window.removeEventListener('sessions-changed', refresh)
      animations.forEach((animation) => animation.cancel())
      layer.current?.replaceChildren()
    }
  }, [])
  return <>
    <div ref={layer} className="growth-pickup-layer" aria-hidden="true" />
    <span className="growth-pickup-announcement" role="status" aria-live="polite">{announcement}</span>
  </>
}
