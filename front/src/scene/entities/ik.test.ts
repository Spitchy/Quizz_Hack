import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { solveTwoBone } from './ik'

const solve = (target: Vector3, pole = new Vector3(0, 0, 1), a = 0.3, b = 0.3) => {
  const root = new Vector3(0, 0, 0)
  const elbow = new Vector3()
  const hand = new Vector3()
  solveTwoBone(root, target, a, b, pole, elbow, hand)
  return { root, elbow, hand }
}

describe('cinématique inverse à deux os', () => {
  it('garde la longueur des os', () => {
    for (const target of [new Vector3(0.2, -0.3, 0.1), new Vector3(0, -0.1, 0), new Vector3(1, 1, 1)]) {
      const { root, elbow, hand } = solve(target)
      expect(elbow.distanceTo(root)).toBeCloseTo(0.3, 4)
      expect(hand.distanceTo(elbow)).toBeCloseTo(0.3, 4)
    }
  })

  it('atteint une cible à portée', () => {
    const target = new Vector3(0.2, -0.35, 0.1)
    expect(solve(target).hand.distanceTo(target)).toBeLessThan(1e-4)
  })

  it('trop loin : bras tendu vers la cible', () => {
    const { hand } = solve(new Vector3(0, -2, 0))
    expect(hand.y).toBeCloseTo(-0.6, 3)
    expect(hand.x).toBeCloseTo(0, 5)
  })

  it('le coude plie du côté du pôle', () => {
    expect(solve(new Vector3(0, -0.4, 0), new Vector3(0, 0, 1)).elbow.z).toBeGreaterThan(0.1)
    expect(solve(new Vector3(0, -0.4, 0), new Vector3(0, 0, -1)).elbow.z).toBeLessThan(-0.1)
  })

  it('pôle aligné sur l’axe : solution quand même, sans NaN', () => {
    const { elbow } = solve(new Vector3(0, 0, 0.4), new Vector3(0, 0, 2))
    expect(Number.isFinite(elbow.x + elbow.y + elbow.z)).toBe(true)
  })
})
