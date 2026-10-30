import type { Direction } from '../api/client'

// Réglages de mise en scène (aucune règle de jeu ici).

export const TIMING = {
  /** Réaction de l'entité avant de rendre la main, bonne réponse. */
  feedbackCorrectMs: 1100,
  /** Réaction de l'entité avant de rendre la main, mauvaise réponse (panneau brisé). */
  feedbackWrongMs: 1900,
} as const
// Les fins de partie ont leurs propres étapes : voir `sequence.ts`.

/**
 * `chosenDirection` est encore exigé par le contrat avec chaque réponse, mais
 * n'a plus de sens en déplacement libre (le back ne s'en sert que pour
 * l'historique). On envoie le sens net du virage du joueur depuis sa réponse
 * précédente : yaw croissant = tourné vers la gauche.
 */
export function directionFromTurn(fromYaw: number, toYaw: number): Direction {
  const delta = ((((toYaw - fromYaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return delta >= 0 ? 'LEFT' : 'RIGHT'
}

export type MazeLayout = 'maze' | 'corridor'

/**
 * Disposition du niveau : le vrai labyrinthe, ou un couloir droit pour tester
 * vite (`VITE_MAZE_LAYOUT=corridor`, ou `?maze=corridor` dans l'URL).
 */
export function readMazeLayout(envValue: string | undefined, search: string): MazeLayout {
  const fromUrl = new URLSearchParams(search).get('maze')
  return (fromUrl ?? envValue) === 'corridor' ? 'corridor' : 'maze'
}

/**
 * Mode test : bonnes réponses cochées sur les panneaux. Seulement en dev, avec
 * le mock (lui seul connaît les réponses), via `VITE_SHOW_ANSWERS=true` ou `?answers`.
 */
export function readShowAnswers(dev: boolean, mock: boolean, envValue: string | undefined, search: string): boolean {
  return dev && mock && (envValue === 'true' || new URLSearchParams(search).has('answers'))
}

/** Jeton utilisé en mode mock quand le jeu n'est pas lancé depuis le Hub. */
export const DEV_TOKEN = 'dev-mock-token'
