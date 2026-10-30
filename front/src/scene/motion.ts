// Mouvements de caméra, en fonctions pures du temps.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export interface BobOffset {
  x: number
  y: number
  roll: number
}

/** Head-bob de marche : ~2 pas par seconde, `intensity` ≥ 0 (vitesse relative). */
export function headBob(time: number, intensity: number): BobOffset {
  const step = time * Math.PI * 2 * 2.1
  return {
    x: Math.cos(step / 2) * 0.03 * intensity,
    y: Math.abs(Math.sin(step)) * 0.055 * intensity,
    roll: Math.cos(step / 2) * 0.012 * intensity,
  }
}

export interface ShakeOffset {
  x: number
  y: number
  yaw: number
  pitch: number
  roll: number
}

/** Secousse « trauma » : amplitude en trauma², bruit de sinus décorrélés. */
export function shakeOffset(trauma: number, time: number): ShakeOffset {
  const a = clamp01(trauma) ** 2
  const n = (f: number, p: number) => Math.sin(time * f + p) * 0.6 + Math.sin(time * f * 2.3 + p * 1.7) * 0.4
  return {
    x: n(37, 0.3) * 0.04 * a,
    y: n(41, 1.1) * 0.04 * a,
    yaw: n(29, 2.2) * 0.03 * a,
    pitch: n(33, 0.7) * 0.03 * a,
    roll: n(23, 3.1) * 0.05 * a,
  }
}

/** Le trauma retombe linéairement (≈ 0,6 s pour passer de 1 à 0). */
export function decayTrauma(trauma: number, dt: number): number {
  return Math.max(0, trauma - dt * 1.7)
}

/** Tremblement permanent qui monte avec le danger. */
export function baseTremor(danger: number): number {
  return clamp01(danger) * 0.45
}
