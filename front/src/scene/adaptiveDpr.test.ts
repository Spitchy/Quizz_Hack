import { describe, expect, it } from 'vitest'
import { adaptDpr, DPR_MIN, initialDpr, maxDpr, median } from './adaptiveDpr'

const run = (frames: number[], max = 1.5) => frames.reduce((s, ms) => adaptDpr(s, ms, max), initialDpr(max))

describe('résolution adaptative', () => {
  it('plafond : l’écran, entre 1 et 1,5', () => {
    expect(maxDpr(1)).toBe(1)
    expect(maxDpr(2)).toBe(1.5)
    expect(maxDpr(0.5)).toBe(1)
    expect(maxDpr(1.25)).toBe(1.25)
  })

  it('baisse d’un palier quand les images tardent, jamais sous le minimum', () => {
    expect(run([30]).dpr).toBe(1.25)
    expect(run([30, 30, 30, 30, 30, 30, 30]).dpr).toBe(DPR_MIN)
  })

  it('reste en place à 60 i/s au plafond', () => {
    expect(run(Array(20).fill(16.7)).dpr).toBe(1.5)
  })

  it('remonte après plusieurs fenêtres rapides, pas avant la fin de l’attente', () => {
    const down = run([30])
    const after = (n: number) => Array.from({ length: n }).reduce<typeof down>((s) => adaptDpr(s, 10, 1.5), down)
    expect(after(2).dpr).toBe(1.25)
    expect(after(3).dpr).toBe(1.5)
  })

  it('une remontée ratée allonge l’attente suivante', () => {
    const first = run([30, 10, 10, 10, 30])
    expect(first.dpr).toBe(1.25)
    expect(first.holdOff).toBeGreaterThan(2)
    expect(run([30, 10, 10, 10, 30, 10, 10, 10]).dpr).toBe(1.25)
  })

  it('médiane : un à-coup isolé ne compte pas', () => {
    expect(median([7, 7, 7, 200, 7])).toBe(7)
    expect(median([1, 3])).toBe(2)
    expect(median([])).toBe(0)
  })
})
