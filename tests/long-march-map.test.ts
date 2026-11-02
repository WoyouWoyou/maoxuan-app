import { describe, expect, it } from 'vitest'
import { boundMapPan } from '../src/renderer/src/features/long-march/useMapViewport'

describe('map viewport coverage', () => {
  it('keeps the image centered at minimum zoom regardless of drag direction', () => {
    expect(boundMapPan({ x: 900, y: -700 }, 1, 800, 600)).toEqual({ x: 0, y: 0 })
  })
  it('allows movement only through the extra image available after center-origin scaling', () => {
    expect(boundMapPan({ x: 900, y: -700 }, 2, 800, 600)).toEqual({ x: 400, y: -300 })
    expect(boundMapPan({ x: -900, y: 700 }, 2, 800, 600)).toEqual({ x: -400, y: 300 })
    expect(boundMapPan({ x: 25, y: -10 }, 2, 800, 600)).toEqual({ x: 25, y: -10 })
  })
  it('reclamps both axes when zooming out or reducing the viewport size', () => {
    expect(boundMapPan({ x: 400, y: -300 }, 1.25, 800, 600)).toEqual({ x: 100, y: -75 })
    expect(boundMapPan({ x: 400, y: -300 }, 2, 400, 300)).toEqual({ x: 200, y: -150 })
  })
})
