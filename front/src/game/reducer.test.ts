import { describe, expect, it } from 'vitest'
import type {
  CurrentQuestionResponse,
  GameStatusResponse,
  StartGameResponse,
  SubmitAnswerResponse,
} from '../api/client'
import { responseExample } from '../test/contract'
import { initialSnapshot, reduce } from './reducer'
import type { GameError, GameEvent, GameSnapshot } from './types'

const startExample = () => responseExample<StartGameResponse>('/api/game/start', 'post', 201)
const inProgressExample = () => responseExample<SubmitAnswerResponse>('/api/game/answer', 'post', 200, 'enCours')
const defeatExample = () => responseExample<SubmitAnswerResponse>('/api/game/answer', 'post', 200, 'defaite')
const statusExample = () => responseExample<GameStatusResponse>('/api/game/status/{sessionId}', 'get', 200)
const questionExample = () => responseExample<CurrentQuestionResponse>('/api/game/question', 'get', 200)

function run(...events: GameEvent[]): GameSnapshot {
  return events.reduce(reduce, initialSnapshot)
}

const ENTITY = 3
const started = () => run({ type: 'START' }, { type: 'STARTED', response: startExample() })
const engaged = (entity = ENTITY) => reduce(started(), { type: 'ENGAGE', entity })
const submitted = (choice = 1) => reduce(engaged(), { type: 'SUBMIT', choice })
const answered = (response: SubmitAnswerResponse, choice = 1) =>
  reduce(submitted(choice), { type: 'ANSWERED', choice, response })

const networkError: GameError = { code: 'NETWORK_ERROR', message: 'down', status: 0, retryable: true }
const notFound: GameError = { code: 'SESSION_NOT_FOUND', message: 'gone', status: 404, retryable: false }

describe('reduce — démarrage', () => {
  it('START : idle → starting', () => {
    expect(run({ type: 'START' }).phase).toBe('starting')
  })

  it('STARTED : recopie l’état initial du serveur, le joueur explore', () => {
    const res = startExample()
    expect(started()).toMatchObject({
      phase: 'exploring',
      sessionId: res.sessionId,
      playerId: res.player.playerId,
      pseudo: res.player.pseudo,
      gameStatus: 'IN_PROGRESS',
      intersectionIndex: 0,
      totalIntersections: 10,
      score: 0,
      scoreMax: 1000,
      errors: 0,
      maxErrors: 6,
      visualFeedback: res.gameState.visualFeedback,
      question: res.currentQuestion,
      engagedEntity: null,
      encounters: [],
      error: null,
    })
  })

  it('START ignoré pendant une partie ; STARTED ignoré hors de starting', () => {
    const state = started()
    expect(reduce(state, { type: 'START' })).toBe(state)
    expect(reduce(state, { type: 'STARTED', response: startExample() })).toBe(state)
  })

  it('START relance une partie après une fin ou une erreur', () => {
    expect(reduce(answered(defeatExample()), { type: 'START' })).toEqual({ ...initialSnapshot, phase: 'starting' })
    const failed = reduce(run({ type: 'START' }), { type: 'FAILED', error: notFound })
    expect(reduce(failed, { type: 'START' }).phase).toBe('starting')
  })
})

describe('reduce — aborder une entité', () => {
  it('ENGAGE : la question courante passe sur le panneau de cette entité', () => {
    expect(engaged()).toMatchObject({ phase: 'question', engagedEntity: ENTITY, question: startExample().currentQuestion })
  })

  it('DISENGAGE : on recule, la question reste en attente', () => {
    const back = reduce(engaged(), { type: 'DISENGAGE' })
    expect(back).toMatchObject({ phase: 'exploring', engagedEntity: null, question: startExample().currentQuestion })
  })

  it('ENGAGE ignoré hors exploration ou sur une entité déjà interrogée', () => {
    const state = engaged()
    expect(reduce(state, { type: 'ENGAGE', entity: 7 })).toBe(state)

    const after = reduce(answered(inProgressExample()), { type: 'CONTINUE' })
    expect(reduce(after, { type: 'ENGAGE', entity: ENTITY })).toBe(after)
    expect(reduce(after, { type: 'ENGAGE', entity: 7 })).toMatchObject({ phase: 'question', engagedEntity: 7 })
  })

  it('DISENGAGE ignoré pendant l’envoi de la réponse', () => {
    const state = submitted()
    expect(reduce(state, { type: 'DISENGAGE' })).toBe(state)
  })
})

describe('reduce — réponse', () => {
  it('SUBMIT : question → submitting pour un choix valide', () => {
    expect(submitted(0).phase).toBe('submitting')
  })

  it.each([-1, 4, 1.5, Number.NaN])('SUBMIT ignoré pour le choix %s', (choice) => {
    const state = engaged()
    expect(reduce(state, { type: 'SUBMIT', choice })).toBe(state)
  })

  it('SUBMIT ignoré en exploration et pendant submitting (double clic)', () => {
    const exploring = started()
    expect(reduce(exploring, { type: 'SUBMIT', choice: 0 })).toBe(exploring)
    const state = submitted()
    expect(reduce(state, { type: 'SUBMIT', choice: 0 })).toBe(state)
  })

  it('ANSWERED en cours : recopie le serveur, garde la question suivante', () => {
    const res = inProgressExample()
    expect(answered(res, 1)).toMatchObject({
      phase: 'feedback',
      gameStatus: 'IN_PROGRESS',
      score: res.score,
      errors: res.errors,
      currentLevel: res.currentLevel,
      visualFeedback: res.visualFeedback,
      engagedEntity: ENTITY,
      question: startExample().currentQuestion,
      pendingQuestion: res.nextQuestion,
      lastAnswer: { choice: 1, isCorrect: true },
    })
  })

  it('ANSWERED défaite : GAME_OVER_HACK → gameOver, état visuel du serveur tel quel', () => {
    expect(answered(defeatExample(), 0)).toMatchObject({
      phase: 'gameOver',
      gameStatus: 'GAME_OVER_HACK',
      errors: 6,
      visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
      engagedEntity: ENTITY,
      pendingQuestion: null,
      hubSyncResult: { accepted: true, xpGained: 12 },
      lastAnswer: { choice: 0, isCorrect: false },
    })
  })

  it('ANSWERED victoire : VICTORY → victory', () => {
    const res: SubmitAnswerResponse = {
      ...inProgressExample(),
      gameStatus: 'VICTORY',
      visualFeedback: { signBroken: false, entityState: 'VANISHED', lightsOff: false },
      nextDirection: null,
      nextQuestion: null,
      hubSyncResult: { accepted: true, xpGained: 100 },
    }
    expect(answered(res)).toMatchObject({ phase: 'victory', gameStatus: 'VICTORY' })
  })

  it('ne recalcule pas les règles : seul gameStatus décide de la fin', () => {
    expect(answered({ ...inProgressExample(), errors: 6 }).phase).toBe('feedback')
    expect(answered({ ...defeatExample(), errors: 2, score: 999 })).toMatchObject({ phase: 'gameOver', errors: 2, score: 999 })
  })

  it('ANSWERED en cours sans question suivante → CONTRACT_VIOLATION', () => {
    expect(answered({ ...inProgressExample(), nextQuestion: null })).toMatchObject({
      phase: 'error',
      error: { code: 'CONTRACT_VIOLATION' },
    })
  })

  it('ANSWERED périmé (hors submitting) ignoré', () => {
    const state = engaged()
    expect(reduce(state, { type: 'ANSWERED', choice: 0, response: inProgressExample() })).toBe(state)
  })
})

describe('reduce — retour à l’exploration', () => {
  it('CONTINUE : entité enregistrée avec sa réaction, question suivante en attente', () => {
    const res: SubmitAnswerResponse = {
      ...inProgressExample(),
      isCorrect: false,
      errors: 1,
      visualFeedback: { signBroken: true, entityState: 'ANGRY', lightsOff: false },
    }
    const after = reduce(answered(res, 2), { type: 'CONTINUE' })
    expect(after).toMatchObject({
      phase: 'exploring',
      intersectionIndex: 1,
      question: res.nextQuestion,
      pendingQuestion: null,
      engagedEntity: null,
      lastAnswer: null,
      encounters: [{ entity: ENTITY, isCorrect: false, visualFeedback: res.visualFeedback }],
    })
  })

  it('CONTINUE ignoré hors feedback', () => {
    const state = engaged()
    expect(reduce(state, { type: 'CONTINUE' })).toBe(state)
  })
})

describe('reduce — erreurs et reprise', () => {
  it('FAILED réessayable pendant submitting : retour au panneau, erreur visible', () => {
    const state = reduce(submitted(), { type: 'FAILED', error: networkError })
    expect(state).toMatchObject({ phase: 'question', engagedEntity: ENTITY, error: networkError })
    expect(reduce(state, { type: 'SUBMIT', choice: 1 })).toMatchObject({ phase: 'submitting', error: null })
  })

  it('FAILED non réessayable → error', () => {
    expect(reduce(submitted(), { type: 'FAILED', error: notFound })).toMatchObject({ phase: 'error', error: notFound })
    expect(reduce(run({ type: 'START' }), { type: 'FAILED', error: networkError }).phase).toBe('error')
  })

  it('RESUMED en cours : exploration, réponses passées sur les premiers emplacements', () => {
    const status: GameStatusResponse = {
      ...statusExample(),
      intersectionIndex: 2,
      pathHistory: [
        { ...statusExample().pathHistory[0], isCorrect: true },
        { ...statusExample().pathHistory[0], intersectionIndex: 1, isCorrect: false },
      ],
      errors: 1,
    }
    const current: CurrentQuestionResponse = { ...questionExample(), intersectionIndex: 2, currentLevel: 2 }

    expect(run({ type: 'RESUMED', status, current })).toMatchObject({
      phase: 'exploring',
      sessionId: status.sessionId,
      pseudo: status.pseudo,
      intersectionIndex: 2,
      errors: 1,
      question: current.question,
      engagedEntity: null,
      encounters: [
        { entity: 0, isCorrect: true, visualFeedback: null },
        { entity: 1, isCorrect: false, visualFeedback: null },
      ],
      error: null,
    })
  })

  it('RESUMED sur une partie finie : phase de fin, erreur d’origine conservée', () => {
    const ended: GameError = { code: 'SESSION_ALREADY_ENDED', message: 'fini', status: 409, retryable: false }
    const status: GameStatusResponse = {
      ...statusExample(),
      gameStatus: 'GAME_OVER_HACK',
      visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
    }
    expect(reduce(submitted(), { type: 'RESUMED', status, current: null, error: ended })).toMatchObject({
      phase: 'gameOver',
      question: null,
      error: ended,
    })
  })

  it('RESUMED en cours sans question → CONTRACT_VIOLATION', () => {
    expect(run({ type: 'RESUMED', status: statusExample(), current: null })).toMatchObject({
      phase: 'error',
      error: { code: 'CONTRACT_VIOLATION' },
    })
  })
})
