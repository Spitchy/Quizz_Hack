const { randomUUID } = require('crypto');

/**
 * Gestionnaire de stockage en mémoire des sessions de jeu
 * Modulaire et facilement remplaçable par Redis ou une base SQL/NoSQL en production
 */
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Crée une nouvelle session de jeu
   * @param {Object} initialData
   * @returns {Object} Session créée
   */
  createSession(initialData) {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session = {
      sessionId,
      playerId: initialData.playerId,
      pseudo: initialData.pseudo || 'Anonyme',
      playerHubLevel: initialData.level || 1,
      currentLevel: 1,
      intersectionIndex: 0,
      score: 0,
      scoreMax: initialData.scoreMax || 1000,
      errors: 0,
      maxErrors: initialData.maxErrors || 6,
      pathHistory: [],
      questions: initialData.questions || [],
      gameStatus: 'IN_PROGRESS',
      visualFeedback: {
        signBroken: false,
        entityState: 'CALM',
        lightsOff: false,
      },
      hubSyncResult: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Récupère une session par son ID
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Met à jour les données d'une session
   * @param {string} sessionId
   * @param {Object} updates
   * @returns {Object} Session mise à jour
   */
  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session introuvable: ${sessionId}`);
    }

    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  /**
   * Supprime une session
   * @param {string} sessionId
   * @returns {boolean}
   */
  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Nettoie les sessions inactives (optionnel, utile en production)
   * @param {number} maxAgeMs
   */
  cleanupOldSessions(maxAgeMs = 1000 * 60 * 60 * 2) {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      const sessionAge = now - new Date(session.updatedAt).getTime();
      if (sessionAge > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Nombre de sessions actives
   * @returns {number}
   */
  get count() {
    return this.sessions.size;
  }
}

module.exports = new SessionStore();
