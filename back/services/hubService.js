const config = require('../config/env');

/**
 * Service de communication avec l'API externe du Hub (FSQ Hub)
 * Respecte strictement le contrat d'interface v1 (2 appels uniquement) :
 * 1. GET  <HUB_API_URL>/api/v1/me     (avec fsq_token pour identifier le joueur)
 * 2. POST <HUB_API_URL>/api/v1/scores (avec header de sécurité X-Game-Key)
 */
class HubService {
  /**
   * Récupère le profil joueur auprès du Hub à partir du jeton fsq_token
   * @param {string} fsqToken - Jeton de session transmis par le Front
   * @returns {Promise<{playerId: string, pseudo: string, level: number}>}
   */
  async getPlayerInfo(fsqToken) {
    if (!fsqToken) {
      throw new Error('fsq_token manquant');
    }

    // Mode Mock activé dans l'environnement
    if (config.mockHub) {
      console.log(`[HubService] Mode MOCK actif : profil simulé pour le jeton ${fsqToken.substring(0, 8)}...`);
      return {
        playerId: 'player_mock_001',
        pseudo: 'ShadowRunner',
        level: 1,
      };
    }

    const url = new URL(`${config.hubApiUrl}/api/v1/me`);
    // Transmission du fsq_token en query param ET en header pour compatibilité maximale
    url.searchParams.append('fsq_token', fsqToken);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${fsqToken}`,
          'X-FSQ-Token': fsqToken,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Erreur Hub GET /api/v1/me (Statut ${response.status}): ${errorBody}`);
      }

      const data = await response.json();

      return {
        playerId: data.playerId || `player_${Date.now()}`,
        pseudo: data.pseudo || 'Anonyme',
        level: typeof data.level === 'number' ? data.level : 1,
      };
    } catch (error) {
      console.error(`[HubService] Échec appel GET /api/v1/me : ${error.message}`);

      // En environnement de dev si le hub n'est pas joignable, fallback sécurisé
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[HubService] Fallback automatique vers mock en développement');
        return {
          playerId: 'player_fallback_dev',
          pseudo: 'HackerInTheDark',
          level: 1,
        };
      }

      throw error;
    }
  }

  /**
   * Envoie le score de fin de partie au Hub avec authentification X-Game-Key
   * @param {Object} scoreData
   * @param {string} scoreData.playerId
   * @param {number} scoreData.score
   * @param {string} scoreData.gameStatus - 'VICTORY' ou 'GAME_OVER_HACK'
   * @param {number} [scoreData.errors]
   * @param {number} [scoreData.currentLevel]
   * @returns {Promise<{accepted: boolean, xpGained: number}>}
   */
  async sendScore({ playerId, score, gameStatus, errors = 0, currentLevel = 1 }) {
    if (!playerId) {
      throw new Error('playerId manquant pour la soumission du score');
    }

    const safeScore = Math.max(0, Math.min(config.scoreMax, Math.round(score)));

    // Mode Mock activé dans l'environnement
    if (config.mockHub) {
      const mockXp = gameStatus === 'VICTORY'
        ? Math.round(safeScore * 0.25) + 50
        : Math.round(safeScore * 0.10);

      console.log(`[HubService] Mode MOCK actif : envoi score simulé (Score: ${safeScore}, Statut: ${gameStatus}, XP calculé: ${mockXp})`);
      return {
        accepted: true,
        xpGained: mockXp,
      };
    }

    const targetUrl = `${config.hubApiUrl}/api/v1/scores`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Game-Key': config.xGameKey,
        },
        body: JSON.stringify({
          playerId,
          score: safeScore,
          gameStatus,
          errors,
          levelReached: currentLevel,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok && response.status !== 201) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Erreur Hub POST /api/v1/scores (Statut ${response.status}): ${errorBody}`);
      }

      const result = await response.json();

      return {
        accepted: result.accepted !== false,
        xpGained: typeof result.xpGained === 'number' ? result.xpGained : 0,
      };
    } catch (error) {
      console.error(`[HubService] Échec appel POST /api/v1/scores : ${error.message}`);

      // Fallback gracieux en dev ou si le Hub est indisponible afin de ne pas bloquer le front
      return {
        accepted: false,
        xpGained: 0,
        syncError: error.message,
      };
    }
  }
}

module.exports = new HubService();
