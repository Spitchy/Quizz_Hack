import { createHttpApi, type GameApi } from './client'
import { createMockApi } from './mock'

export * from './client'
export { createMockApi, MOCK_QUESTIONS, type MockApiOptions, type MockQuestion } from './mock'

export interface ApiConfig {
  /** `true` : faux serveur en mémoire, aucun appel réseau. */
  mock: boolean
  baseUrl: string
}

const DEFAULT_BASE_URL = 'http://localhost:3000'

export function readApiConfig(env: Pick<ImportMetaEnv, 'VITE_API_MOCK' | 'VITE_API_BASE_URL'> = import.meta.env): ApiConfig {
  return {
    mock: env.VITE_API_MOCK === 'true',
    baseUrl: env.VITE_API_BASE_URL || DEFAULT_BASE_URL,
  }
}

export function createGameApi(config: ApiConfig = readApiConfig()): GameApi {
  return config.mock ? createMockApi({ latencyMs: 200 }) : createHttpApi({ baseUrl: config.baseUrl })
}
