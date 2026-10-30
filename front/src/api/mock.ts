import {
  ApiError,
  type CurrentQuestionResponse,
  type Direction,
  type GameApi,
  type GameStatus,
  type GameStatusResponse,
  type HubSyncResult,
  type PathHistoryEntry,
  type Player,
  type Question,
  type StartGameResponse,
  type SubmitAnswerRequest,
  type SubmitAnswerResponse,
  type VisualFeedback,
} from './client'

// Faux serveur en mémoire pour faire tourner le front sans le back.
// Il imite le comportement documenté dans back/README.md et renvoie uniquement
// des formes du contrat. C'est un remplaçant du serveur : la logique de jeu du
// front ne doit jamais en dépendre ni le réutiliser.

/** Question du mock : la bonne réponse reste côté "serveur", jamais renvoyée au client. */
export interface MockQuestion extends Question {
  correctAnswer: number
}

export const MOCK_QUESTIONS: readonly MockQuestion[] = [
  {
    id: 'mock_lvl1_q1',
    level: 1,
    text: "Une créature pétrifiée tient une clé USB rouillée étiquetée 'CONFIDENTIEL'. Que dois-tu faire ?",
    choices: [
      'La brancher immédiatement pour inspecter son contenu',
      "Ne pas la brancher et l'isoler (risque de BadUSB / malware)",
      'La formater rapidement sur un poste de travail du labyrinthe',
      "Demander à l'entité si elle contient le mot de passe de sortie",
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl1_q2',
    level: 1,
    text: "Un message griffonné au mur : « Ton compte sera supprimé. Clique ici pour le sauver. » Que fais-tu ?",
    choices: [
      'Cliquer sur le lien pour en savoir plus',
      'Signaler le message comme tentative de phishing',
      'Répondre avec tes identifiants',
      "Transférer le message à toute l'équipe",
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl2_q1',
    level: 2,
    text: 'Ton téléphone vibre sans arrêt : des dizaines de demandes MFA que tu n’as pas lancées. Que fais-tu ?',
    choices: [
      'Accepter pour que ça s’arrête',
      'Refuser, changer ton mot de passe et prévenir la sécurité',
      'Éteindre le téléphone et attendre',
      'Désactiver la MFA sur ton compte',
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl2_q2',
    level: 2,
    text: "L'entité murmure : « Tu utilises le même mot de passe partout, n'est-ce pas ? » Quelle est la bonne pratique ?",
    choices: [
      'Un mot de passe unique par service, stocké dans un gestionnaire',
      'Le même mot de passe avec un chiffre différent à la fin',
      'Un mot de passe court mais facile à retenir',
      'Le noter sur un post-it collé à l’écran',
    ],
    correctAnswer: 0,
  },
  {
    id: 'mock_lvl3_q1',
    level: 3,
    text: 'Tous les fichiers du terminal portent l’extension .locked et une note exige une rançon. Premier réflexe ?',
    choices: [
      'Payer la rançon au plus vite',
      'Isoler la machine du réseau et alerter l’équipe sécurité',
      'Redémarrer pour voir si ça passe',
      'Renommer les fichiers pour retirer .locked',
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl3_q2',
    level: 3,
    text: "Un réseau Wi-Fi ouvert nommé « SORTIE_GRATUITE » apparaît dans le couloir. Comment l'utiliser ?",
    choices: [
      'S’y connecter et consulter ta banque',
      'S’y connecter seulement via un VPN de confiance, ou pas du tout',
      'Partager ta connexion avec les entités',
      'Désactiver le pare-feu pour aller plus vite',
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl4_q1',
    level: 4,
    text: "Sur le formulaire de connexion du labyrinthe, saisir ' OR '1'='1 ouvre la porte. De quelle faille s'agit-il ?",
    choices: [
      'Cross-Site Scripting (XSS)',
      'Injection SQL',
      'Déni de service',
      'Attaque par force brute',
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl4_q2',
    level: 4,
    text: 'Une voix au téléphone se présente comme le support informatique et réclame ton mot de passe. Que fais-tu ?',
    choices: [
      'Le donner, c’est le support',
      'Raccrocher et rappeler le support via le numéro officiel',
      'Donner seulement la moitié du mot de passe',
      'Lui envoyer par e-mail plutôt',
    ],
    correctAnswer: 1,
  },
  {
    id: 'mock_lvl5_q1',
    level: 5,
    text: "Une faille inconnue de l'éditeur est exploitée dans la nature, sans correctif disponible. Comment l'appelle-t-on ?",
    choices: ['Une vulnérabilité 0-day', 'Un faux positif', 'Une CVE corrigée', 'Un honeypot'],
    correctAnswer: 0,
  },
  {
    id: 'mock_lvl5_q2',
    level: 5,
    text: 'Une mise à jour signée par un fournisseur de confiance ouvre des connexions vers un serveur inconnu. Que fais-tu ?',
    choices: [
      'L’ignorer : elle est signée, donc sûre',
      'Isoler les machines concernées et signaler une possible attaque supply chain',
      'Désinstaller l’antivirus qui bloque',
      'Attendre la prochaine mise à jour',
    ],
    correctAnswer: 1,
  },
]

const POINTS_BY_LEVEL: Record<number, number> = { 1: 60, 2: 80, 3: 100, 4: 120, 5: 140 }
const SCORE_MAX = 1000
const MAX_ERRORS = 6

const MOCK_PLAYER: Player = { playerId: 'player_mock_001', pseudo: 'ShadowRunner', level: 1 }

interface MockSession {
  sessionId: string
  player: Player
  questions: readonly MockQuestion[]
  intersectionIndex: number
  currentLevel: number
  score: number
  errors: number
  gameStatus: GameStatus
  visualFeedback: VisualFeedback
  pathHistory: PathHistoryEntry[]
  hubSyncResult: HubSyncResult
}

export interface MockApiOptions {
  questions?: readonly MockQuestion[]
  /** Latence simulée par appel, en ms. */
  latencyMs?: number
  createId?: () => string
  now?: () => Date
}

function toPublicQuestion({ id, level, text, choices }: MockQuestion): Question {
  return { id, level, text, choices: [...choices] }
}

function isDirection(value: unknown): value is Direction {
  return value === 'LEFT' || value === 'RIGHT'
}

function validationError(message: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message)
}

function isAnswerCorrect(question: MockQuestion, answer: SubmitAnswerRequest['answer']): boolean {
  if (typeof answer === 'number') {
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw validationError("Le champ 'answer' doit être un index entre 0 et 3.")
    }
    return answer === question.correctAnswer
  }
  if (typeof answer === 'string' && answer.length > 0) {
    return answer === question.choices[question.correctAnswer]
  }
  throw validationError("Le champ 'answer' est requis (index ou texte exact du choix).")
}

/**
 * Bonne réponse d'une question du mock (`null` si inconnue). Sert uniquement
 * au mode test : le vrai back ne communique jamais la bonne réponse.
 */
export function mockCorrectAnswer(questionId: string): number | null {
  return MOCK_QUESTIONS.find((q) => q.id === questionId)?.correctAnswer ?? null
}

export function createMockApi(options: MockApiOptions = {}): GameApi {
  const {
    questions = MOCK_QUESTIONS,
    latencyMs = 0,
    createId = () => crypto.randomUUID(),
    now = () => new Date(),
  } = options
  const sessions = new Map<string, MockSession>()

  // Chaque appel renvoie une copie : le front ne peut pas muter l'état du "serveur".
  async function respond<T>(compute: () => T): Promise<T> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    return structuredClone(compute())
  }

  function getSession(sessionId: string): MockSession {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'Aucune session ne correspond à l’identifiant fourni.')
    }
    return session
  }

  return {
    getHealth: () =>
      respond(() => ({
        status: 'OK',
        service: 'Quizz_Hack Back-End Game API (mock)',
        timestamp: now().toISOString(),
      })),

    startGame: ({ fsq_token }) =>
      respond((): StartGameResponse => {
        if (typeof fsq_token !== 'string' || fsq_token.length === 0) {
          throw validationError("Le champ 'fsq_token' est requis.")
        }
        const session: MockSession = {
          sessionId: createId(),
          player: { ...MOCK_PLAYER },
          questions,
          intersectionIndex: 0,
          currentLevel: questions[0].level,
          score: 0,
          errors: 0,
          gameStatus: 'IN_PROGRESS',
          visualFeedback: { signBroken: false, entityState: 'CALM', lightsOff: false },
          pathHistory: [],
          hubSyncResult: null,
        }
        sessions.set(session.sessionId, session)

        return {
          sessionId: session.sessionId,
          player: session.player,
          gameState: {
            gameStatus: session.gameStatus,
            currentLevel: session.currentLevel,
            intersectionIndex: session.intersectionIndex,
            totalIntersections: questions.length,
            score: session.score,
            scoreMax: SCORE_MAX,
            errors: session.errors,
            maxErrors: MAX_ERRORS,
            visualFeedback: session.visualFeedback,
          },
          currentQuestion: toPublicQuestion(questions[0]),
        }
      }),

    getCurrentQuestion: (sessionId) =>
      respond((): CurrentQuestionResponse => {
        const session = getSession(sessionId)
        if (session.gameStatus !== 'IN_PROGRESS') {
          throw new ApiError(400, 'SESSION_ALREADY_ENDED', 'La partie est terminée.')
        }
        const question = session.questions[session.intersectionIndex]
        return {
          sessionId: session.sessionId,
          intersectionIndex: session.intersectionIndex,
          totalIntersections: session.questions.length,
          currentLevel: question.level,
          question: toPublicQuestion(question),
        }
      }),

    submitAnswer: ({ sessionId, questionId, answer, chosenDirection }) =>
      respond((): SubmitAnswerResponse => {
        const session = getSession(sessionId)
        if (session.gameStatus !== 'IN_PROGRESS') {
          throw new ApiError(
            409,
            'SESSION_ALREADY_ENDED',
            'Cette session est terminée ; aucune réponse ne peut être soumise.',
          )
        }
        if (!isDirection(chosenDirection)) {
          throw validationError("Le champ 'chosenDirection' doit valoir 'LEFT' ou 'RIGHT'.")
        }
        const current = session.questions[session.intersectionIndex]
        if (questionId !== current.id) {
          throw validationError(`Le questionId '${questionId}' ne correspond pas à l'intersection active.`)
        }

        const isCorrect = isAnswerCorrect(current, answer)
        const pointsEarned = isCorrect ? (POINTS_BY_LEVEL[current.level] ?? 0) : 0
        session.score = Math.min(SCORE_MAX, session.score + pointsEarned)
        if (!isCorrect) session.errors += 1

        session.pathHistory.push({
          intersectionIndex: session.intersectionIndex,
          questionId: current.id,
          chosenDirection,
          isCorrect,
          level: current.level,
          pointsEarned,
          timestamp: now().toISOString(),
        })
        session.intersectionIndex += 1

        let nextQuestion: Question | null = null
        let nextDirection: Direction | null = null
        if (session.errors >= MAX_ERRORS) {
          session.gameStatus = 'GAME_OVER_HACK'
          session.visualFeedback = { signBroken: true, entityState: 'SMILING_IN_DARK', lightsOff: true }
        } else if (session.intersectionIndex >= session.questions.length) {
          session.gameStatus = 'VICTORY'
          session.visualFeedback = { signBroken: false, entityState: 'VANISHED', lightsOff: false }
        } else {
          const next = session.questions[session.intersectionIndex]
          nextQuestion = toPublicQuestion(next)
          nextDirection = chosenDirection
          session.currentLevel = next.level
          session.visualFeedback = isCorrect
            ? { signBroken: false, entityState: 'CALM', lightsOff: false }
            : { signBroken: true, entityState: 'ANGRY', lightsOff: false }
        }

        if (session.gameStatus !== 'IN_PROGRESS') {
          session.hubSyncResult = { accepted: true, xpGained: Math.floor(session.score / 10) }
        }

        return {
          isCorrect,
          gameStatus: session.gameStatus,
          score: session.score,
          scoreMax: SCORE_MAX,
          currentLevel: session.currentLevel,
          errors: session.errors,
          maxErrors: MAX_ERRORS,
          visualFeedback: session.visualFeedback,
          nextDirection,
          nextQuestion,
          hubSyncResult: session.hubSyncResult,
        }
      }),

    getGameStatus: (sessionId) =>
      respond((): GameStatusResponse => {
        const session = getSession(sessionId)
        return {
          sessionId: session.sessionId,
          playerId: session.player.playerId,
          pseudo: session.player.pseudo,
          gameStatus: session.gameStatus,
          currentLevel: session.currentLevel,
          intersectionIndex: session.intersectionIndex,
          totalIntersections: session.questions.length,
          score: session.score,
          scoreMax: SCORE_MAX,
          errors: session.errors,
          maxErrors: MAX_ERRORS,
          pathHistory: session.pathHistory,
          visualFeedback: session.visualFeedback,
          hubSyncResult: session.hubSyncResult,
        }
      }),
  }
}
