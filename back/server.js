const app = require('./app');
const config = require('./config/env');

const server = app.listen(config.port, () => {
  console.log('========================================================');
  console.log(`💀 QUIZZ_HACK API BACK-END DÉMARRÉE SUR LE PORT ${config.port}`);
  console.log(`🌐 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Hub API URL: ${config.hubApiUrl}`);
  console.log(`🧪 Hub Mock Mode: ${config.mockHub ? 'ACTIVÉ (Développement local)' : 'DÉSACTIVÉ (Production)'}`);
  console.log(`🎯 Score Max: ${config.scoreMax} pts | Erreurs Max: ${config.maxErrors}`);
  console.log('========================================================');
});

// Arrêt propre (graceful shutdown)
const shutdown = () => {
  console.log('\n[Server] Arrêt du serveur Express en cours...');
  server.close(() => {
    console.log('[Server] Serveur arrêté proprement.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
