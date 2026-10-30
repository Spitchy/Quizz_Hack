import { describe, expect, it } from 'vitest'
import { angerTarget, attackEnvelope, damp, smoothNoise, twitch } from './anim'

/** Plus grand saut entre deux échantillons rapprochés (continuité). */
function maxJump(f: (t: number) => number, from: number, to: number, step = 1 / 240): number {
  let jump = 0
  for (let t = from; t < to; t += step) jump = Math.max(jump, Math.abs(f(t + step) - f(t)))
  return jump
}

describe('animation des monstres : tout est continu', () => {
  it('bruit lissé et tics : bornés, sans saut d’une image à l’autre', () => {
    for (const f of [(t: number) => smoothNoise(t * 6, 2), (t: number) => twitch(t * 7, 1)]) {
      // Continu : le saut entre deux échantillons diminue avec leur écart.
      expect(maxJump(f, 0, 4, 1 / 4000)).toBeLessThan(0.02)
      for (let t = 0; t < 4; t += 0.05) expect(Math.abs(f(t))).toBeLessThanOrEqual(0.5)
    }
  })

  it('enveloppe de coup : continue, −1 armé, +1 à l’impact, repos ensuite', () => {
    const hits = [1, 2.5]
    expect(attackEnvelope(hits, 0)).toBe(0)
    expect(attackEnvelope(hits, 0.91)).toBeCloseTo(-1, 1)
    expect(attackEnvelope(hits, 1.05)).toBe(1)
    expect(attackEnvelope(hits, 1.9)).toBe(0)
    expect(maxJump((t) => attackEnvelope(hits, t), 0, 3)).toBeLessThan(0.2)
  })

  it('ressort : rejoint sa cible sans la dépasser, quelle que soit la cadence', () => {
    for (const dt of [1 / 30, 1 / 144]) {
      const spring = { value: 0, velocity: 0 }
      let max = 0
      for (let t = 0; t < 2; t += dt) max = Math.max(max, damp(spring, 1, 0.25, dt))
      expect(spring.value).toBeCloseTo(1, 2)
      expect(max).toBeLessThan(1.01)
    }
  })

  it('colère visée : réaction puis résiduelle, menace', () => {
    expect(angerTarget('calm', null)).toBe(0)
    expect(angerTarget('angry', 0.5)).toBe(1)
    expect(angerTarget('angry', 5)).toBe(0.3)
    expect(angerTarget('menace', null)).toBe(0.7)
  })
})
