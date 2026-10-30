import { describe, expect, it } from 'vitest'
import { filePages, turnPage, VICTIMS } from './victimFile'

describe('le dossier du médecin', () => {
  it('nomme ses victimes, dans l’ordre, puis des inconnus', () => {
    expect(VICTIMS.map((v) => v.name)).toEqual(['MESSAOUDI ISHAK', 'BOUCLON MATHIAS', 'RÉMI', 'INCONNU', 'INCONNU', 'INCONNU'])
  })

  it('s’ouvre sur la couverture et finit sur une fiche préparée pour le joueur', () => {
    const pages = filePages('Shadowrunner')
    expect(pages[0].kind).toBe('cover')
    expect(pages).toHaveLength(VICTIMS.length + 2)
    expect(pages[pages.length - 1]).toEqual({ kind: 'next', name: 'SHADOWRUNNER' })
  })

  it('tient sans pseudo', () => {
    for (const pseudo of [null, undefined, '', '   ']) {
      expect(filePages(pseudo)[VICTIMS.length + 1]).toEqual({ kind: 'next', name: 'VOUS' })
    }
  })

  it('tourne les pages et s’arrête aux deux bouts', () => {
    expect(turnPage(0, 8, -1)).toBe(0)
    expect(turnPage(0, 8, 1)).toBe(1)
    expect(turnPage(3, 8, -1)).toBe(2)
    expect(turnPage(7, 8, 1)).toBe(7)
  })
})
