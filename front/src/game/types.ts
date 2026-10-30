import type {
  CurrentQuestionResponse,
  GameStatus,
  GameStatusResponse,
  HubSyncResult,
  Question,
  StartGameResponse,
  SubmitAnswerResponse,
  VisualFeedback,
} from '../api/client'

/**
 * Étape de mise en scène côté client. Ce n'est PAS une règle du jeu :
 * la fin de partie vient toujours de `gameStatus` renvoyé par le serveur.
 *
 * idle → starting → exploring ⇄ question → submitting → feedback → exploring …
 *                                                       ↘ victory | gameOver
 */
export type Phase =
  | 'idle'
  | 'starting'
  /** Le joueur se déplace librement dans le labyrinthe. */
  | 'exploring'
  /** Face à une entité : la question courante est lue sur son panneau. */
  | 'question'
  | 'submitting'
  /** L'entité réagit à la réponse. */
  | 'feedback'
  | 'victory'
  | 'gameOver'
  | 'error'

export interface GameError {
  /** Code du contrat (`SESSION_NOT_FOUND`…), `HTTP_<status>`, `NETWORK_ERROR` ou `UNKNOWN`. */
  code: string
  message: string
  /** Statut HTTP, 0 si aucune réponse. */
  status: number
  /** Vrai si relancer la même action a une chance d'aboutir. */
  retryable: boolean
}

export interface LastAnswer {
  choice: number
  isCorrect: boolean
}

/**
 * Une entité déjà interrogée. L'identifiant d'entité est attribué par la scène
 * (emplacement dans le labyrinthe) ; le serveur ne connaît que l'ordre des questions.
 */
export interface Encounter {
  entity: number
  isCorrect: boolean
  /** Réaction renvoyée par le serveur, ou `null` si inconnue (partie reprise). */
  visualFeedback: VisualFeedback | null
}

/** Vue client de la partie : uniquement des valeurs recopiées des réponses du serveur. */
export interface GameSnapshot {
  phase: Phase
  sessionId: string | null
  playerId: string | null
  pseudo: string | null
  gameStatus: GameStatus | null
  /** Nombre de questions déjà répondues (= index de la question courante). */
  intersectionIndex: number
  totalIntersections: number
  currentLevel: number
  score: number
  scoreMax: number
  errors: number
  maxErrors: number
  /** Dernier état visuel renvoyé par le serveur, tel quel. */
  visualFeedback: VisualFeedback
  /** Question courante : elle s'affiche sur la prochaine entité abordée. */
  question: Question | null
  /** Question suivante reçue, qui devient courante quand la réaction se termine. */
  pendingQuestion: Question | null
  /** Entité dont le joueur lit le panneau (phases question → feedback, et fins). */
  engagedEntity: number | null
  encounters: Encounter[]
  lastAnswer: LastAnswer | null
  hubSyncResult: HubSyncResult
  error: GameError | null
}

export type GameEvent =
  | { type: 'START' }
  | { type: 'STARTED'; response: StartGameResponse }
  | {
      type: 'RESUMED'
      status: GameStatusResponse
      current: CurrentQuestionResponse | null
      /** Erreur à l'origine de la resynchronisation, laissée visible au joueur. */
      error?: GameError
    }
  | { type: 'ENGAGE'; entity: number }
  | { type: 'DISENGAGE' }
  | { type: 'SUBMIT'; choice: number }
  | { type: 'ANSWERED'; choice: number; response: SubmitAnswerResponse }
  | { type: 'CONTINUE' }
  | { type: 'FAILED'; error: GameError }
