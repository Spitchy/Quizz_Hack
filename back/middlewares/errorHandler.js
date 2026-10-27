/**
 * Middleware centralisé de gestion des erreurs
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erreur interne du serveur de jeu';

  if (statusCode >= 500) {
    console.error(`[ErrorHandler] ${req.method} ${req.originalUrl} - ${err.stack || err.message}`);
  } else {
    console.warn(`[ErrorHandler] ${req.method} ${req.originalUrl} (${statusCode}) - ${message}`);
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { details: err.stack }),
  });
}

/**
 * Middleware 404 pour les routes non trouvées
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route introuvable: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
