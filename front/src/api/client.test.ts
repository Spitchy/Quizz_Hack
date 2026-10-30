import { describe, expect, it, vi } from 'vitest'
import { errorExample, requestExample, responseExample } from '../test/contract'
import {
  ApiError,
  createHttpApi,
  NETWORK_ERROR,
  type StartGameRequest,
  type SubmitAnswerRequest,
} from './client'

const BASE = 'http://game.test'
const SESSION_ID = 'a81bc81b-dead-beef-4242-abcdef123456'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    typeof response === 'function' ? response : async () => response.clone(),
  )
  return { fetch, api: createHttpApi({ baseUrl: BASE, fetch }) }
}

function lastCall(fetch: ReturnType<typeof setup>['fetch']) {
  const [url, init] = fetch.mock.calls.at(-1)!
  return { url: String(url), init: init ?? {} }
}

describe('createHttpApi — requêtes', () => {
  it('startGame : POST /api/game/start avec le corps JSON, renvoie la réponse 201', async () => {
    const body = requestExample<StartGameRequest>('/api/game/start', 'post')
    const expected = responseExample('/api/game/start', 'post', 201)
    const { fetch, api } = setup(jsonResponse(expected, 201))

    await expect(api.startGame(body)).resolves.toEqual(expected)

    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/api/game/start`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('getCurrentQuestion : GET /api/game/question?sessionId=…', async () => {
    const expected = responseExample('/api/game/question', 'get', 200)
    const { fetch, api } = setup(jsonResponse(expected))

    await expect(api.getCurrentQuestion(SESSION_ID)).resolves.toEqual(expected)

    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/api/game/question?sessionId=${SESSION_ID}`)
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('getCurrentQuestion : encode le sessionId', async () => {
    const { fetch, api } = setup(jsonResponse(responseExample('/api/game/question', 'get', 200)))
    await api.getCurrentQuestion('a b&c')
    expect(lastCall(fetch).url).toBe(`${BASE}/api/game/question?sessionId=a+b%26c`)
  })

  it.each(['enCours', 'defaite'])('submitAnswer : POST /api/game/answer (exemple %s)', async (name) => {
    const body = requestExample<SubmitAnswerRequest>('/api/game/answer', 'post')
    const expected = responseExample('/api/game/answer', 'post', 200, name)
    const { fetch, api } = setup(jsonResponse(expected))

    await expect(api.submitAnswer(body)).resolves.toEqual(expected)

    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/api/game/answer`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('getGameStatus : GET /api/game/status/{sessionId} encodé', async () => {
    const expected = responseExample('/api/game/status/{sessionId}', 'get', 200)
    const { fetch, api } = setup(jsonResponse(expected))

    await expect(api.getGameStatus(SESSION_ID)).resolves.toEqual(expected)
    expect(lastCall(fetch).url).toBe(`${BASE}/api/game/status/${SESSION_ID}`)

    await api.getGameStatus('../x')
    expect(lastCall(fetch).url).toBe(`${BASE}/api/game/status/..%2Fx`)
  })

  it('getHealth : GET /health', async () => {
    const expected = responseExample('/health', 'get', 200)
    const { fetch, api } = setup(jsonResponse(expected))
    await expect(api.getHealth()).resolves.toEqual(expected)
    expect(lastCall(fetch).url).toBe(`${BASE}/health`)
  })

  it('ignore les / finaux de baseUrl', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({}))
    await createHttpApi({ baseUrl: `${BASE}//`, fetch }).getHealth()
    expect(String(fetch.mock.calls[0][0])).toBe(`${BASE}/health`)
  })

  it('utilise globalThis.fetch par défaut', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'OK' }))
    try {
      await createHttpApi({ baseUrl: BASE }).getHealth()
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('createHttpApi — erreurs', () => {
  it.each([
    [400, 'BadRequest'],
    [401, 'Unauthorized'],
    [404, 'NotFound'],
  ] as const)('%i : ApiError avec le code et le message du contrat', async (status, name) => {
    const body = errorExample(name)
    const { api } = setup(jsonResponse(body, status))

    const error = await api.startGame({ fsq_token: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, code: body.error, message: body.message })
  })

  it('409 SESSION_ALREADY_ENDED sur submitAnswer', async () => {
    const body = responseExample('/api/game/answer', 'post', 409)
    const { api } = setup(jsonResponse(body, 409))
    const request = requestExample<SubmitAnswerRequest>('/api/game/answer', 'post')

    await expect(api.submitAnswer(request)).rejects.toMatchObject({
      status: 409,
      code: 'SESSION_ALREADY_ENDED',
    })
  })

  it('tolère le format actuel du back ({ error: "<message>" })', async () => {
    const { api } = setup(jsonResponse({ error: "Session 'x' introuvable.", details: 'stack…' }, 404))
    await expect(api.getGameStatus('x')).rejects.toMatchObject({
      status: 404,
      code: 'HTTP_404',
      message: "Session 'x' introuvable.",
    })
  })

  it('corps non-JSON : ApiError HTTP_<status>', async () => {
    const { api } = setup(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }))
    await expect(api.getHealth()).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502',
      message: 'Bad Gateway',
    })
  })

  it('serveur injoignable : ApiError NETWORK_ERROR, statut 0', async () => {
    const cause = new TypeError('Failed to fetch')
    const { api } = setup(() => Promise.reject(cause))

    const error = await api.getHealth().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: NETWORK_ERROR })
    expect((error as ApiError).cause).toBe(cause)
  })
})
