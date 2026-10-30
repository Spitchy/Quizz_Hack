import type { Direction, GameApi } from '../api/client'
import { toGameError } from './errors'
import { initialSnapshot, reduce } from './reducer'
import type { GameError, GameEvent, GameSnapshot } from './types'

// Orchestration des appels à l'API autour du reducer. Le contrôleur ne décide
// rien du résultat d'une réponse : il transmet, attend le serveur et applique.
// `subscribe` / `getSnapshot` suivent la signature de `useSyncExternalStore`.

export interface GameController {
  getSnapshot(): GameSnapshot
  subscribe(listener: () => void): () => void
  /** Ouvre une nouvelle session avec le jeton fourni par le Hub. */
  start(fsqToken: string): Promise<void>
  /** Reprend une session existante (rechargement de page, désynchronisation). */
  resume(sessionId: string): Promise<void>
  /** Le joueur aborde une entité : la question courante s'affiche sur son panneau. */
  engage(entity: number): void
  /** Le joueur recule sans répondre : la question reste en attente. */
  disengage(): void
  /**
   * Soumet le choix affiché sur le panneau. `direction` n'a pas de sens en
   * déplacement libre mais reste exigé par le contrat (`chosenDirection`).
   */
  answer(choice: number, direction: Direction): Promise<void>
  /** Fin de la réaction de l'entité : le joueur reprend l'exploration. */
  continueExploring(): void
}

export function createGameController(api: GameApi): GameController {
  let snapshot = initialSnapshot
  const listeners = new Set<() => void>()
  // Incrémenté à chaque start/resume : les réponses d'une session abandonnée sont ignorées.
  let epoch = 0

  function dispatch(event: GameEvent): void {
    const next = reduce(snapshot, event)
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  async function load(sessionId: string, current: number, cause?: GameError): Promise<void> {
    try {
      const status = await api.getGameStatus(sessionId)
      const question = status.gameStatus === 'IN_PROGRESS' ? await api.getCurrentQuestion(sessionId) : null
      if (current !== epoch) return
      dispatch({ type: 'RESUMED', status, current: question, error: cause })
    } catch (error) {
      if (current === epoch) dispatch({ type: 'FAILED', error: toGameError(error) })
    }
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async start(fsqToken) {
      const before = snapshot
      dispatch({ type: 'START' })
      if (snapshot === before) return
      const current = ++epoch
      try {
        const response = await api.startGame({ fsq_token: fsqToken })
        if (current === epoch) dispatch({ type: 'STARTED', response })
      } catch (error) {
        if (current === epoch) dispatch({ type: 'FAILED', error: toGameError(error) })
      }
    },

    resume(sessionId) {
      return load(sessionId, ++epoch)
    },

    async answer(choice, direction) {
      const { sessionId, question } = snapshot
      if (!sessionId || !question) return
      const before = snapshot
      dispatch({ type: 'SUBMIT', choice })
      if (snapshot === before) return
      const current = epoch

      try {
        const response = await api.submitAnswer({
          sessionId,
          questionId: question.id,
          answer: choice,
          chosenDirection: direction,
        })
        if (current === epoch) dispatch({ type: 'ANSWERED', choice, response })
      } catch (error) {
        if (current !== epoch) return
        const gameError = toGameError(error)
        // 409 (session terminée) ou 400 (question désynchronisée) : le serveur
        // connaît l'état réel, on le relit plutôt que de le deviner.
        if (gameError.status === 409 || gameError.status === 400) {
          await load(sessionId, current, gameError)
        } else {
          dispatch({ type: 'FAILED', error: gameError })
        }
      }
    },

    engage: (entity) => dispatch({ type: 'ENGAGE', entity }),

    disengage: () => dispatch({ type: 'DISENGAGE' }),

    continueExploring: () => dispatch({ type: 'CONTINUE' }),
  }
}
