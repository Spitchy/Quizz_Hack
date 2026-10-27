const dotenv = require('dotenv');
const path = require('path');

// Chargement des variables d'environnement depuis le fichier .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  hubApiUrl: (process.env.HUB_API_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  xGameKey: process.env.X_GAME_KEY || 'default_secret_game_key',
  mockHub: process.env.MOCK_HUB === 'true' || process.env.MOCK_HUB === '1',
  scoreMax: 1000,
  maxErrors: 6,
};

module.exports = config;
