import { describe, expect, it } from 'vitest'
import { TIMING } from '../../app/config'
import { ARCHETYPES, WALL_CLEARANCE } from './archetypes'
import { attackEnvelope } from './anim'
import { BREAK_RELEASE, breakFor, restGesture, writeGesture, type SignBreak } from './signBreak'

const STYLES: SignBreak[] = ['snap', 'throw', 'crumple', 'tear', 'smash', 'devour']

describe('destruction du panneau', () => {
  it('varie d\'un monstre à l\'autre, et selon l\'entité', () => {
    const all = new Set<SignBreak>()
    for (const archetype of ARCHETYPES) {
      const seen = new Set<SignBreak>()
      for (let phase = 0; phase < Math.PI * 2; phase += 0.1) seen.add(breakFor({ archetype, phase }))
      expect(seen.size, archetype).toBeGreaterThanOrEqual(2)
      seen.forEach((s) => all.add(s))
    }
    expect(all.size).toBeGreaterThanOrEqual(5)
  })

  it('reste le même pour une même entité', () => {
    expect(breakFor({ archetype: 'crt', phase: 2.3 })).toBe(breakFor({ archetype: 'crt', phase: 2.3 }))
  })

  it.each(STYLES)('garde le panneau tranquille avant le geste (%s)', (style) => {
    const g = restGesture()
    writeGesture(g, style, null)
    expect(g).toEqual(restGesture())
  })

  it.each(STYLES)('ne saute jamais d\'une image à l\'autre (%s)', (style) => {
    const a = restGesture()
    const b = restGesture()
    for (let t = 0; t < 2; t += 1 / 60) {
      writeGesture(a, style, t)
      writeGesture(b, style, t + 1 / 60)
      expect(Math.abs(a.signLift - b.signLift)).toBeLessThan(0.25)
      expect(Math.abs(a.free - b.free)).toBeLessThan(0.12)
      expect(Math.abs(a.squeeze - b.squeeze)).toBeLessThan(0.12)
    }
  })

  it.each(STYLES)('finit pendant la réaction du monstre (%s)', (style) => {
    const release = BREAK_RELEASE[style]
    if (release !== null) expect(release).toBeLessThan(TIMING.feedbackWrongMs / 1000)
    const g = restGesture()
    writeGesture(g, style, TIMING.feedbackWrongMs / 1000)
    // Le panneau parti, les mains sont libres ; cassé en deux, elles le gardent.
    expect(g.free).toBe(style === 'snap' ? 0 : 1)
  })

  it('ne le lève jamais assez haut pour traverser le plafond (2,70 m)', () => {
    const g = restGesture()
    for (const style of STYLES) {
      for (let t = 0; t < 2; t += 0.02) {
        writeGesture(g, style, t)
        expect(1.42 + g.signLift + 0.55).toBeLessThan(2.7)
      }
    }
  })
})

describe('murs', () => {
  it('écarte du mur ceux qui en ont besoin, sans sortir de la tuile (2,60 m)', () => {
    for (const archetype of ARCHETYPES) {
      expect(WALL_CLEARANCE[archetype]).toBeGreaterThanOrEqual(0.45)
      expect(WALL_CLEARANCE[archetype]).toBeLessThan(1.3)
    }
    expect(WALL_CLEARANCE.crawler).toBeGreaterThan(WALL_CLEARANCE.tall)
  })
})

describe('coups qui s\'enchaînent', () => {
  const maxJump = (hits: number[]) => {
    let jump = 0
    for (let t = 0; t < 6; t += 1 / 120) jump = Math.max(jump, Math.abs(attackEnvelope(hits, t + 1 / 120) - attackEnvelope(hits, t)))
    return jump
  }

  it('passe d\'un coup à l\'autre sans à-coup ni pause', () => {
    const hits = [0.1, 0.85, 1.6, 2.3, 3.1, 3.8]
    expect(maxJump(hits)).toBeLessThan(0.3)
    // Entre deux coups rapprochés, il est en train de se réarmer, jamais au repos.
    for (let t = 1.05; t < 1.4; t += 0.01) expect(Math.abs(attackEnvelope(hits, t))).toBeLessThanOrEqual(1)
    expect(attackEnvelope(hits, 0.74)).toBeLessThan(-0.5)
  })

  it('frappe à l\'instant du coup', () => {
    expect(attackEnvelope([1, 2], 1)).toBe(1)
    expect(attackEnvelope([1, 2], 1.05)).toBe(1)
  })
})
