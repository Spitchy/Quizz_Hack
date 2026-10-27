const gameService = require('../services/gameService');

/**
 * Contrôleur HTTP pour les routes du jeu (/api/game)
 */
class GameController {
  /**
   * POST /api/game/start
   * Démarre une session de jeu après validation du fsq_token auprès du Hub
   */
  async startGame(req, res, next) {
    try {
      const { fsq_token } = req.body;
      const initialGameState = await gameService.startGame(fsq_token);
      return res.status(201).json(initialGameState);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/game/question
   * Retourne la question pour l'intersection active (sans exposer la réponse)
   */
  async getQuestion(req, res, next) {
    try {
      const sessionId = req.sessionId || req.query.sessionId;
      const questionData = gameService.getCurrentQuestion(sessionId);
      return res.status(200).json(questionData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/game/answer
   * Traite la réponse d'un joueur à une intersection et renvoie les conséquences visuelles et mécaniques
   */
  async answerQuestion(req, res, next) {
    try {
      const { sessionId, questionId, answer, chosenDirection } = req.body;
      const result = await gameService.processAnswer({
        sessionId,
        questionId,
        answer,
        chosenDirection,
      });
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/game/status/:sessionId
   * Retourne l'état complet de la session, son score, son historique et son statut
   */
  async getGameStatus(req, res, next) {
    try {
      const { sessionId } = req.params;
      const statusData = gameService.getGameStatus(sessionId);
      return res.status(200).json(statusData);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new GameController();
