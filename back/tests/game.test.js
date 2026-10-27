const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

let server;
let baseUrl;

describe('Quizz_Hack API Back-end Tests', () => {
  before(async () => {
    // Démarrage sur un port dynamique pour les tests
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('GET /health retourne 200 et statut OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'OK');
    assert.ok(body.service);
  });

  test('POST /api/game/start refuse sans fsq_token', async () => {
    const res = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('POST /api/game/start initialise une session complète', async () => {
    const res = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'valid_test_token_123' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();

    assert.ok(body.sessionId);
    assert.equal(body.player.pseudo, 'ShadowRunner');
    assert.equal(body.gameState.gameStatus, 'IN_PROGRESS');
    assert.equal(body.gameState.score, 0);
    assert.equal(body.gameState.errors, 0);
    assert.equal(body.gameState.maxErrors, 6);
    assert.equal(body.gameState.scoreMax, 1000);

    // Vérifie que la réponse secrète n'est PAS exposée
    assert.ok(body.currentQuestion);
    assert.ok(body.currentQuestion.id);
    assert.ok(body.currentQuestion.text);
    assert.ok(Array.isArray(body.currentQuestion.choices));
    assert.equal(body.currentQuestion.correctAnswer, undefined);
    assert.equal(body.currentQuestion.explanation, undefined);
  });

  test('GET /api/game/question retourne la question courante', async () => {
    // 1. Start game
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_q' }),
    });
    const session = await startRes.json();

    // 2. Get current question
    const res = await fetch(`${baseUrl}/api/game/question?sessionId=${session.sessionId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sessionId, session.sessionId);
    assert.equal(body.intersectionIndex, 0);
    assert.ok(body.question);
    assert.equal(body.question.correctAnswer, undefined);
  });

  test('POST /api/game/answer gère une BONNE réponse (points, direction, CALM)', async () => {
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_good_answer' }),
    });
    const session = await startRes.json();
    const q1 = session.currentQuestion;

    // Réponse correcte à la question 1 (index 1)
    const ansRes = await fetch(`${baseUrl}/api/game/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        questionId: q1.id,
        answer: 1,
        chosenDirection: 'LEFT',
      }),
    });

    assert.equal(ansRes.status, 200);
    const result = await ansRes.json();

    assert.equal(result.isCorrect, true);
    assert.ok(result.score > 0);
    assert.equal(result.errors, 0);
    assert.equal(result.visualFeedback.signBroken, false);
    assert.equal(result.visualFeedback.entityState, 'CALM');
    assert.equal(result.visualFeedback.lightsOff, false);
    assert.equal(result.nextDirection, 'LEFT');
    assert.ok(result.nextQuestion);
  });

  test('POST /api/game/answer gère une MAUVAISE réponse (signBroken, ANGRY, errors++)', async () => {
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_wrong_answer' }),
    });
    const session = await startRes.json();
    const q1 = session.currentQuestion;

    // Mauvaise réponse (index 0 au lieu de 1)
    const ansRes = await fetch(`${baseUrl}/api/game/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        questionId: q1.id,
        answer: 0,
        chosenDirection: 'RIGHT',
      }),
    });

    assert.equal(ansRes.status, 200);
    const result = await ansRes.json();

    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
    assert.equal(result.errors, 1);
    assert.equal(result.visualFeedback.signBroken, true);
    assert.equal(result.visualFeedback.entityState, 'ANGRY');
    assert.equal(result.visualFeedback.lightsOff, false);
    assert.equal(result.nextDirection, 'RIGHT');
  });

  test('Défaite : 6 mauvaises réponses déclenchent GAME_OVER_HACK et lightsOff', async () => {
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_game_over' }),
    });
    const session = await startRes.json();

    let lastResult = null;
    let currentQ = session.currentQuestion;

    // Faire 6 mauvaises réponses consécutives
    for (let i = 0; i < 6; i++) {
      const ansRes = await fetch(`${baseUrl}/api/game/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          questionId: currentQ.id,
          answer: 999, // Réponse erronée garantie
          chosenDirection: i % 2 === 0 ? 'LEFT' : 'RIGHT',
        }),
      });
      lastResult = await ansRes.json();
      currentQ = lastResult.nextQuestion;
    }

    assert.equal(lastResult.isCorrect, false);
    assert.equal(lastResult.errors, 6);
    assert.equal(lastResult.gameStatus, 'GAME_OVER_HACK');
    assert.equal(lastResult.visualFeedback.lightsOff, true);
    assert.equal(lastResult.visualFeedback.entityState, 'SMILING_IN_DARK');
    assert.equal(lastResult.visualFeedback.signBroken, true);
    assert.equal(lastResult.nextQuestion, null);
    // Vérification de la synchronisation Hub automatique
    assert.ok(lastResult.hubSyncResult);
    assert.equal(lastResult.hubSyncResult.accepted, true);
  });

  test('Victoire : Répondre à toutes les questions déclenche VICTORY et sync Hub', async () => {
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_victory' }),
    });
    const session = await startRes.json();

    // Bonnes réponses pour le dataset questions.json
    // q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 0, q9: 0, q10: 2
    const correctAnswers = [1, 1, 1, 1, 1, 1, 1, 0, 0, 2];

    let lastResult = null;
    let currentQ = session.currentQuestion;

    for (let i = 0; i < 10; i++) {
      const ansRes = await fetch(`${baseUrl}/api/game/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          questionId: currentQ.id,
          answer: correctAnswers[i],
          chosenDirection: 'RIGHT',
        }),
      });
      lastResult = await ansRes.json();
      currentQ = lastResult.nextQuestion;
    }

    assert.equal(lastResult.isCorrect, true);
    assert.equal(lastResult.errors, 0);
    assert.equal(lastResult.gameStatus, 'VICTORY');
    assert.equal(lastResult.score, 1000);
    assert.equal(lastResult.visualFeedback.signBroken, false);
    assert.equal(lastResult.visualFeedback.entityState, 'VANISHED');
    assert.equal(lastResult.visualFeedback.lightsOff, false);
    assert.equal(lastResult.nextQuestion, null);
    assert.ok(lastResult.hubSyncResult);
    assert.equal(lastResult.hubSyncResult.accepted, true);
    assert.ok(lastResult.hubSyncResult.xpGained > 0);
  });

  test('GET /api/game/status/:sessionId retourne l’historique et l’état du joueur', async () => {
    const startRes = await fetch(`${baseUrl}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsq_token: 'tok_test_status' }),
    });
    const session = await startRes.json();

    // 1 réponse
    await fetch(`${baseUrl}/api/game/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        questionId: session.currentQuestion.id,
        answer: 1,
        chosenDirection: 'LEFT',
      }),
    });

    const statusRes = await fetch(`${baseUrl}/api/game/status/${session.sessionId}`);
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();

    assert.equal(statusBody.sessionId, session.sessionId);
    assert.equal(statusBody.pseudo, 'ShadowRunner');
    assert.equal(statusBody.pathHistory.length, 1);
    assert.equal(statusBody.pathHistory[0].chosenDirection, 'LEFT');
    assert.equal(statusBody.pathHistory[0].isCorrect, true);
  });
});
