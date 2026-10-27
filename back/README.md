# 💀 Quizz_Hack - API Back-end Express.js

API Back-end modulaire en **Node.js / Express.js** pour le mini-jeu éducatif horrifique de quiz en labyrinthe à la première personne.

---

## 🏛️ Architecture Globale (Front / Back / Hub)

Le jeu s'insère dans une architecture à 3 tiers :

```text
       ┌──────────────┐
       │   FSQ Hub    │ (Gestionnaire de comptes, scores globaux, XP)
       └──────┬───────┘
              │ (1. Ouvre le jeu avec ?fsq_token=...)
              ▼
       ┌──────────────┐
       │ Front / Jeu  │ (Moteur 3D Python / WebGL / Raycaster)
       └──────┬───────┘
              │ (2. Transmet le fsq_token uniquement à notre Back)
              ▼
  ┌────────────────────────┐
  │   Back Express (Ce repo)│
  │                        ├─────────► GET  /api/v1/me     (Identification)
  │                        ├─────────► POST /api/v1/scores (Header X-Game-Key)
  └────────────────────────┘
```

---

## 📁 Arborescence Complète

```text
back/
├── .env                  # Configuration locale active
├── .env.example          # Gabarit des variables d'environnement
├── package.json          # Dépendances et scripts npm
├── README.md             # Documentation complète
├── server.js             # Point d'entrée HTTP (écoute sur PORT)
├── app.js                # Configuration Express (middlewares, routes)
├── config/
│   └── env.js            # Validation et chargement des variables d'environnement
├── data/
│   └── questions.json    # Banque de questions sur 5 niveaux de difficulté
├── models/
│   └── sessionStore.js   # Gestionnaire de sessions en mémoire (prêt pour Redis/SQL)
├── services/
│   ├── hubService.js     # Contrat v1 strict Hub (GET /api/v1/me, POST /api/v1/scores)
│   └── gameService.js    # Moteur de règles du jeu, labyrinthe, score et erreurs
├── controllers/
│   └── gameController.js # Contrôleur HTTP pour les requêtes du jeu
├── routes/
│   └── gameRoutes.js     # Définition des endpoints REST /api/game/*
├── middlewares/
│   ├── validator.js      # Validation des charges utiles (Payloads)
│   └── errorHandler.js   # Gestionnaire centralisé d'erreurs et 404
└── tests/
    └── game.test.js      # Suite de tests d'intégration automatisés
```

---

## ⚙️ Configuration (.env)

Copiez `.env.example` vers `.env` :

```bash
PORT=3000
HUB_API_URL=https://hub.fsq-games.internal
X_GAME_KEY=game_secret_key_horror_maze_2026_xyz
MOCK_HUB=true
```

- **`PORT`** : Port d'écoute du serveur Node.js (défaut : `3000`).
- **`HUB_API_URL`** : URL racine de l'API externe du Hub.
- **`X_GAME_KEY`** : Clé secrète d'authentification serveur-à-serveur transmise dans l'en-tête `X-Game-Key` pour soumettre les scores.
- **`MOCK_HUB`** : Si mis à `true`, simule les réponses du Hub localement pour développer sans dépendance externe.

---

## 🕹️ Règles Métier et Gameplay

1. **Intersections et Panneaux** :
   Chaque intersection présente une question sur un panneau tenu par une entité terrifiante. Les questions couvrent la cybersécurité (phishing, clés USB piégées, MFA, ransomware, injection SQL, vulnérabilité 0-Day, etc.) sur 5 niveaux.

2. **Système de Score** :
   - `scoreMax` = **1000 points**.
   - Points attribués par bonne réponse selon la difficulté :
     - Niveau 1 : 60 pts
     - Niveau 2 : 80 pts
     - Niveau 3 : 100 pts
     - Niveau 4 : 120 pts
     - Niveau 5 : 140 pts
     *(Total parfait sur 10 intersections = 1000 pts)*.

3. **Conséquences Immédiates** :
   - **Bonne réponse** :
     - `isCorrect: true`
     - Score augmente.
     - `visualFeedback: { signBroken: false, entityState: "CALM", lightsOff: false }`.
     - Choix de direction (`LEFT` ou `RIGHT`) pour courir vers la prochaine intersection.
   - **Mauvaise réponse** :
     - `isCorrect: false`
     - Compteur d'erreurs incrémenté (`errors += 1`).
     - `visualFeedback: { signBroken: true, entityState: "ANGRY", lightsOff: false }`.
     - Avance vers l'intersection suivante dans la direction choisie.

4. **Fin de Partie** :
   - **Défaite (6 erreurs)** :
     - `gameStatus: "GAME_OVER_HACK"`
     - `visualFeedback: { signBroken: true, entityState: "SMILING_IN_DARK", lightsOff: true }`
     - Déclencheur côté client Python : extinction des feux, sourire de l'entité et appel de `trigger_hack_simulation()` (cf. `glitch.py`).
     - Synchronisation automatique du score avec le Hub.
   - **Victoire (Sortie du labyrinthe)** :
     - `gameStatus: "VICTORY"`
     - `visualFeedback: { signBroken: false, entityState: "VANISHED", lightsOff: false }`
     - Synchronisation automatique du score avec le Hub.

---

## 📡 Documentation des Endpoints

### 1. `POST /api/game/start`
Démarre une nouvelle session après identification du joueur auprès du Hub.

- **Requête** :
  ```json
  {
    "fsq_token": "fsq_token_jwt_ou_chaine_reçue"
  }
  ```
- **Réponse (201 Created)** :
  ```json
  {
    "sessionId": "a81bc81b-dead-beef-4242-abcdef123456",
    "player": {
      "playerId": "player_mock_001",
      "pseudo": "ShadowRunner",
      "level": 1
    },
    "gameState": {
      "gameStatus": "IN_PROGRESS",
      "currentLevel": 1,
      "intersectionIndex": 0,
      "totalIntersections": 10,
      "score": 0,
      "scoreMax": 1000,
      "errors": 0,
      "maxErrors": 6,
      "visualFeedback": {
        "signBroken": false,
        "entityState": "CALM",
        "lightsOff": false
      }
    },
    "currentQuestion": {
      "id": "lvl1_q1",
      "level": 1,
      "text": "Une créature pétrifiée tient une clé USB rouillée étiquetée 'CONFIDENTIEL'. Que dois-tu faire ?",
      "choices": [
        "La brancher immédiatement pour inspecter son contenu",
        "Ne pas la brancher et l'isoler (risque de BadUSB / malware)",
        "La formater rapidement sur un poste de travail du labyrinthe",
        "Demander à l'entité si elle contient le mot de passe de sortie"
      ]
    }
  }
  ```

---

### 2. `GET /api/game/question?sessionId=...`
Permet au client de réinterroger la question de l'intersection active.

- **Réponse (200 OK)** :
  ```json
  {
    "sessionId": "a81bc81b-dead-beef-4242-abcdef123456",
    "intersectionIndex": 0,
    "totalIntersections": 10,
    "currentLevel": 1,
    "question": {
      "id": "lvl1_q1",
      "level": 1,
      "text": "Une créature pétrifiée tient une clé USB...",
      "choices": [ ... ]
    }
  }
  ```

---

### 3. `POST /api/game/answer`
Valide la réponse à l'intersection courante et renvoie l'état immédiat pour le moteur visuel.

- **Requête** :
  ```json
  {
    "sessionId": "a81bc81b-dead-beef-4242-abcdef123456",
    "questionId": "lvl1_q1",
    "answer": 1,
    "chosenDirection": "LEFT"
  }
  ```
  *(Note : `answer` accepte soit l'index `0`, `1`, `2`, `3`, soit le texte exact du choix).*

- **Réponse en cours de jeu (200 OK)** :
  ```json
  {
    "isCorrect": true,
    "gameStatus": "IN_PROGRESS",
    "score": 60,
    "scoreMax": 1000,
    "currentLevel": 1,
    "errors": 0,
    "maxErrors": 6,
    "visualFeedback": {
      "signBroken": false,
      "entityState": "CALM",
      "lightsOff": false
    },
    "nextDirection": "LEFT",
    "nextQuestion": {
      "id": "lvl1_q2",
      "level": 1,
      "text": "L'entité te tend un message sanglant...",
      "choices": [ ... ]
    },
    "hubSyncResult": null
  }
  ```

- **Réponse en cas de Défaite (6 erreurs)** :
  ```json
  {
    "isCorrect": false,
    "gameStatus": "GAME_OVER_HACK",
    "score": 120,
    "scoreMax": 1000,
    "currentLevel": 3,
    "errors": 6,
    "maxErrors": 6,
    "visualFeedback": {
      "signBroken": true,
      "entityState": "SMILING_IN_DARK",
      "lightsOff": true
    },
    "nextDirection": null,
    "nextQuestion": null,
    "hubSyncResult": {
      "accepted": true,
      "xpGained": 12
    }
  }
  ```

---

### 4. `GET /api/game/status/:sessionId`
Retourne le statut complet, le score, les erreurs et le parcours (`pathHistory`) du joueur dans le labyrinthe.

- **Réponse (200 OK)** :
  ```json
  {
    "sessionId": "a81bc81b-dead-beef-4242-abcdef123456",
    "playerId": "player_mock_001",
    "pseudo": "ShadowRunner",
    "gameStatus": "IN_PROGRESS",
    "currentLevel": 2,
    "intersectionIndex": 2,
    "totalIntersections": 10,
    "score": 120,
    "scoreMax": 1000,
    "errors": 0,
    "maxErrors": 6,
    "pathHistory": [
      {
        "intersectionIndex": 0,
        "questionId": "lvl1_q1",
        "chosenDirection": "LEFT",
        "isCorrect": true,
        "level": 1,
        "pointsEarned": 60,
        "timestamp": "2026-10-27T10:18:00.000Z"
      }
    ],
    "visualFeedback": {
      "signBroken": false,
      "entityState": "CALM",
      "lightsOff": false
    },
    "hubSyncResult": null
  }
  ```

---

## 🧪 Lancer les Tests et le Serveur

```bash
# Dans le dossier back/
npm install

# Lancer la suite de tests automatisée
npm test

# Démarrer le serveur en mode développement (rechargement à chaud)
npm run dev

# Démarrer en production
npm start
```
