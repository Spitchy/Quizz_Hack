import { describe, expect, it } from 'vitest'
import { errorExample, requestExample, responseExample, schemaErrors, type SchemaName } from '../test/contract'

// Garde-fou : les exemples du contrat respectent ses propres schémas.
// Les autres tests s'appuient sur ces exemples comme fixtures.

const responses: [string, string, number, string | undefined, SchemaName][] = [
  ['/health', 'get', 200, undefined, 'HealthStatus'],
  ['/api/game/start', 'post', 201, undefined, 'StartGameResponse'],
  ['/api/game/question', 'get', 200, undefined, 'CurrentQuestionResponse'],
  ['/api/game/answer', 'post', 200, 'enCours', 'SubmitAnswerResponse'],
  ['/api/game/answer', 'post', 200, 'defaite', 'SubmitAnswerResponse'],
  ['/api/game/answer', 'post', 409, undefined, 'Error'],
  ['/api/game/status/{sessionId}', 'get', 200, undefined, 'GameStatusResponse'],
]

describe('contracts/openapi.yaml', () => {
  it.each(responses)('exemple %s %s %i %s ⊨ %s', (path, method, status, name, schema) => {
    expect(schemaErrors(schema, responseExample(path, method, status, name))).toEqual([])
  })

  it.each([
    ['/api/game/start', 'StartGameRequest'],
    ['/api/game/answer', 'SubmitAnswerRequest'],
  ] as const)('exemple de requête %s ⊨ %s', (path, schema) => {
    expect(schemaErrors(schema, requestExample(path, 'post'))).toEqual([])
  })

  it.each(['BadRequest', 'Unauthorized', 'NotFound'] as const)('erreur %s ⊨ Error', (name) => {
    expect(schemaErrors('Error', errorExample(name))).toEqual([])
  })

  it('rejette un payload hors contrat', () => {
    const body = responseExample('/api/game/answer', 'post', 200, 'enCours')
    expect(schemaErrors('SubmitAnswerResponse', { ...(body as object), extra: 1 })).not.toEqual([])
    expect(
      schemaErrors('VisualFeedback', { signBroken: false, entityState: 'HAPPY', lightsOff: false }),
    ).not.toEqual([])
  })
})
