import { ApiError } from '../api/client'
import type { GameError } from './types'

export function toGameError(error: unknown): GameError {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      // Réseau coupé ou panne serveur : relancer peut suffire. Une 4xx, non.
      retryable: error.status === 0 || error.status >= 500,
    }
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
    status: 0,
    retryable: false,
  }
}

/** Réponse 200 dont le contenu contredit le contrat (ex. IN_PROGRESS sans question suivante). */
export function contractViolation(message: string): GameError {
  return { code: 'CONTRACT_VIOLATION', message, status: 0, retryable: false }
}
