import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGameApi, readApiConfig } from './index'

describe('readApiConfig', () => {
  it('par défaut : vrai serveur sur localhost:3000', () => {
    expect(readApiConfig({})).toEqual({ mock: false, baseUrl: 'http://localhost:3000' })
  })

  it('lit VITE_API_MOCK et VITE_API_BASE_URL', () => {
    expect(readApiConfig({ VITE_API_MOCK: 'true', VITE_API_BASE_URL: 'http://api.test' })).toEqual({
      mock: true,
      baseUrl: 'http://api.test',
    })
    expect(readApiConfig({ VITE_API_MOCK: '1' }).mock).toBe(false)
  })
})

describe('createGameApi', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mode mock : aucun appel réseau', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const api = createGameApi({ mock: true, baseUrl: 'http://unused.test' })
    await api.getHealth()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('mode HTTP : appelle baseUrl', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":"OK"}', { status: 200 }))
    await createGameApi({ mock: false, baseUrl: 'http://api.test' }).getHealth()
    expect(String(fetch.mock.calls[0][0])).toBe('http://api.test/health')
  })
})
