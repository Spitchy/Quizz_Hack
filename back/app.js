const express = require('express');
const cors = require('cors');
const gameRoutes = require('./routes/gameRoutes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Middlewares globaux
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route de santé / statut API
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Quizz_Hack Back-End Game API',
    timestamp: new Date().toISOString(),
  });
});

// Montage des routes du jeu
app.use('/api/game', gameRoutes);

// Gestion des erreurs 404
app.use(notFoundHandler);

// Gestionnaire d'erreurs centralisé
app.use(errorHandler);

module.exports = app;
