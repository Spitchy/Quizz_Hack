# Quizz_Hack

Guess or Die : un quiz d'horreur à la première personne dans un labyrinthe façon Backrooms.

- `front/` : le jeu (Vite, React, TypeScript, react-three-fiber)
- `back/` : l'API (Express)
- `contracts/openapi.yaml` : le contrat d'API, source de vérité entre les deux

## Lancer le jeu en local

Il faut Git et Node.js 20 ou plus récent, et deux terminaux ouverts en même temps.

```bash
git clone https://github.com/Spitchy/Quizz_Hack
cd Quizz_Hack
```

**Terminal 1 : le back (port 3000), à laisser ouvert**

```bash
cd back
npm install
cp .env.example .env
npm run dev
```

**Terminal 2 : le front (port 5173), depuis la racine du projet**

```bash
cd front
npm install
cp .env.example .env.local
npm run dev
```

Sous l'invite de commandes Windows (cmd), remplacez `cp` par `copy`.

Ensuite, ouvrez ce lien et cliquez sur **[ ENTRER ]** :

http://localhost:5173/?fsq_token=test

Le jeton remplace celui que donne normalement le Hub. `.env.example` active le Hub simulé du back (`MOCK_HUB=true`), le vrai Hub n'est donc pas nécessaire.

## Commandes

| Touche | Action |
| --- | --- |
| ZQSD ou flèches | se déplacer |
| Maj | courir |
| Clic | regarder à la souris |
| E | lire le panneau d'une entité |
| 1 à 4 | répondre |
| Espace | passer une fin de partie |

## Si ça coince

- **« IDENTITÉ INCONNUE / NO_TOKEN »** : le jeton manque, rouvrez le lien avec `?fsq_token=test`.
- **La partie ne démarre pas** : vérifiez que le back tourne toujours dans le terminal 1.
- **Port déjà utilisé** : fermez l'autre instance sur 3000 ou 5173, puis relancez.

## Tester en local sans le back

Dans `front/.env.local` :

```
VITE_API_MOCK=true
VITE_MAZE_LAYOUT=corridor
VITE_SHOW_ANSWERS=true
```

Puis `npm run dev` dans `front/`, http://localhost:5173 et **[ ENTRER ]** : faux serveur intégré, entités alignées dans un couloir droit, bonnes réponses cochées. À la première entrée dans un onglet, l'intro passe d'abord : `[ESPACE]` pour la passer.

| Variable (`front/.env.local`) | Effet |
| --- | --- |
| `VITE_API_MOCK=true` | joue sans le back ni jeton |
| `VITE_MAZE_LAYOUT=corridor` | couloir droit au lieu du labyrinthe |
| `VITE_SHOW_ANSWERS=true` | bonnes réponses cochées (avec le faux serveur seulement) |
| `VITE_API_BASE_URL=...` | adresse du back, `http://localhost:3000` par défaut |

Côté back, `MOCK_HUB=true` dans `back/.env` évite d'avoir besoin du vrai Hub.

Les options dans l'URL et les outils de la console sont décrits dans [`front/README.md`](front/README.md). Pour l'API, voir [`back/README.md`](back/README.md).
