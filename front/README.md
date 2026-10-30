# Quizz_Hack : front

Le jeu Guess or Die (Vite, React, TypeScript, react-three-fiber). Pour tout lancer avec le back, voir le [README du projet](../README.md).

## Tester le jeu en local

Le plus rapide : le faux serveur intégré, le couloir droit et les bonnes réponses cochées, sans back ni jeton. Dans `front/.env.local` :

```
VITE_API_MOCK=true
VITE_MAZE_LAYOUT=corridor
VITE_SHOW_ANSWERS=true
```

Puis `npm run dev`, http://localhost:5173 et **[ ENTRER ]**. Relancez `npm run dev` après chaque changement de `.env.local`.

### Options de `.env.local`

| Variable | Valeurs | Effet | Par défaut |
| --- | --- | --- | --- |
| `VITE_API_MOCK` | `true` ou `false` | `true` : faux serveur intégré, sans le back ni jeton | `false` |
| `VITE_MAZE_LAYOUT` | `corridor` ou `maze` | `corridor` : les entités alignées dans un couloir droit, sinon le labyrinthe généré | `maze` |
| `VITE_SHOW_ANSWERS` | `true` ou `false` | `true` : bonne réponse cochée sur les panneaux. Ne marche qu'en dev et avec le faux serveur, car le vrai back n'envoie jamais les réponses | `false` |
| `VITE_API_BASE_URL` | une adresse | adresse du back, ignorée avec le faux serveur | `http://localhost:3000` |

### Options dans l'URL

Elles évitent de modifier `.env.local` et de relancer le serveur.

| Paramètre | Effet |
| --- | --- |
| `?maze=corridor` | couloir droit (passe avant `VITE_MAZE_LAYOUT`) |
| `?maze=maze` | labyrinthe (passe avant `VITE_MAZE_LAYOUT`) |
| `?answers` | bonnes réponses cochées (dev et faux serveur seulement) |
| `?fsq_token=test` | jeton du joueur, nécessaire avec le vrai back |

Elles se combinent : http://localhost:5173/?maze=corridor&answers

### Outils dans la console du navigateur

Disponibles avec `npm run dev` seulement, absents du build de production.

| Commande | Effet |
| --- | --- |
| `__qhTeleport(x, z, yaw, pitch)` | place le joueur (`pitch` est facultatif) |
| `__qhDefeat('wake')` | rejoue une étape de la défaite, une fois la partie perdue : `freeze`, `approach`, `beat`, `knockout`, `wake`, `inject`, `infected`, `over` |
| `__qhPause(true)` | fige l'image pour l'inspecter, `__qhPause(false)` la relance |
| `__qhScene`, `__qhGl` | la scène et le moteur de rendu Three.js, pour les inspecter |
| `__qhAudio()` | l'état du son : moment, couches, niveaux, sons joués |
| `__qhVoices()` | les voix du monde : néons et monstres qui sonnent, étouffement par les murs |

## Le son

Tout passe par `src/audio/`. Le jeu ne charge aucune bibliothèque audio : Web Audio, plus `AudioListener` et `PositionalAudio` de Three.js.

- `mix.ts` : la balance de chaque moment du jeu et la réaction au danger. C'est ici qu'on règle les niveaux.
- `cues.ts` : les sons datés de la mise en scène.
- `recipes/` : les sons générés en code, calculés dans un worker au chargement.
- `samples.ts` et `public/audio/` : les enregistrements, les répliques des monstres et la bande-son, crédités dans [`CREDITS.md`](public/audio/CREDITS.md). Un enregistrement remplace le son généré du même nom ; s'il manque, le son généré reste.
- `engine.ts` : le graphe audio. `stage.ts` : le son dans le monde 3D. `useSoundDirector.ts` : du jeu vers le son.

La musique vient de la radio posée au milieu du niveau (`maze/radioSpot.ts`, `scene/RadioCorner.tsx`) : elle monte quand on s'en approche et s'étouffe derrière les murs. Le journal sur sa table se lit avec `[E]`.

Certains monstres hurlent avant de parler (`scream` dans `audio/spatial.ts`). Le geste qui détruit le panneau dépend du monstre : `scene/entities/signBreak.ts`.

Dans le jeu, `[M]` coupe le son, `[-]` et `[+]` règlent le volume ; le réglage est mémorisé.

## Vérifications

```bash
npm test
npx tsc -b
npx oxlint src
```
