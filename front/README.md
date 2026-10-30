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

À la première entrée dans un onglet, l'intro passe d'abord : `[ESPACE]` ou `[ENTRÉE]` pour la passer. Pour la revoir, ouvrez un nouvel onglet, ou utilisez `__qhIntro()` dans la console.

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
| `__qhIntro('van')` | rejoue l'intro depuis une étape : `news`, `pull`, `watch`, `pocket`, `look`, `van`, `door`, `run`, `swing`, `black` |
| `__qhIntroTime = 29` | fige l'intro à cet instant (s) ; `delete __qhIntroTime` pour reprendre |
| `__qhScare('jump')` | rejoue une étape de la scène du dossier, une fois lancée en refermant le dossier : `dim`, `dark`, `torch`, `jump`, `kick`, `drop`, `pick`, `search`, `restore` |
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

La musique vient de la radio posée au milieu du niveau (`maze/radioSpot.ts`, `scene/RadioCorner.tsx`) : elle monte quand on s'en approche et s'étouffe derrière les murs.

Le cœur bat tu-TUN : un coup court et léger, puis un coup long et grave (`heartbeat` dans `recipes/events.ts`, quatre variantes). Il n'est pas un métronome : `heartbeatInterval` dans `mix.ts` décale chaque battement.

Certains monstres hurlent avant de parler (`scream` dans `audio/spatial.ts`). Le geste qui détruit le panneau dépend du monstre : `scene/entities/signBreak.ts`.

Dans le jeu, `[M]` coupe le son, `[-]` et `[+]` règlent le volume ; le réglage est mémorisé.

## L'intro

À la première entrée dans un onglet, sans session à reprendre, une scène en 3D passe avant le jeu : le bulletin d'information plein écran, un seul recul jusqu'au téléphone dans les mains, le téléphone dans la poche, la pluie et le brouillard, la camionnette qui freine, la porte qui glisse, la fuite, la batte. Elle ne repasse pas au rechargement ni à `[RECOMMENCER]`, et `[ESPACE]` ou `[ENTRÉE]` la passe.

- `scene/intro/introMotion.ts` : tous les mouvements, en fonctions pures du temps. `INTRO_TIMELINE` dans `app/sequence.ts` : les étapes.
- `scene/intro/IntroCast.tsx` : les mains, le téléphone, les tueurs à gages. `IntroVehicles.tsx` : la camionnette et les voitures. `IntroStreet.tsx` : la rue, la pluie, le brouillard.
- `app/newsBroadcast.ts` : l'image du bulletin et ses sous-titres, calés sur `public/audio/news-broadcast-1.wav`.

La scène est chargée à part et démontée avant le jeu : elle ne pèse rien sur l'écran-titre.

## Le dossier du médecin

Sur la table, à côté de la radio, le dossier des sujets du médecin s'ouvre avec `[E]` ; ses pages se tournent aux flèches du clavier ou à la souris (`app/victimFile.ts`, `app/FileOverlay.tsx`). La dernière fiche porte le pseudo du joueur.

Le refermer déclenche la scène de peur, une seule fois par partie, sans rien envoyer au serveur :

1. Le joueur marche encore pendant que les lampes meurent une à une, la plus proche en dernier.
2. Noir total, sans aucune lueur : à partir d'ici, tout est écrit. Le joueur ne contrôle plus rien.
3. Il allume sa lampe torche, regarde à droite, à gauche, puis droit devant. Le médecin attend dans le noir et ne se voit que dans le faisceau. Il lui saute dessus.
4. Le coup de pied le repousse et fait tomber la lampe. Le joueur se baisse pour la ramasser et braque le couloir : personne. Les lampes reviennent, et le joueur reprend la main.

Le dossier a alors disparu de la table, et il ne reste que le cœur et les pas jusqu'à la fin de la partie (`mixFor` dans `audio/mix.ts`). Les verdicts et les fins se jouent normalement, mais la radio reste morte. La scène est mémorisée pour la session : une partie reprise ne la rejoue pas, une nouvelle partie la retrouve.

- `scene/scareMotion.ts` : les lampes, la lampe torche, le regard, le médecin, en fonctions pures. `SCARE_TIMELINE` dans `app/sequence.ts` : les étapes.
- `maze/scareLane.ts` : d'où vient le médecin, selon l'endroit où le joueur s'est arrêté.
- `scene/ScareDoctor.tsx` : le médecin, la lampe torche, la jambe du joueur. Tout reste monté et le nombre de lumières ne change pas : rien ne se compile pendant la scène.

## Vérifications

```bash
npm test
npx tsc -b
npx oxlint src
```
