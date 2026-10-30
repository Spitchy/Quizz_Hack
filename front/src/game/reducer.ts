import type { GameStatus } from '../api/client'
import { contractViolation } from './errors'
import type { GameEvent, GameSnapshot, Phase } from './types'

// Transitions pures de la mise en scène. Aucune règle de jeu ici : score,
// erreurs, fin de partie et état visuel sont recopiés des réponses du serveur.
// Un événement reçu dans une phase qui ne l'attend pas est ignoré (réponse
// périmée, double clic…) et renvoie le même objet.

export const initialSnapshot: GameSnapshot = {
  phase: 'idle',
  sessionId: null,
  playerId: null,
  pseudo: null,
  gameStatus: null,
  intersectionIndex: 0,
  totalIntersections: 0,
  currentLevel: 1,
  score: 0,
  scoreMax: 0,
  errors: 0,
  maxErrors: 0,
  visualFeedback: { signBroken: false, entityState: 'CALM', lightsOff: false },
  question: null,
  pendingQuestion: null,
  engagedEntity: null,
  encounters: [],
  lastAnswer: null,
  hubSyncResult: null,
  error: null,
}

const ENDED_PHASE: Record<Exclude<GameStatus, 'IN_PROGRESS'>, Phase> = {
  VICTORY: 'victory',
  GAME_OVER_HACK: 'gameOver',
}

/** Phases depuis lesquelles on peut (re)lancer une partie. */
const STARTABLE: readonly Phase[] = ['idle', 'error', 'victory', 'gameOver']

function phaseFor(status: GameStatus): Phase {
  return status === 'IN_PROGRESS' ? 'exploring' : ENDED_PHASE[status]
}

export function reduce(state: GameSnapshot, event: GameEvent): GameSnapshot {
  switch (event.type) {
    case 'START':
      if (!STARTABLE.includes(state.phase)) return state
      return { ...initialSnapshot, phase: 'starting' }

    case 'STARTED': {
      if (state.phase !== 'starting') return state
      const { sessionId, player, gameState, currentQuestion } = event.response
      return {
        ...initialSnapshot,
        phase: phaseFor(gameState.gameStatus),
        sessionId,
        playerId: player.playerId,
        pseudo: player.pseudo,
        gameStatus: gameState.gameStatus,
        intersectionIndex: gameState.intersectionIndex,
        totalIntersections: gameState.totalIntersections,
        currentLevel: gameState.currentLevel,
        score: gameState.score,
        scoreMax: gameState.scoreMax,
        errors: gameState.errors,
        maxErrors: gameState.maxErrors,
        visualFeedback: gameState.visualFeedback,
        question: currentQuestion,
      }
    }

    case 'RESUMED': {
      const { status, current } = event
      if (status.gameStatus === 'IN_PROGRESS' && !current) {
        return { ...state, phase: 'error', error: contractViolation('Partie en cours sans question courante.') }
      }
      // Le serveur ne sait pas quelle entité a posé chaque question : les
      // réponses passées sont rattachées aux premiers emplacements, sans réaction connue.
      const encounters = status.pathHistory.map((step, entity) => ({
        entity,
        isCorrect: step.isCorrect,
        visualFeedback: null,
      }))
      return {
        ...initialSnapshot,
        phase: phaseFor(status.gameStatus),
        sessionId: status.sessionId,
        playerId: status.playerId,
        pseudo: status.pseudo,
        gameStatus: status.gameStatus,
        intersectionIndex: current?.intersectionIndex ?? status.pathHistory.length,
        totalIntersections: status.totalIntersections,
        currentLevel: current?.currentLevel ?? status.currentLevel,
        score: status.score,
        scoreMax: status.scoreMax,
        errors: status.errors,
        maxErrors: status.maxErrors,
        visualFeedback: status.visualFeedback,
        question: current?.question ?? null,
        encounters,
        hubSyncResult: status.hubSyncResult,
        error: event.error ?? null,
      }
    }

    case 'ENGAGE': {
      if (state.phase !== 'exploring' || !state.question) return state
      if (state.encounters.some((e) => e.entity === event.entity)) return state
      return { ...state, phase: 'question', engagedEntity: event.entity, error: null }
    }

    case 'DISENGAGE':
      if (state.phase !== 'question') return state
      return { ...state, phase: 'exploring', engagedEntity: null, error: null }

    case 'SUBMIT': {
      if (state.phase !== 'question' || !state.question) return state
      const { choice } = event
      if (!Number.isInteger(choice) || choice < 0 || choice >= state.question.choices.length) return state
      return { ...state, phase: 'submitting', error: null }
    }

    case 'ANSWERED': {
      if (state.phase !== 'submitting') return state
      const res = event.response
      const answered: GameSnapshot = {
        ...state,
        gameStatus: res.gameStatus,
        score: res.score,
        scoreMax: res.scoreMax,
        currentLevel: res.currentLevel,
        errors: res.errors,
        maxErrors: res.maxErrors,
        visualFeedback: res.visualFeedback,
        lastAnswer: { choice: event.choice, isCorrect: res.isCorrect },
        hubSyncResult: res.hubSyncResult,
        error: null,
      }

      if (res.gameStatus !== 'IN_PROGRESS') {
        return { ...answered, phase: ENDED_PHASE[res.gameStatus], pendingQuestion: null }
      }
      if (!res.nextQuestion) {
        return { ...answered, phase: 'error', error: contractViolation('Partie en cours sans question suivante.') }
      }
      return { ...answered, phase: 'feedback', pendingQuestion: res.nextQuestion }
    }

    case 'CONTINUE': {
      if (state.phase !== 'feedback' || state.engagedEntity === null || !state.lastAnswer) return state
      return {
        ...state,
        phase: 'exploring',
        // Le contrat ne renvoie pas l'index après une réponse : chaque réponse
        // acceptée en cours de partie fait passer à la question suivante.
        intersectionIndex: state.intersectionIndex + 1,
        question: state.pendingQuestion,
        pendingQuestion: null,
        encounters: [
          ...state.encounters,
          { entity: state.engagedEntity, isCorrect: state.lastAnswer.isCorrect, visualFeedback: state.visualFeedback },
        ],
        engagedEntity: null,
        lastAnswer: null,
      }
    }

    case 'FAILED':
      if (state.phase === 'submitting' && event.error.retryable) {
        // Le panneau reste lisible : le joueur peut renvoyer sa réponse.
        return { ...state, phase: 'question', error: event.error }
      }
      return { ...state, phase: 'error', error: event.error }
  }
}
