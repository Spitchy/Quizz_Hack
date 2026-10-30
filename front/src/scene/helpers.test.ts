import { describe, expect, it } from 'vitest'
import { neonFlicker } from './flicker'
import { baseTremor, decayTrauma, headBob, shakeOffset } from './motion'
import { choiceAt, layoutSign, wrapText, type Measure } from './signLayout'

// Mesure monospace : chaque caractère fait 0,5 × la taille de police.
const mono: Measure = (text, size) => text.length * size * 0.5

describe('mouvements de caméra', () => {
  it('head-bob nul à intensité 0, borné sinon', () => {
    expect(Object.values(headBob(1.23, 0)).every((v) => v === 0)).toBe(true)
    for (let t = 0; t < 2; t += 0.03) {
      const bob = headBob(t, 1)
      expect(bob.y).toBeGreaterThanOrEqual(0)
      expect(bob.y).toBeLessThanOrEqual(0.055)
    }
  })

  it('secousse nulle sans trauma, plus forte avec', () => {
    expect(Object.values(shakeOffset(0, 3)).every((v) => v === 0)).toBe(true)
    const weak = Math.abs(shakeOffset(0.3, 0.5).x)
    const strong = Math.abs(shakeOffset(1, 0.5).x)
    expect(strong).toBeGreaterThan(weak)
  })

  it('le trauma retombe à 0 et le tremblement suit le danger', () => {
    expect(decayTrauma(1, 0.3)).toBeCloseTo(0.49)
    expect(decayTrauma(0.1, 1)).toBe(0)
    expect(baseTremor(0)).toBe(0)
    expect(baseTremor(1)).toBeGreaterThan(baseTremor(0.5))
    expect(baseTremor(4)).toBe(baseTremor(1))
  })
})

describe('neonFlicker', () => {
  const samples = (danger: number) => Array.from({ length: 4000 }, (_, i) => neonFlicker(i * 0.06, danger))

  it('reste entre 0 et 1 et est déterministe', () => {
    expect(samples(0.5).every((v) => v > 0 && v <= 1)).toBe(true)
    expect(neonFlicker(12.34, 0.2, 3)).toBe(neonFlicker(12.34, 0.2, 3))
  })

  it('coupe plus souvent quand le danger monte', () => {
    const dropouts = (danger: number) => samples(danger).filter((v) => v < 0.5).length
    expect(dropouts(0)).toBeGreaterThan(0)
    expect(dropouts(1)).toBeGreaterThan(dropouts(0) * 3)
  })
})

describe('mise en page du panneau', () => {
  it('wrapText coupe aux espaces sans dépasser la largeur', () => {
    const lines = wrapText('un deux trois quatre cinq', 60, 10, mono)
    expect(lines).toEqual(['un deux', 'trois quatre', 'cinq'])
    for (const line of lines) expect(mono(line, 10)).toBeLessThanOrEqual(60)
  })

  it('un mot trop long reste seul sur sa ligne', () => {
    expect(wrapText('anticonstitutionnellement ok', 50, 10, mono)).toEqual(['anticonstitutionnellement', 'ok'])
  })

  const question = {
    id: 'q',
    level: 1,
    text: 'Une créature pétrifiée tient une clé USB rouillée étiquetée CONFIDENTIEL. Que dois-tu faire ?',
    choices: ['La brancher', "L'isoler", 'La formater', 'Demander le mot de passe'],
  }
  const box = { width: 1024, height: 768, padding: 56 }

  it('layoutSign : tout tient dans le panneau, choix numérotés dans l’ordre', () => {
    const layout = layoutSign(question, box, mono)
    const last = layout.choiceBands.at(-1)!
    expect(last.bottom).toBeLessThanOrEqual(box.height - box.padding)
    expect(layout.choiceBands.map((b) => b.choice)).toEqual([0, 1, 2, 3])
    expect(layout.lines.filter((l) => l.kind === 'choice').map((l) => l.text[0])).toEqual(['1', '2', '3', '4'])
  })

  it('layoutSign réduit la police pour un texte long', () => {
    const long = { ...question, text: question.text.repeat(4) }
    expect(layoutSign(long, box, mono).fontSize).toBeLessThan(layoutSign(question, box, mono).fontSize)
  })

  it('choiceAt retrouve le choix sous le curseur', () => {
    const layout = layoutSign(question, box, mono)
    const band = layout.choiceBands[2]
    expect(choiceAt(layout, (band.top + band.bottom) / 2)).toBe(2)
    expect(choiceAt(layout, 0)).toBeNull()
  })
})
