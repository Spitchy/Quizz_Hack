# Quizz_Hack : front

Le jeu Guess or Die (Vite, React, TypeScript, react-three-fiber). Pour tout lancer avec le back, voir le [README du projet](../README.md).

## Jouer sans le back

Le front embarque un faux serveur conforme au contrat d'API. Dans `.env.local` :

```
VITE_API_MOCK=true
```

Puis `npm run dev`, http://localhost:5173 et **[ ENTRER ]**, sans jeton.

## Réglages

| Variable (`.env.local`) | Effet |
| --- | --- |
| `VITE_API_BASE_URL` | adresse du back (par défaut `http://localhost:3000`) |
| `VITE_API_MOCK` | `true` : faux serveur intégré, sans le back |
| `VITE_MAZE_LAYOUT` | `corridor` : couloir droit de test, sinon le labyrinthe |
| `VITE_SHOW_ANSWERS` | `true` : bonnes réponses cochées (en dev, avec le faux serveur seulement) |

Dans l'URL, `?maze=corridor` et `?answers` font la même chose que les deux derniers.

## Vérifications

```bash
npm test
npx tsc -b
npx oxlint src
```
