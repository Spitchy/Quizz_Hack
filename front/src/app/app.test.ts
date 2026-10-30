import { describe, expect, it } from 'vitest'
import { createMockApi, MOCK_QUESTIONS } from '../api/mock'
import { createGameController } from '../game/controller'
import { directionFromTurn, readMazeLayout, readShowAnswers } from './config'
import { corrupt, infectionBar, pad } from './hudText'
import {
  BEAT_SECONDS,
  arrivalAt,
  beatSchedule,
  CCTV_STAGES,
  collapseAt,
  DEFEAT_TIMELINE,
  DOOR_TIMELINE,
  stageAt,
  VICTORY_TIMELINE,
} from './sequence'
import {
  clearSessionId,
  enterGame,
  introSeen,
  loadSessionId,
  markIntroSeen,
  readLaunch,
  saveSessionId,
  wantsIntro,
  type KeyValueStore,
} from './session'

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('denied')
  },
  removeItem: () => {
    throw new Error('denied')
  },
}

describe('readLaunch', () => {
  it('lit le jeton et le retire de l’URL', () => {
    expect(readLaunch('http://game.test/?fsq_token=abc&lang=fr#x', null)).toEqual({
      token: 'abc',
      cleanUrl: 'http://game.test/?lang=fr#x',
    })
  })

  it('sans jeton : jeton de repli, URL inchangée', () => {
    expect(readLaunch('http://game.test/', 'dev')).toEqual({ token: 'dev', cleanUrl: null })
    expect(readLaunch('http://game.test/', null)).toEqual({ token: null, cleanUrl: null })
  })

  it('jeton vide : repli, mais le paramètre est retiré', () => {
    expect(readLaunch('http://game.test/?fsq_token=', null)).toEqual({ token: null, cleanUrl: 'http://game.test/' })
  })
})

describe('mémorisation de session', () => {
  it('sauve, relit, efface', () => {
    const store = memoryStore()
    expect(loadSessionId(store)).toBeNull()
    saveSessionId(store, 's1')
    expect(loadSessionId(store)).toBe('s1')
    clearSessionId(store)
    expect(loadSessionId(store)).toBeNull()
  })

  it('stockage absent ou refusé : aucune exception', () => {
    for (const store of [null, brokenStore]) {
      expect(() => saveSessionId(store, 's')).not.toThrow()
      expect(loadSessionId(store)).toBeNull()
      expect(() => clearSessionId(store)).not.toThrow()
    }
  })
})

describe('première entrée', () => {
  it('montre l\u2019intro à une vraie première entrée, une seule fois', () => {
    const store = memoryStore()
    expect(wantsIntro(store)).toBe(true)
    markIntroSeen(store)
    expect(introSeen(store)).toBe(true)
    expect(wantsIntro(store)).toBe(false)
  })

  it('ne montre pas l\u2019intro quand il y a une session à reprendre', () => {
    const store = memoryStore()
    saveSessionId(store, 'session')
    expect(wantsIntro(store)).toBe(false)
  })

  it('ne casse rien sans stockage', () => {
    for (const store of [null, brokenStore]) {
      expect(wantsIntro(store)).toBe(true)
      expect(introSeen(store)).toBe(false)
      expect(() => {
        markIntroSeen(store)
      }).not.toThrow()
    }
  })
})

describe('enterGame', () => {
  it('sans session mémorisée : démarre avec le jeton', async () => {
    const game = createGameController(createMockApi())
    await expect(enterGame(game, 'tok', memoryStore())).resolves.toBe('started')
    expect(game.getSnapshot().phase).toBe('exploring')
  })

  it('session mémorisée encore active : reprise au bon endroit', async () => {
    const api = createMockApi()
    const first = createGameController(api)
    await first.start('tok')
    first.engage(3)
    await first.answer(MOCK_QUESTIONS[0].correctAnswer, 'LEFT')
    const store = memoryStore()
    saveSessionId(store, first.getSnapshot().sessionId!)

    const reloaded = createGameController(api)
    await expect(enterGame(reloaded, null, store)).resolves.toBe('resumed')
    expect(reloaded.getSnapshot()).toMatchObject({ phase: 'exploring', intersectionIndex: 1, score: 60 })
  })

  it('session mémorisée disparue : on l’oublie et on redémarre', async () => {
    const store = memoryStore()
    saveSessionId(store, 'perdue')
    const game = createGameController(createMockApi())
    await expect(enterGame(game, 'tok', store)).resolves.toBe('started')
    expect(loadSessionId(store)).toBeNull()
    expect(game.getSnapshot().phase).toBe('exploring')
  })

  it('ni session ni jeton : no-token, aucun appel', async () => {
    const game = createGameController(createMockApi())
    await expect(enterGame(game, null, memoryStore())).resolves.toBe('no-token')
    expect(game.getSnapshot().phase).toBe('idle')
  })
})

describe('séquences de fin', () => {
  it('défaite : figé, approche, passage à tabac, K.-O., réveil, injection, infection, GAME OVER', () => {
    const order = ['freeze', 'approach', 'beat', 'knockout', 'wake', 'inject', 'infected', 'over']
    expect(DEFEAT_TIMELINE.map(([s]) => s)).toEqual(order)
    expect(stageAt(DEFEAT_TIMELINE, 0)).toBe('freeze')
    expect(stageAt(DEFEAT_TIMELINE, 8000)).toBe('beat')
    expect(stageAt(DEFEAT_TIMELINE, 99999)).toBe('over')
  })

  it('défaite : l’arrivée et les coups sont filmés par la caméra de surveillance', () => {
    expect(CCTV_STAGES).toEqual(['approach', 'beat'])
    // Le figement (lumières qui meurent) reste bref, à la première personne.
    const approach = DEFEAT_TIMELINE.find(([s]) => s === 'approach')![1]
    expect(approach).toBeLessThanOrEqual(2000)
  })

  it('victoire : libération, éblouissement, pièce blanche ; puis porte, traversée, écran', () => {
    expect(stageAt(VICTORY_TIMELINE, 100)).toBe('release')
    expect(stageAt(VICTORY_TIMELINE, 3000)).toBe('whiteout')
    expect(stageAt(VICTORY_TIMELINE, 99999)).toBe('room')
    expect(DOOR_TIMELINE.map(([s]) => s)).toEqual(['door', 'through', 'screen'])
  })

  it('étapes dans l’ordre chronologique', () => {
    for (const timeline of [DEFEAT_TIMELINE, VICTORY_TIMELINE, DOOR_TIMELINE]) {
      const times = timeline.map(([, at]) => at)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(times[0]).toBe(0)
    }
  })

  it('passage à tabac : chacune frappe dès son arrivée, et sans attendre', () => {
    expect(beatSchedule(0)).toEqual([])
    for (const attackers of [1, 2, 3, 6, 10]) {
      const hits = beatSchedule(attackers, BEAT_SECONDS)
      // Triés dans le temps : le corps les encaisse dans l'ordre.
      hits.slice(1).forEach((h, i) => expect(h.at).toBeGreaterThanOrEqual(hits[i].at))
      for (let a = 0; a < attackers; a++) {
        const own = hits.filter((h) => h.attacker === a).map((h) => h.at)
        expect(own.length).toBeGreaterThanOrEqual(2)
        // Son premier coup tombe à son arrivée.
        expect(own[0] - arrivalAt(a)).toBeLessThan(0.15)
        // Elle n'attend jamais : pas de pause entre deux coups.
        own.slice(1).forEach((at, i) => expect(at - own[i]).toBeLessThanOrEqual(Math.max(0.72, attackers * 0.24) * 1.15))
      }
      // Ça tape jusqu'au noir.
      expect(BEAT_SECONDS - hits.at(-1)!.at).toBeLessThan(1.6)
      expect(hits.length).toBeLessThanOrEqual(40)
    }
    expect(beatSchedule(1).length).toBeGreaterThanOrEqual(5)
  })

  it('la première arrive au début du passage à tabac, les autres la rejoignent vite', () => {
    expect(arrivalAt(0)).toBe(0)
    expect(arrivalAt(1)).toBeGreaterThan(0)
    expect(arrivalAt(50)).toBeLessThan(BEAT_SECONDS / 2)
  })

  it('effondrement : debout, à genoux, puis à terre au fil des coups', () => {
    expect(collapseAt(0, 8)).toEqual({ kneel: 0, fall: 0 })
    const mid = collapseAt(4, 8)
    expect(mid.kneel).toBeGreaterThan(0.5)
    expect(mid.fall).toBe(0)
    expect(collapseAt(8, 8)).toEqual({ kneel: 1, fall: 1 })
    expect(collapseAt(3, 0)).toEqual({ kneel: 0, fall: 0 })
  })
})

describe('HUD', () => {
  it.each([
    [0, '░░░░░░░░░░'],
    [50, '█████░░░░░'],
    [100, '██████████'],
    [140, '██████████'],
  ])('infectionBar(%i)', (percent, bar) => {
    expect(infectionBar(percent)).toBe(bar)
  })

  it('corrupt : intact à 0, garde la longueur et les espaces', () => {
    expect(corrupt('INFECTION 48%', 0)).toBe('INFECTION 48%')
    const out = corrupt('AB CD', 1, () => 0.1)
    expect(out).toHaveLength(5)
    expect(out[2]).toBe(' ')
    expect(out).not.toContain('A')
  })

  it('pad', () => {
    expect(pad(42, 4)).toBe('0042')
    expect(pad(1000, 4)).toBe('1000')
  })

  it('readMazeLayout : couloir de test via l’env ou l’URL, labyrinthe sinon', () => {
    expect(readMazeLayout(undefined, '')).toBe('maze')
    expect(readMazeLayout('corridor', '')).toBe('corridor')
    expect(readMazeLayout(undefined, '?maze=corridor')).toBe('corridor')
    expect(readMazeLayout('corridor', '?maze=maze')).toBe('maze')
  })

  it('readShowAnswers : seulement en dev, avec le mock, sur demande', () => {
    expect(readShowAnswers(true, true, 'true', '')).toBe(true)
    expect(readShowAnswers(true, true, undefined, '?answers')).toBe(true)
    expect(readShowAnswers(true, true, undefined, '')).toBe(false)
    expect(readShowAnswers(false, true, 'true', '?answers')).toBe(false) // jamais en production
    expect(readShowAnswers(true, false, 'true', '?answers')).toBe(false) // le vrai back ne donne pas les réponses
  })

  it('directionFromTurn : sens net du virage, par le plus court', () => {
    expect(directionFromTurn(0, 1)).toBe('LEFT')
    expect(directionFromTurn(0, -1)).toBe('RIGHT')
    expect(directionFromTurn(3, -3)).toBe('LEFT') // passe par ±π
    expect(directionFromTurn(1, 1)).toBe('LEFT')
  })
})
