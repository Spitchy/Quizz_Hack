import { describe, expect, it } from 'vitest'
import { ARCHETYPES, entityLook, SIGN_HEIGHT } from './archetypes'

const looks = (seed: number) => Array.from({ length: 10 }, (_, id) => entityLook(seed, id))

describe('entityLook', () => {
  it('déterministe : même partie, même entité → même monstre', () => {
    expect(entityLook(42, 3)).toEqual(entityLook(42, 3))
  })

  it.each([1, 2, 3, 99, 123456])('partie %i : les six monstres présents, jamais deux identiques de suite', (seed) => {
    const all = looks(seed)
    expect(new Set(all.map((l) => l.archetype))).toEqual(new Set(ARCHETYPES))
    for (let i = 1; i < all.length; i++) expect(all[i].archetype).not.toBe(all[i - 1].archetype)
  })

  it('le rouge reste réservé à la colère', () => {
    for (const seed of [1, 2, 3]) {
      for (const l of looks(seed)) {
        for (const color of Object.values(l.palette)) expect(color.toLowerCase()).not.toBe('#ff2d2d')
      }
    }
  })

  it('panneaux à hauteur lisible depuis les yeux du joueur (1,6 m)', () => {
    for (const h of Object.values(SIGN_HEIGHT)) {
      expect(h).toBeGreaterThan(1.2)
      expect(h).toBeLessThan(1.9)
    }
  })
})
