const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const sessionStore = require('../models/sessionStore');
const hubService = require('./hubService');

// Chargement du fichier data/questions.json
const questionsPath = path.resolve(__dirname, '../data/questions.json');
let rawQuestions = [];

try {
  const data = fs.readFileSync(questionsPath, 'utf-8');
  rawQuestions = JSON.parse(data);
} catch (error) {
  console.error(`[GameService] Impossible de charger questions.json: ${error.message}`);
  rawQuestions = [];
}

/**
 * Service gérant la logique métier du jeu, du labyrinthe, des scores et des erreurs
 */
class GameService {
  constructor() {
    this.questionsPool = rawQuestions;
  }

  /**
   * Nettoie une question pour ne jamais exposer la bonne réponse ni l'explication au client
   * @param {Object} q
   * @returns {Object|null}
   */
  sanitizeQuestion(q) {
    if (!q) return null;
    return {
      id: q.id,
      level: q.level,
      text: q.text,
      choices: q.choices,
    };
  }

  /**
   * Prépare une séquence de questions ordonnées par niveau croissant (1 à 5)
   * Sélectionne les questions disponibles dans le pool pour former le labyrinthe
   * @returns {Array<Object>}
   */
  buildMazeQuestions() {
    // Trier et organiser par niveau croissant de 1 à 5
    const questionsByLevel = {};
    for (let lvl = 1; lvl <= 5; lvl++) {
      questionsByLevel[lvl] = this.questionsPool.filter((q) => q.level === lvl);
    }

    const mazeQuestions = [];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const pool = questionsByLevel[lvl];
      if (pool && pool.length > 0) {
        // Ajoute toutes les questions du niveau pour un parcours immersif complet
        mazeQuestions.push(...pool);
      }
    }

    // Si aucune question n'est trouvée (sécurité fallback)
    if (mazeQuestions.length === 0) {
      mazeQuestions.push({
        id: 'fallback_q1',
        level: 1,
        text: 'Un piège binaire se dresse devant toi. Que fais-tu ?',
        choices: ['Avancer prudemment', 'Fuir en arrière', 'Débrancher le câble', 'Crier'],
        correctAnswer: 0,
        points: 100,
      });
    }

    return mazeQuestions;
  }

  /**
   * Initialise une nouvelle partie pour un joueur authentifié via le Hub
   * @param {string} fsqToken
   * @returns {Promise<Object>}
   */
  async startGame(fsqToken) {
    // 1. Appel du Hub pour identifier le joueur
    const playerInfo = await hubService.getPlayerInfo(fsqToken);

    // 2. Génération de la séquence de questions du labyrinthe
    const mazeQuestions = this.buildMazeQuestions();

    // 3. Création de la session en mémoire
    const session = sessionStore.createSession({
      playerId: playerInfo.playerId,
      pseudo: playerInfo.pseudo,
      level: playerInfo.level,
      scoreMax: config.scoreMax,
      maxErrors: config.maxErrors,
      questions: mazeQuestions,
    });

    // 4. Première question sans la réponse secrète
    const firstQuestion = this.sanitizeQuestion(mazeQuestions[0]);

    return {
      sessionId: session.sessionId,
      player: {
        playerId: session.playerId,
        pseudo: session.pseudo,
        level: session.playerHubLevel,
      },
      gameState: {
        gameStatus: session.gameStatus,
        currentLevel: mazeQuestions[0]?.level || 1,
        intersectionIndex: 0,
        totalIntersections: mazeQuestions.length,
        score: session.score,
        scoreMax: session.scoreMax,
        errors: session.errors,
        maxErrors: session.maxErrors,
        visualFeedback: session.visualFeedback,
      },
      currentQuestion: firstQuestion,
    };
  }

  /**
   * Retourne la question de l'intersection courante pour une session
   * @param {string} sessionId
   * @returns {Object}
   */
  getCurrentQuestion(sessionId) {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      const err = new Error(`Session '${sessionId}' introuvable.`);
      err.statusCode = 404;
      throw err;
    }

    if (session.gameStatus !== 'IN_PROGRESS') {
      const err = new Error(`La partie est terminée (${session.gameStatus}).`);
      err.statusCode = 400;
      throw err;
    }

    const currentRaw = session.questions[session.intersectionIndex];
    if (!currentRaw) {
      const err = new Error('Aucune question disponible à cette intersection.');
      err.statusCode = 404;
      throw err;
    }

    return {
      sessionId: session.sessionId,
      intersectionIndex: session.intersectionIndex,
      totalIntersections: session.questions.length,
      currentLevel: currentRaw.level,
      question: this.sanitizeQuestion(currentRaw),
    };
  }

  /**
   * Valide la réponse soumise à une intersection et fait évoluer l'état de la partie
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {string} params.questionId
   * @param {number|string} params.answer
   * @param {string} params.chosenDirection - 'LEFT' ou 'RIGHT'
   * @returns {Promise<Object>}
   */
  async processAnswer({ sessionId, questionId, answer, chosenDirection }) {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      const err = new Error(`Session '${sessionId}' introuvable.`);
      err.statusCode = 404;
      throw err;
    }

    if (session.gameStatus !== 'IN_PROGRESS') {
      const err = new Error(`Action impossible : la partie est déjà terminée (${session.gameStatus}).`);
      err.statusCode = 400;
      throw err;
    }

    const currentIndex = session.intersectionIndex;
    const currentQuestion = session.questions[currentIndex];

    if (!currentQuestion) {
      const err = new Error('Aucune question active à cette intersection.');
      err.statusCode = 400;
      throw err;
    }

    // Vérification de cohérence questionId
    if (questionId && currentQuestion.id !== questionId) {
      const err = new Error(`Le questionId fourni (${questionId}) ne correspond pas à l'intersection active (${currentQuestion.id}).`);
      err.statusCode = 400;
      throw err;
    }

    // 1. Détection de la validité de la réponse
    let isCorrect = false;

    if (typeof answer === 'number') {
      isCorrect = answer === currentQuestion.correctAnswer;
    } else if (typeof answer === 'string') {
      // Correspondance soit avec le texte exact du choix, soit avec l'index sous forme de string ("0", "1", ...)
      const parsedNum = parseInt(answer, 10);
      if (!isNaN(parsedNum)) {
        isCorrect = parsedNum === currentQuestion.correctAnswer;
      } else {
        const expectedChoice = currentQuestion.choices[currentQuestion.correctAnswer];
        isCorrect = expectedChoice && expectedChoice.trim().toLowerCase() === answer.trim().toLowerCase();
      }
    }

    // 2. Calcul du score et conséquences
    let newScore = session.score;
    let newErrors = session.errors;
    let pointsAwarded = 0;

    const visualFeedback = {
      signBroken: false,
      entityState: 'CALM',
      lightsOff: false,
    };

    if (isCorrect) {
      // Bonne réponse : calcul des points basé sur le niveau
      pointsAwarded = currentQuestion.points || (currentQuestion.level * 20 + 40);
      newScore = Math.min(session.scoreMax, session.score + pointsAwarded);
      visualFeedback.signBroken = false;
      visualFeedback.entityState = 'CALM';
      visualFeedback.lightsOff = false;
    } else {
      // Mauvaise réponse : compteur d'erreurs incrémenté, panneau brisé, entité énervée
      newErrors = session.errors + 1;
      visualFeedback.signBroken = true;
      visualFeedback.entityState = 'ANGRY';
      visualFeedback.lightsOff = false;
    }

    // 3. Enregistrement dans l'historique du chemin (pathHistory)
    const pathEntry = {
      intersectionIndex: currentIndex,
      questionId: currentQuestion.id,
      chosenDirection,
      isCorrect,
      level: currentQuestion.level,
      pointsEarned: pointsAwarded,
      timestamp: new Date().toISOString(),
    };
    const updatedPathHistory = [...session.pathHistory, pathEntry];

    // 4. Évaluation des conditions de fin de partie
    let nextGameStatus = 'IN_PROGRESS';
    let nextIntersectionIndex = currentIndex + 1;
    let nextQuestion = null;
    let nextDirection = chosenDirection;
    let hubSyncResult = null;

    // Défaite immédiate : 6 erreurs atteintes
    if (newErrors >= session.maxErrors) {
      nextGameStatus = 'GAME_OVER_HACK';
      visualFeedback.signBroken = true;
      visualFeedback.entityState = 'SMILING_IN_DARK';
      visualFeedback.lightsOff = true;
      nextQuestion = null;
      nextDirection = null;

      // Synchronisation automatique de fin de partie avec le Hub
      hubSyncResult = await hubService.sendScore({
        playerId: session.playerId,
        score: newScore,
        gameStatus: nextGameStatus,
        errors: newErrors,
        currentLevel: currentQuestion.level,
      });
    }
    // Victoire : Toutes les questions complétées avec moins de 6 erreurs
    else if (nextIntersectionIndex >= session.questions.length) {
      nextGameStatus = 'VICTORY';
      visualFeedback.signBroken = false;
      visualFeedback.entityState = 'VANISHED';
      visualFeedback.lightsOff = false;
      nextQuestion = null;
      nextDirection = null;

      // Synchronisation automatique de fin de partie avec le Hub
      hubSyncResult = await hubService.sendScore({
        playerId: session.playerId,
        score: newScore,
        gameStatus: nextGameStatus,
        errors: newErrors,
        currentLevel: currentQuestion.level,
      });
    }
    // Continuation du jeu
    else {
      const nextRaw = session.questions[nextIntersectionIndex];
      nextQuestion = this.sanitizeQuestion(nextRaw);
    }

    const currentLevel = nextQuestion ? nextQuestion.level : currentQuestion.level;

    // 5. Mise à jour de la session dans le store
    sessionStore.updateSession(sessionId, {
      score: newScore,
      errors: newErrors,
      intersectionIndex: nextIntersectionIndex,
      currentLevel,
      pathHistory: updatedPathHistory,
      gameStatus: nextGameStatus,
      visualFeedback,
      hubSyncResult,
    });

    // 6. Retour conforme à la spécification attendue pour le moteur graphique Python
    return {
      isCorrect,
      gameStatus: nextGameStatus,
      score: newScore,
      scoreMax: session.scoreMax,
      currentLevel,
      errors: newErrors,
      maxErrors: session.maxErrors,
      visualFeedback,
      nextDirection,
      nextQuestion,
      hubSyncResult,
    };
  }

  /**
   * Retourne l'état complet d'une session de jeu
   * @param {string} sessionId
   * @returns {Object}
   */
  getGameStatus(sessionId) {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      const err = new Error(`Session '${sessionId}' introuvable.`);
      err.statusCode = 404;
      throw err;
    }

    return {
      sessionId: session.sessionId,
      playerId: session.playerId,
      pseudo: session.pseudo,
      gameStatus: session.gameStatus,
      currentLevel: session.currentLevel,
      intersectionIndex: session.intersectionIndex,
      totalIntersections: session.questions.length,
      score: session.score,
      scoreMax: session.scoreMax,
      errors: session.errors,
      maxErrors: session.maxErrors,
      pathHistory: session.pathHistory,
      visualFeedback: session.visualFeedback,
      hubSyncResult: session.hubSyncResult,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = new GameService();
