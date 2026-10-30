import { describe, expect, it } from 'vitest'
import { renderQueue, renderSound, RECIPES, SOUND_NAMES } from './recipes'

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length)

describe('sons générés', () => {
  const rendered = renderQueue().map(({ name, variant }) => renderSound(name, variant))

  it('rendent tout le catalogue, dans la plage audio, sans NaN', () => {
    expect(rendered.length).toBeGreaterThanOrEqual(SOUND_NAMES.length)
    for (const { name, samples } of rendered) {
      expect(samples.length, name).toBeGreaterThan(0)
      let peak = 0
      let finite = true
      for (const s of samples) {
        finite &&= Number.isFinite(s)
        peak = Math.max(peak, Math.abs(s))
      }
      expect(finite, name).toBe(true)
      expect(peak, name).toBeLessThanOrEqual(1.0001)
    }
  })

  it('ne sont pas muets (la courbe de coupure est à part : valeurs dans -1..0)', () => {
    for (const { name, samples } of rendered) {
      expect(rms(samples), name).toBeGreaterThan(0.002)
    }
  })

  it('sont déterministes', () => {
    const a = renderSound('hit-flesh', 2).samples
    const b = renderSound('hit-flesh', 2).samples
    expect(Array.from(a.subarray(0, 500))).toEqual(Array.from(b.subarray(0, 500)))
  })

  it('offrent des variantes réellement différentes', () => {
    const a = renderSound('step-carpet', 0).samples
    const b = renderSound('step-carpet', 1).samples
    expect(Array.from(a.subarray(0, 200))).not.toEqual(Array.from(b.subarray(0, 200)))
  })

  it('bouclent sans raccord audible pour les nappes', () => {
    for (const name of ['room-tone', 'neon-buzz', 'tape-hiss', 'wind', 'grass', 'bed-crt', 'bed-tall'] as const) {
      const { samples } = renderSound(name, 0)
      const jump = Math.abs(samples[0] - samples[samples.length - 1])
      expect(jump, name).toBeLessThan(0.45)
    }
  })

  it('tiennent en mémoire', () => {
    const bytes = rendered.reduce((sum, { samples }) => sum + samples.byteLength, 0)
    expect(bytes).toBeLessThan(32 * 1024 * 1024)
    expect(Object.keys(RECIPES).length).toBe(SOUND_NAMES.length)
  })
})
