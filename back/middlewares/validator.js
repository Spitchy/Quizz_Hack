/**
 * Middlewares de validation des requêtes pour l'API du jeu
 */

function validateStart(req, res, next) {
  const { fsq_token } = req.body;
  if (!fsq_token || typeof fsq_token !== 'string' || fsq_token.trim() === '') {
    return res.status(400).json({
      error: 'Le champ fsq_token est requis sous forme de chaîne non vide.',
    });
  }
  next();
}

function validateQuestion(req, res, next) {
  const sessionId = req.query.sessionId || req.headers['x-session-id'];
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Le paramètre query ?sessionId=... ou le header x-session-id est requis.',
    });
  }
  req.sessionId = sessionId;
  next();
}

function validateAnswer(req, res, next) {
  const { sessionId, questionId, answer, chosenDirection } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Le champ sessionId est requis.',
    });
  }

  if (answer === undefined || answer === null) {
    return res.status(400).json({
      error: 'Le champ answer est requis (index numérique ou texte du choix).',
    });
  }

  const validDirections = ['LEFT', 'RIGHT'];
  if (!chosenDirection || !validDirections.includes(String(chosenDirection).toUpperCase())) {
    return res.status(400).json({
      error: "Le champ chosenDirection est requis et doit valoir 'LEFT' ou 'RIGHT'.",
    });
  }

  req.body.chosenDirection = String(chosenDirection).toUpperCase();
  next();
}

function validateSessionIdParam(req, res, next) {
  const { sessionId } = req.params;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Le paramètre sessionId dans l\'URL est requis.',
    });
  }
  next();
}

module.exports = {
  validateStart,
  validateQuestion,
  validateAnswer,
  validateSessionIdParam,
};
