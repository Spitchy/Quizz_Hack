import type { components } from './types'

// Alias lisibles sur les schémas générés depuis contracts/openapi.yaml.
// Ne jamais redéfinir ces formes à la main : régénérer avec `npm run gen:api`.
type Schemas = components['schemas']

export type GameStatus = Schemas['GameStatus']
export type EntityState = Schemas['EntityState']
export type Direction = Schemas['Direction']
export type VisualFeedback = Schemas['VisualFeedback']
export type Question = Schemas['Question']
export type Player = Schemas['Player']
export type HubSyncResult = Schemas['HubSyncResult']
export type GameState = Schemas['GameState']
export type PathHistoryEntry = Schemas['PathHistoryEntry']
export type StartGameRequest = Schemas['StartGameRequest']
export type StartGameResponse = Schemas['StartGameResponse']
export type CurrentQuestionResponse = Schemas['CurrentQuestionResponse']
export type SubmitAnswerRequest = Schemas['SubmitAnswerRequest']
export type SubmitAnswerResponse = Schemas['SubmitAnswerResponse']
export type GameStatusResponse = Schemas['GameStatusResponse']
export type HealthStatus = Schemas['HealthStatus']
export type ApiErrorBody = Schemas['Error']

/** Une fonction par endpoint du contrat. Implémentée par le client HTTP et par le mock. */
export interface GameApi {
  getHealth(): Promise<HealthStatus>
  startGame(body: StartGameRequest): Promise<StartGameResponse>
  getCurrentQuestion(sessionId: string): Promise<CurrentQuestionResponse>
  submitAnswer(body: SubmitAnswerRequest): Promise<SubmitAnswerResponse>
  getGameStatus(sessionId: string): Promise<GameStatusResponse>
}

/** Code utilisé quand le serveur n'est pas joignable (aucune réponse HTTP). */
export const NETWORK_ERROR = 'NETWORK_ERROR'

export class ApiError extends Error {
  /** Statut HTTP, ou 0 si la requête n'a pas abouti. */
  readonly status: number
  /** Code stable du contrat (`ApiErrorBody.error`), ou `HTTP_<status>` à défaut. */
  readonly code: string

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function toApiError(res: Response): Promise<ApiError> {
  const fallbackCode = `HTTP_${res.status}`
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Corps absent ou non-JSON (proxy, page d'erreur HTML…)
  }

  if (isRecord(body) && typeof body.error === 'string') {
    if (typeof body.message === 'string') {
      return new ApiError(res.status, body.error, body.message)
    }
    // Le back actuel renvoie `{ error: "<message lisible>" }` sans code (écart au contrat).
    return new ApiError(res.status, fallbackCode, body.error)
  }

  return new ApiError(res.status, fallbackCode, res.statusText || `Erreur HTTP ${res.status}`)
}

export interface HttpApiOptions {
  /** Racine du serveur, ex. `http://localhost:3000`. */
  baseUrl: string
  /** Injectable pour les tests ; par défaut `globalThis.fetch`. */
  fetch?: typeof fetch
}

export function createHttpApi({ baseUrl, fetch: fetchImpl }: HttpApiOptions): GameApi {
  const root = baseUrl.replace(/\/+$/, '')
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init))

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response
    try {
      res = await doFetch(`${root}${path}`, init)
    } catch (cause) {
      throw new ApiError(0, NETWORK_ERROR, 'Serveur de jeu injoignable.', { cause })
    }

    if (!res.ok) throw await toApiError(res)
    return (await res.json()) as T
  }

  function getJson<T>(path: string): Promise<T> {
    return request<T>(path, { headers: { Accept: 'application/json' } })
  }

  function postJson<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  return {
    getHealth: () => getJson<HealthStatus>('/health'),

    startGame: (body) => postJson<StartGameResponse>('/api/game/start', body),

    getCurrentQuestion: (sessionId) =>
      getJson<CurrentQuestionResponse>(`/api/game/question?${new URLSearchParams({ sessionId })}`),

    submitAnswer: (body) => postJson<SubmitAnswerResponse>('/api/game/answer', body),

    getGameStatus: (sessionId) =>
      getJson<GameStatusResponse>(`/api/game/status/${encodeURIComponent(sessionId)}`),
  }
}
