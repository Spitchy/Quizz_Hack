import { describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type GameApi,
  type GameStatusResponse,
  type Question,
  type StartGameResponse,
} from '../api/client'
import { createMockApi, MOCK_QUESTIONS } from '../api/mock'
import { responseExample } from '../test/contract'
import { createGameController, type GameController } from './controller'
import { toEntityState, toWorldState } from './render'

const correct = (q: Question) => MOCK_QUESTIONS.find((m) => m.id === q.id)!.correctAnswer
const wrong = (q: Question) => (correct(q) + 1) % q.choices.length

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Aborde la prochaine entité libre, répond, puis reprend l'exploration si la partie continue. */
async function play(game: GameController, pick: (q: Question) => number) {
  const entity = game.getSnapshot().encounters.length
  game.engage(entity)
  const { question } = game.getSnapshot()
  await game.answer(pick(question!), 'LEFT')
  if (game.getSnapshot().phase === 'feedback') game.continueExploring()
  return entity
}

/** Démarre puis aborde une première entité. */
async function startEngaged(game: GameController, entity = 0) {
  await game.start('token')
  game.engage(entity)
}

async function startedWithMock() {
  const api = createMockApi()
  const game = createGameController(api)
  await game.start('token')
  return { api, game }
}

describe('createGameController — avec le mock conforme au contrat', () => {
  it('start : première question affichée, abonnés notifiés', async () => {
    const game = createGameController(createMockApi())
    const listener = vi.fn()
    game.subscribe(listener)

    const pending = game.start('token')
    expect(game.getSnapshot().phase).toBe('starting')
    await pending

    expect(game.getSnapshot()).toMatchObject({ phase: 'exploring', intersectionIndex: 0, question: { id: MOCK_QUESTIONS[0].id } })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('envoie l’index du choix, la question courante et la direction', async () => {
    const api = createMockApi()
    const submit = vi.spyOn(api, 'submitAnswer')
    const game = createGameController(api)
    await startEngaged(game)
    const { sessionId, question } = game.getSnapshot()

    await game.answer(2, 'RIGHT')
    expect(submit).toHaveBeenCalledWith({ sessionId, questionId: question!.id, answer: 2, chosenDirection: 'RIGHT' })
  })

  it('parcours parfait → victory avec le score du serveur', async () => {
    const { game } = await startedWithMock()
    while (game.getSnapshot().phase === 'exploring') await play(game, correct)

    expect(game.getSnapshot()).toMatchObject({
      phase: 'victory',
      gameStatus: 'VICTORY',
      score: 1000,
      intersectionIndex: 9,
      engagedEntity: 9,
      hubSyncResult: { accepted: true, xpGained: 100 },
    })
    expect(toEntityState(game.getSnapshot(), 9).entity.visible).toBe(false)
  })

  it('6 erreurs → gameOver : lumières éteintes, sourire dans le noir', async () => {
    const { game } = await startedWithMock()
    while (game.getSnapshot().phase === 'exploring') await play(game, wrong)

    expect(game.getSnapshot()).toMatchObject({ phase: 'gameOver', errors: 6, intersectionIndex: 5, engagedEntity: 5 })
    expect(toWorldState(game.getSnapshot()).lightsOff).toBe(true)
    expect(toEntityState(game.getSnapshot(), 5).entity).toMatchObject({ mood: 'smiling', smileOnly: true })
    // Toutes les entités trompées reviennent, sourire dans le noir.
    expect(toEntityState(game.getSnapshot(), 2).entity).toMatchObject({ mood: 'smiling', smileOnly: true })
  })

  it('mauvaise réponse : réaction de l’entité abordée, puis retour à l’exploration', async () => {
    const { game } = await startedWithMock()
    game.engage(4)
    await game.answer(wrong(game.getSnapshot().question!), 'RIGHT')
    expect(toEntityState(game.getSnapshot(), 4)).toMatchObject({ sign: { broken: true }, entity: { mood: 'angry' } })

    game.continueExploring()
    expect(game.getSnapshot()).toMatchObject({
      phase: 'exploring',
      intersectionIndex: 1,
      errors: 1,
      question: { id: MOCK_QUESTIONS[1].id },
    })
    // La question suivante ira à n'importe quelle autre entité, jamais à la même.
    game.engage(4)
    expect(game.getSnapshot().phase).toBe('exploring')
    game.engage(8)
    expect(game.getSnapshot()).toMatchObject({ phase: 'question', engagedEntity: 8 })
  })

  it('reculer sans répondre : aucune requête, la question attend', async () => {
    const { api, game } = await startedWithMock()
    const submit = vi.spyOn(api, 'submitAnswer')
    game.engage(1)
    game.disengage()
    expect(game.getSnapshot()).toMatchObject({ phase: 'exploring', engagedEntity: null, question: { id: MOCK_QUESTIONS[0].id } })
    expect(submit).not.toHaveBeenCalled()
  })

  it('double clic : une seule requête envoyée', async () => {
    const { api, game } = await startedWithMock()
    game.engage(0)
    const submit = vi.spyOn(api, 'submitAnswer')
    await Promise.all([game.answer(0, 'LEFT'), game.answer(1, 'LEFT')])
    expect(submit).toHaveBeenCalledOnce()
  })

  it('answer ignoré hors de la phase question', async () => {
    const { api, game } = await startedWithMock()
    const submit = vi.spyOn(api, 'submitAnswer')
    await game.answer(0, 'LEFT') // exploration : aucune entité abordée
    expect(submit).not.toHaveBeenCalled()
    game.engage(0)
    await game.answer(0, 'LEFT')
    await game.answer(0, 'LEFT') // phase feedback
    expect(submit).toHaveBeenCalledOnce()
  })

  it('resume : reprend une session existante à la bonne question', async () => {
    const { api, game } = await startedWithMock()
    await play(game, wrong)
    const { sessionId } = game.getSnapshot()

    const reloaded = createGameController(api)
    await reloaded.resume(sessionId!)
    expect(reloaded.getSnapshot()).toMatchObject({
      phase: 'exploring',
      intersectionIndex: 1,
      errors: 1,
      question: { id: MOCK_QUESTIONS[1].id },
      encounters: [{ entity: 0, isCorrect: false, visualFeedback: null }],
    })
  })

  it('unsubscribe : plus de notification', async () => {
    const game = createGameController(createMockApi())
    const listener = vi.fn()
    game.subscribe(listener)()
    await game.start('token')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('createGameController — erreurs', () => {
  const startResponse = () => responseExample<StartGameResponse>('/api/game/start', 'post', 201)
  const endedStatus = (): GameStatusResponse => ({
    ...responseExample<GameStatusResponse>('/api/game/status/{sessionId}', 'get', 200),
    gameStatus: 'GAME_OVER_HACK',
    errors: 6,
    visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
  })

  function fakeApi(overrides: Partial<GameApi>): GameApi {
    const fail = () => Promise.reject(new Error('non prévu par le test'))
    return {
      getHealth: fail,
      startGame: async () => startResponse(),
      getCurrentQuestion: fail,
      submitAnswer: fail,
      getGameStatus: fail,
      ...overrides,
    }
  }

  it('start refusé (401) → error ; un nouveau start est possible', async () => {
    const startGame = vi
      .fn<GameApi['startGame']>()
      .mockRejectedValueOnce(new ApiError(401, 'INVALID_TOKEN', 'Jeton invalide'))
      .mockResolvedValueOnce(startResponse())
    const game = createGameController(fakeApi({ startGame }))

    await game.start('bad')
    expect(game.getSnapshot()).toMatchObject({ phase: 'error', error: { code: 'INVALID_TOKEN', retryable: false } })

    await game.start('good')
    expect(game.getSnapshot().phase).toBe('exploring')
  })

  it('réseau coupé pendant la réponse → retour à la question, puis nouvel essai', async () => {
    const submitAnswer = vi
      .fn<GameApi['submitAnswer']>()
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'down'))
      .mockResolvedValueOnce(responseExample('/api/game/answer', 'post', 200, 'enCours'))
    const game = createGameController(fakeApi({ submitAnswer }))
    await startEngaged(game)

    await game.answer(1, 'LEFT')
    expect(game.getSnapshot()).toMatchObject({ phase: 'question', error: { code: 'NETWORK_ERROR', retryable: true } })

    await game.answer(1, 'LEFT')
    expect(game.getSnapshot()).toMatchObject({ phase: 'feedback', error: null })
  })

  it.each([
    ['409 du contrat', new ApiError(409, 'SESSION_ALREADY_ENDED', 'terminée')],
    ['400 du back actuel', new ApiError(400, 'HTTP_400', 'Action impossible : la partie est déjà terminée')],
  ])('%s → relit le statut serveur au lieu de deviner', async (_, error) => {
    const getGameStatus = vi.fn<GameApi['getGameStatus']>().mockResolvedValue(endedStatus())
    const game = createGameController(fakeApi({ submitAnswer: () => Promise.reject(error), getGameStatus }))
    await startEngaged(game)

    await game.answer(0, 'LEFT')
    expect(getGameStatus).toHaveBeenCalledWith(startResponse().sessionId)
    expect(game.getSnapshot()).toMatchObject({ phase: 'gameOver', gameStatus: 'GAME_OVER_HACK', error: { status: error.status } })
  })

  it('session introuvable (404) → error non réessayable', async () => {
    const game = createGameController(
      fakeApi({ submitAnswer: () => Promise.reject(new ApiError(404, 'SESSION_NOT_FOUND', 'gone')) }),
    )
    await startEngaged(game)
    await game.answer(0, 'LEFT')
    expect(game.getSnapshot()).toMatchObject({ phase: 'error', error: { code: 'SESSION_NOT_FOUND', retryable: false } })
  })

  it('réponse de start périmée ignorée après un resume', async () => {
    const pendingStart = deferred<StartGameResponse>()
    const status = { ...endedStatus(), sessionId: 'resumed' }
    const game = createGameController(
      fakeApi({ startGame: () => pendingStart.promise, getGameStatus: async () => status }),
    )

    const starting = game.start('token')
    await game.resume('resumed')
    pendingStart.resolve(startResponse())
    await starting

    expect(game.getSnapshot()).toMatchObject({ sessionId: 'resumed', phase: 'gameOver' })
  })

  it('réponse à une question périmée ignorée après un resume', async () => {
    const pendingAnswer = deferred<never>()
    const status = { ...endedStatus(), sessionId: 'other' }
    const game = createGameController(
      fakeApi({ submitAnswer: () => pendingAnswer.promise, getGameStatus: async () => status }),
    )
    await startEngaged(game)

    const answering = game.answer(0, 'LEFT')
    await game.resume('other')
    pendingAnswer.reject(new ApiError(404, 'SESSION_NOT_FOUND', 'gone'))
    await answering

    expect(game.getSnapshot()).toMatchObject({ sessionId: 'other', phase: 'gameOver', error: null })
  })
})
