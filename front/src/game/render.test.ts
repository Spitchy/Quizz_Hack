import { describe, expect, it } from 'vitest'
import type { EntityState, VisualFeedback } from '../api/client'
import { initialSnapshot } from './reducer'
import { dangerLevel, toEntityState, toHudState, toScreen, toWorldState, upsetEntities } from './render'
import type { GameSnapshot, Phase } from './types'

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    ...initialSnapshot,
    phase: 'exploring',
    sessionId: 's',
    gameStatus: 'IN_PROGRESS',
    totalIntersections: 10,
    scoreMax: 1000,
    maxErrors: 6,
    question: { id: 'q', level: 1, text: 'Q ?', choices: ['a', 'b'] },
    ...overrides,
  }
}

const feedback = (vf: Partial<VisualFeedback>): VisualFeedback => ({
  signBroken: false,
  entityState: 'CALM',
  lightsOff: false,
  ...vf,
})

const ANGRY = feedback({ signBroken: true, entityState: 'ANGRY' })

describe('toEntityState', () => {
  it('entité pas encore abordée : calme, panneau vierge, abordable', () => {
    expect(toEntityState(snapshot(), 4)).toEqual({
      entity: { mood: 'calm', visible: true, smileOnly: false },
      sign: { broken: false, showQuestion: false },
      engaged: false,
      resolved: false,
    })
  })

  it('entité abordée : la question apparaît sur son panneau', () => {
    for (const phase of ['question', 'submitting'] as const) {
      expect(toEntityState(snapshot({ phase, engagedEntity: 4 }), 4)).toMatchObject({
        entity: { mood: 'calm' },
        sign: { broken: false, showQuestion: true },
        engaged: true,
      })
    }
  })

  it.each<[EntityState, object]>([
    ['CALM', { mood: 'calm', visible: true, smileOnly: false }],
    ['ANGRY', { mood: 'angry', visible: true, smileOnly: false }],
    ['SMILING_IN_DARK', { mood: 'smiling', visible: true, smileOnly: true }],
    ['VANISHED', { mood: 'gone', visible: false, smileOnly: false }],
  ])('réaction %s → %o (sur l’entité abordée seulement)', (entityState, expected) => {
    const state = snapshot({ phase: 'feedback', engagedEntity: 2, visualFeedback: feedback({ entityState }) })
    expect(toEntityState(state, 2).entity).toEqual(expected)
    expect(toEntityState(state, 5).entity.mood).toBe('calm')
  })

  it('mauvaise réponse : panneau brisé, question masquée', () => {
    expect(toEntityState(snapshot({ phase: 'feedback', engagedEntity: 2, visualFeedback: ANGRY }), 2).sign).toEqual({
      broken: true,
      showQuestion: false,
    })
  })

  it('bonne réponse : la question reste lisible pendant la réaction', () => {
    expect(toEntityState(snapshot({ phase: 'feedback', engagedEntity: 2 }), 2).sign).toEqual({
      broken: false,
      showQuestion: true,
    })
  })

  it('entité franchie (bonne réponse) : elle disparaît', () => {
    const state = snapshot({ encounters: [{ entity: 1, isCorrect: true, visualFeedback: feedback({}) }] })
    expect(toEntityState(state, 1)).toMatchObject({ entity: { visible: false }, resolved: true })
  })

  it('entité trompée : garde sa colère et son panneau brisé', () => {
    const state = snapshot({ encounters: [{ entity: 1, isCorrect: false, visualFeedback: ANGRY }] })
    expect(toEntityState(state, 1)).toEqual({
      entity: { mood: 'angry', visible: true, smileOnly: false },
      sign: { broken: true, showQuestion: false },
      engaged: false,
      resolved: true,
    })
  })

  it('partie reprise (réaction inconnue) : l’entité n’est plus là', () => {
    const state = snapshot({ encounters: [{ entity: 0, isCorrect: false, visualFeedback: null }] })
    expect(toEntityState(state, 0)).toMatchObject({ entity: { visible: false }, resolved: true })
  })

  it('défaite : seul le sourire de l’entité abordée reste', () => {
    const state = snapshot({
      phase: 'gameOver',
      engagedEntity: 6,
      visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
    })
    expect(toEntityState(state, 6).entity).toEqual({ mood: 'smiling', visible: true, smileOnly: true })
  })

  it('défaite : toutes les entités fâchées reviennent sourire dans le noir', () => {
    const state = snapshot({
      phase: 'gameOver',
      engagedEntity: 6,
      visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
      encounters: [
        { entity: 1, isCorrect: false, visualFeedback: ANGRY },
        { entity: 2, isCorrect: true, visualFeedback: feedback({}) },
        { entity: 3, isCorrect: false, visualFeedback: null },
      ],
    })
    expect(toEntityState(state, 1).entity).toEqual({ mood: 'smiling', visible: true, smileOnly: true })
    expect(toEntityState(state, 3).entity.mood).toBe('smiling')
    expect(toEntityState(state, 2).entity.visible).toBe(false)
    expect(upsetEntities(state)).toEqual([1, 3, 6])
    expect(upsetEntities({ ...state, phase: 'exploring' })).toEqual([])
  })

  it('renvoie des objets neufs à chaque appel', () => {
    const a = toEntityState(snapshot(), 0)
    a.entity.mood = 'gone'
    expect(toEntityState(snapshot(), 0).entity.mood).toBe('calm')
  })
})

describe('toWorldState', () => {
  it('secousse seulement pendant la réaction à une mauvaise réponse', () => {
    expect(toWorldState(snapshot({ phase: 'feedback', engagedEntity: 2, visualFeedback: ANGRY })).shake).toBe(1)
    expect(toWorldState(snapshot({ phase: 'feedback', engagedEntity: 2 })).shake).toBe(0)
    expect(toWorldState(snapshot({ visualFeedback: ANGRY })).shake).toBe(0)
  })

  it('lightsOff vient toujours du serveur', () => {
    expect(toWorldState(snapshot({ visualFeedback: feedback({ lightsOff: true }) })).lightsOff).toBe(true)
    expect(toWorldState(snapshot({ phase: 'gameOver', visualFeedback: feedback({ entityState: 'SMILING_IN_DARK' }) })).lightsOff).toBe(false)
  })
})

describe('dangerLevel / toHudState', () => {
  it.each([
    [0, 6, 0],
    [3, 6, 0.5],
    [6, 6, 1],
    [9, 6, 1],
    [2, 0, 0],
  ])('%i erreurs / %i → %f', (errors, maxErrors, expected) => {
    expect(dangerLevel(snapshot({ errors, maxErrors }))).toBe(expected)
  })

  it('HUD : valeurs du serveur, infection en %, entités trouvées', () => {
    expect(toHudState(snapshot({ score: 140, errors: 1, intersectionIndex: 2, currentLevel: 2 }))).toEqual({
      visible: true,
      score: 140,
      scoreMax: 1000,
      errors: 1,
      maxErrors: 6,
      infectionPercent: 17,
      found: 2,
      totalIntersections: 10,
      level: 2,
    })
  })

  it.each<[Phase, boolean]>([
    ['idle', false],
    ['starting', false],
    ['exploring', true],
    ['question', true],
    ['submitting', true],
    ['feedback', true],
    ['victory', false],
    ['gameOver', false],
    ['error', false],
  ])('HUD visible en %s : %s', (phase, visible) => {
    expect(toHudState(snapshot({ phase })).visible).toBe(visible)
  })
})

describe('toScreen', () => {
  it.each<[Phase, string]>([
    ['idle', 'title'],
    ['starting', 'loading'],
    ['exploring', 'explore'],
    ['question', 'question'],
    ['submitting', 'question'],
    ['feedback', 'question'],
    ['victory', 'victory'],
    ['gameOver', 'defeat'],
    ['error', 'error'],
  ])('%s → %s', (phase, screen) => {
    expect(toScreen(snapshot({ phase }))).toBe(screen)
  })
})
