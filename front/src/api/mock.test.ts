import { describe, expect, it } from 'vitest'
import { schemaErrors, type SchemaName } from '../test/contract'
import type { Direction, GameApi, Question, SubmitAnswerResponse } from './client'
import { createMockApi, MOCK_QUESTIONS, type MockQuestion } from './mock'

// Chaque réponse du mock est validée contre le schéma du contrat.
async function conform<T>(schema: SchemaName, promise: Promise<T>): Promise<T> {
  const body = await promise
  expect(schemaErrors(schema, body)).toEqual([])
  return body
}

function correctIndex(question: Question): number {
  const found = MOCK_QUESTIONS.find((q) => q.id === question.id) as MockQuestion
  return found.correctAnswer
}

function wrongIndex(question: Question): number {
  return (correctIndex(question) + 1) % question.choices.length
}

async function start(api: GameApi) {
  return conform('StartGameResponse', api.startGame({ fsq_token: 'token' }))
}

async function answer(
  api: GameApi,
  sessionId: string,
  question: Question,
  index: number,
  chosenDirection: Direction = 'LEFT',
) {
  return conform(
    'SubmitAnswerResponse',
    api.submitAnswer({ sessionId, questionId: question.id, answer: index, chosenDirection }),
  )
}

describe('createMockApi', () => {
  it('fournit 10 questions, 2 par niveau, sans exposer la bonne réponse', async () => {
    expect(MOCK_QUESTIONS).toHaveLength(10)
    for (const level of [1, 2, 3, 4, 5]) {
      expect(MOCK_QUESTIONS.filter((q) => q.level === level)).toHaveLength(2)
    }

    const api = createMockApi()
    const { currentQuestion } = await start(api)
    expect(currentQuestion).not.toHaveProperty('correctAnswer')
  })

  it('startGame : état initial conforme', async () => {
    const api = createMockApi({ createId: () => 'a81bc81b-dead-beef-4242-abcdef123456' })
    const res = await start(api)

    expect(res.sessionId).toBe('a81bc81b-dead-beef-4242-abcdef123456')
    expect(res.gameState).toEqual({
      gameStatus: 'IN_PROGRESS',
      currentLevel: 1,
      intersectionIndex: 0,
      totalIntersections: 10,
      score: 0,
      scoreMax: 1000,
      errors: 0,
      maxErrors: 6,
      visualFeedback: { signBroken: false, entityState: 'CALM', lightsOff: false },
    })
  })

  it('startGame : fsq_token vide → 400 VALIDATION_ERROR', async () => {
    await expect(createMockApi().startGame({ fsq_token: '' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })
  })

  it('bonne réponse : score + points du niveau, entité calme, question suivante', async () => {
    const api = createMockApi()
    const { sessionId, currentQuestion } = await start(api)

    const res = await answer(api, sessionId, currentQuestion, correctIndex(currentQuestion), 'RIGHT')
    expect(res).toMatchObject({
      isCorrect: true,
      gameStatus: 'IN_PROGRESS',
      score: 60,
      errors: 0,
      visualFeedback: { signBroken: false, entityState: 'CALM', lightsOff: false },
      nextDirection: 'RIGHT',
      hubSyncResult: null,
    })
    expect(res.nextQuestion?.id).toBe(MOCK_QUESTIONS[1].id)

    const current = await conform('CurrentQuestionResponse', api.getCurrentQuestion(sessionId))
    expect(current).toMatchObject({ intersectionIndex: 1, question: res.nextQuestion })
  })

  it('mauvaise réponse : panneau brisé, entité en colère, erreur +1', async () => {
    const api = createMockApi()
    const { sessionId, currentQuestion } = await start(api)

    const res = await answer(api, sessionId, currentQuestion, wrongIndex(currentQuestion))
    expect(res).toMatchObject({
      isCorrect: false,
      gameStatus: 'IN_PROGRESS',
      score: 0,
      errors: 1,
      visualFeedback: { signBroken: true, entityState: 'ANGRY', lightsOff: false },
    })
  })

  it('accepte la réponse par texte exact du choix', async () => {
    const api = createMockApi()
    const { sessionId, currentQuestion } = await start(api)
    const text = currentQuestion.choices[correctIndex(currentQuestion)]

    const res = await conform(
      'SubmitAnswerResponse',
      api.submitAnswer({ sessionId, questionId: currentQuestion.id, answer: text, chosenDirection: 'LEFT' }),
    )
    expect(res.isCorrect).toBe(true)
  })

  it('parcours parfait → VICTORY, 1000 points, entité disparue', async () => {
    const api = createMockApi()
    const started = await start(api)
    let question: Question | null = started.currentQuestion
    let last: SubmitAnswerResponse | undefined

    while (question) {
      last = await answer(api, started.sessionId, question, correctIndex(question))
      question = last.nextQuestion
    }

    expect(last).toMatchObject({
      gameStatus: 'VICTORY',
      score: 1000,
      errors: 0,
      visualFeedback: { signBroken: false, entityState: 'VANISHED', lightsOff: false },
      nextDirection: null,
      nextQuestion: null,
      hubSyncResult: { accepted: true, xpGained: 100 },
    })

    const status = await conform('GameStatusResponse', api.getGameStatus(started.sessionId))
    expect(status).toMatchObject({ gameStatus: 'VICTORY', intersectionIndex: 10 })
    expect(status.pathHistory).toHaveLength(10)
  })

  it('6e erreur → GAME_OVER_HACK : lumières éteintes, sourire dans le noir', async () => {
    const api = createMockApi()
    const started = await start(api)
    let question: Question | null = started.currentQuestion
    const results: SubmitAnswerResponse[] = []

    while (question) {
      const res = await answer(api, started.sessionId, question, wrongIndex(question))
      results.push(res)
      question = res.nextQuestion
    }

    expect(results).toHaveLength(6)
    expect(results.at(-1)).toMatchObject({
      isCorrect: false,
      gameStatus: 'GAME_OVER_HACK',
      errors: 6,
      visualFeedback: { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true },
      nextDirection: null,
      nextQuestion: null,
      hubSyncResult: { accepted: true, xpGained: 0 },
    })
  })

  it('session terminée : answer → 409, question → 400', async () => {
    const api = createMockApi({ questions: MOCK_QUESTIONS.slice(0, 1) })
    const { sessionId, currentQuestion } = await start(api)
    await answer(api, sessionId, currentQuestion, correctIndex(currentQuestion))

    await expect(
      api.submitAnswer({ sessionId, questionId: currentQuestion.id, answer: 0, chosenDirection: 'LEFT' }),
    ).rejects.toMatchObject({ status: 409, code: 'SESSION_ALREADY_ENDED' })
    await expect(api.getCurrentQuestion(sessionId)).rejects.toMatchObject({ status: 400 })
  })

  it('session inconnue → 404 SESSION_NOT_FOUND', async () => {
    const api = createMockApi()
    const notFound = { status: 404, code: 'SESSION_NOT_FOUND' }

    await expect(api.getCurrentQuestion('nope')).rejects.toMatchObject(notFound)
    await expect(api.getGameStatus('nope')).rejects.toMatchObject(notFound)
    await expect(
      api.submitAnswer({ sessionId: 'nope', questionId: 'q', answer: 0, chosenDirection: 'LEFT' }),
    ).rejects.toMatchObject(notFound)
  })

  it('requêtes invalides → 400 VALIDATION_ERROR sans modifier la session', async () => {
    const api = createMockApi()
    const { sessionId, currentQuestion } = await start(api)
    const base = { sessionId, questionId: currentQuestion.id, answer: 0, chosenDirection: 'LEFT' as const }
    const invalid = { status: 400, code: 'VALIDATION_ERROR' }

    await expect(api.submitAnswer({ ...base, questionId: 'autre' })).rejects.toMatchObject(invalid)
    await expect(api.submitAnswer({ ...base, answer: 4 })).rejects.toMatchObject(invalid)
    await expect(api.submitAnswer({ ...base, answer: '' })).rejects.toMatchObject(invalid)
    await expect(
      api.submitAnswer({ ...base, chosenDirection: 'UP' as unknown as Direction }),
    ).rejects.toMatchObject(invalid)

    const status = await api.getGameStatus(sessionId)
    expect(status).toMatchObject({ intersectionIndex: 0, errors: 0, pathHistory: [] })
  })

  it('renvoie des copies : muter une réponse ne change pas la session', async () => {
    const api = createMockApi()
    const res = await start(api)
    res.gameState.visualFeedback.entityState = 'ANGRY'
    res.currentQuestion.choices.length = 0

    const status = await api.getGameStatus(res.sessionId)
    expect(status.visualFeedback.entityState).toBe('CALM')
    expect((await api.getCurrentQuestion(res.sessionId)).question.choices).toHaveLength(4)
  })

  it('sessions indépendantes', async () => {
    const api = createMockApi()
    const a = await start(api)
    const b = await start(api)
    expect(a.sessionId).not.toBe(b.sessionId)

    await answer(api, a.sessionId, a.currentQuestion, wrongIndex(a.currentQuestion))
    expect((await api.getGameStatus(b.sessionId)).errors).toBe(0)
  })

  it('getHealth conforme', async () => {
    await conform('HealthStatus', createMockApi().getHealth())
  })
})
