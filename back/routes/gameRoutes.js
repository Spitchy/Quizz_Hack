const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const {
  validateStart,
  validateQuestion,
  validateAnswer,
  validateSessionIdParam,
} = require('../middlewares/validator');

/**
 * @route   POST /api/game/start
 * @desc    Initialise une partie pour un joueur à partir du fsq_token
 * @access  Public (depuis le front avec jeton)
 */
router.post('/start', validateStart, (req, res, next) => gameController.startGame(req, res, next));

/**
 * @route   GET /api/game/question
 * @desc    Récupère la question de l'intersection actuelle
 * @query   sessionId
 * @access  Public
 */
router.get('/question', validateQuestion, (req, res, next) => gameController.getQuestion(req, res, next));

/**
 * @route   POST /api/game/answer
 * @desc    Soumet une réponse et une direction à une intersection du labyrinthe
 * @body    { sessionId, questionId, answer, chosenDirection }
 * @access  Public
 */
router.post('/answer', validateAnswer, (req, res, next) => gameController.answerQuestion(req, res, next));

/**
 * @route   GET /api/game/status/:sessionId
 * @desc    Récupère l'état courant de la partie, le score et le parcours
 * @param   sessionId
 * @access  Public
 */
router.get('/status/:sessionId', validateSessionIdParam, (req, res, next) => gameController.getGameStatus(req, res, next));

module.exports = router;
