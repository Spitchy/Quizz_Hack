import type { GameController } from '../game/controller'
import { FSQ_TOKEN_PARAM, readFsqToken } from '../game/token'
import type { GameError } from '../game/types'

// Lancement et reprise de session : lecture du jeton du Hub, mémorisation du
// sessionId pour survivre à un rechargement de page.

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const SESSION_KEY = 'quizzhack.sessionId'

/** `sessionStorage`, ou `null` s'il est inaccessible (navigation privée, iframe…). */
export function browserStore(): KeyValueStore | null {
  try {
    const store = window.sessionStorage
    store.getItem(SESSION_KEY)
    return store
  } catch {
    return null
  }
}

export function loadSessionId(store: KeyValueStore | null): string | null {
  try {
    return store?.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

export function saveSessionId(store: KeyValueStore | null, sessionId: string): void {
  try {
    store?.setItem(SESSION_KEY, sessionId)
  } catch {
    // Reprise après rechargement indisponible, la partie continue.
  }
}

export function clearSessionId(store: KeyValueStore | null): void {
  try {
    store?.removeItem(SESSION_KEY)
  } catch {
    // idem
  }
}

export interface Launch {
  token: string | null
  /** URL sans le jeton, à remettre dans la barre d'adresse (`null` si inchangée). */
  cleanUrl: string | null
}

/** Lit le `fsq_token` de l'URL et calcule l'URL nettoyée (le jeton ne reste pas dans l'historique). */
export function readLaunch(href: string, fallbackToken: string | null): Launch {
  const url = new URL(href)
  const token = readFsqToken(url.search)
  if (!url.searchParams.has(FSQ_TOKEN_PARAM)) return { token: fallbackToken, cleanUrl: null }
  url.searchParams.delete(FSQ_TOKEN_PARAM)
  return { token: token ?? fallbackToken, cleanUrl: url.toString() }
}

export const NO_TOKEN_ERROR: GameError = {
  code: 'NO_TOKEN',
  message: 'Aucun jeton de joueur : lance le jeu depuis le Hub.',
  status: 0,
  retryable: false,
}

export type EnterResult = 'resumed' | 'started' | 'no-token'

/**
 * Entrée dans le jeu : reprend la session mémorisée si elle existe encore,
 * sinon en ouvre une nouvelle avec le jeton du Hub.
 */
export async function enterGame(
  game: GameController,
  token: string | null,
  store: KeyValueStore | null,
): Promise<EnterResult> {
  const stored = loadSessionId(store)
  if (stored) {
    await game.resume(stored)
    if (game.getSnapshot().phase !== 'error') return 'resumed'
    clearSessionId(store)
  }
  if (!token) return 'no-token'
  await game.start(token)
  return 'started'
}
