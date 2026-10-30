// Cadence des pas : un pas par foulée réellement parcourue. Contre un mur ou à
// l'arrêt, le joueur n'avance pas, donc rien ne sonne. Pur et testable.

/** Longueur d'une foulée (m) : à la vitesse de marche, le rythme du balancement de tête. */
const WALK_STRIDE = 1.33
const RUN_STRIDE = 1.6
/** Le premier pas tombe vite après l'arrêt : on repart le pied déjà levé. */
const RESTART_AT = 0.72
const REST_SECONDS = 0.25
const STILL = 1e-4

const MIN_GAP = 0.2

export interface Stride {
  travelled: number
  rest: number
  sinceStep: number
  foot: 0 | 1
}

export const createStride = (): Stride => ({ travelled: WALK_STRIDE * RESTART_AT, rest: 0, sinceStep: MIN_GAP, foot: 0 })

/** Fait avancer la foulée de `distance` m ; vrai si un pied touche le sol à cet instant. */
export function advanceStride(stride: Stride, distance: number, dt: number, running: boolean): boolean {
  const length = running ? RUN_STRIDE : WALK_STRIDE
  if (distance < STILL) {
    stride.rest += dt
    if (stride.rest > REST_SECONDS) stride.travelled = Math.max(stride.travelled, length * RESTART_AT)
    return false
  }
  stride.rest = 0
  stride.sinceStep += dt
  stride.travelled += distance
  if (stride.travelled < length) return false
  stride.travelled %= length
  // Déplacé d'un coup (il titube, on le place) : un seul pas, pas une rafale.
  if (stride.sinceStep < MIN_GAP) return false
  stride.sinceStep = 0
  stride.foot = stride.foot ? 0 : 1
  return true
}
