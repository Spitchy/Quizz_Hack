import type { Archetype, EntityLook } from './archetypes'

// Comment un monstre détruit son panneau quand on se trompe : chacun a ses
// gestes, et deux entités du même type n'ont pas forcément les mêmes. Le
// déroulé est pur (testable) ; la matière qui vole est dans `signDebris.ts`.

export type SignBreak =
  /** Cassé en deux, les moitiés pendent de ses mains (aussi : partie reprise). */
  | 'snap'
  /** Il arme son geste et le jette au loin. */
  | 'throw'
  /** Il l'écrase entre ses mains en boule, et la laisse tomber. */
  | 'crumple'
  /** Il le déchire en deux, tire, et jette les moitiés de chaque côté. */
  | 'tear'
  /** Il le lève bien haut et l'abat devant lui : il éclate. */
  | 'smash'
  /** Il l'attire contre lui et l'avale. */
  | 'devour'

const STYLES: Record<Archetype, readonly SignBreak[]> = {
  tall: ['tear', 'smash'],
  mannequin: ['throw', 'smash'],
  crawler: ['throw', 'tear'],
  child: ['crumple', 'throw'],
  crt: ['crumple', 'smash'],
  cluster: ['devour', 'crumple'],
}

/** Le geste de cette entité : déterminé par son apparence, donc stable d'une image à l'autre. */
export function breakFor(look: Pick<EntityLook, 'archetype' | 'phase'>): SignBreak {
  const styles = STYLES[look.archetype]
  return styles[Math.floor(look.phase * 7) % styles.length]
}

/** Instant (s) où le panneau quitte ses mains, ou se rompt ; `null` : il ne les quitte pas. */
export const BREAK_RELEASE: Record<SignBreak, number | null> = {
  snap: null,
  throw: 0.36,
  crumple: 0.72,
  tear: 0.5,
  smash: 0.52,
  devour: 0.85,
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Monte en douceur de 0 à 1 entre `a` et `b`. */
export function ramp(a: number, b: number, t: number): number {
  const k = clamp01((t - a) / (b - a))
  return k * k * (3 - 2 * k)
}

/** Où en sont les mains et le panneau, écrit à chaque image dans l'état d'animation. */
export interface SignGesture {
  /** Panneau levé (m). */
  signLift: number
  /** Panneau poussé vers l'avant (m). */
  signPush: number
  /** Panneau basculé (rad). */
  signTilt: number
  /** Mains rapprochées (0..1) ou écartées (négatif). */
  squeeze: number
  /** Mains libres : 0 sur le panneau, 1 revenues à leur pose. */
  free: number
}

export const restGesture = (): SignGesture => ({ signLift: 0, signPush: 0, signTilt: 0, squeeze: 0, free: 0 })

/** Écrit le geste à `since` secondes de la rupture (`null` : panneau intact). */
export function writeGesture(out: SignGesture, style: SignBreak, since: number | null): void {
  out.signLift = 0
  out.signPush = 0
  out.signTilt = 0
  out.squeeze = 0
  out.free = 0
  if (since === null) return
  const t = since
  switch (style) {
    case 'throw':
      out.signLift = 0.22 * ramp(0, 0.3, t)
      out.signPush = -0.24 * ramp(0, 0.3, t) + 0.5 * ramp(0.28, 0.38, t)
      out.signTilt = -0.5 * ramp(0, 0.3, t) + 0.8 * ramp(0.28, 0.38, t)
      out.free = ramp(0.36, 0.62, t)
      return
    case 'smash':
      out.signLift = 0.4 * ramp(0, 0.36, t) - 0.72 * ramp(0.36, 0.52, t)
      out.signPush = 0.2 * ramp(0.36, 0.52, t)
      out.signTilt = -0.35 * ramp(0, 0.36, t) + 0.9 * ramp(0.36, 0.52, t)
      out.free = ramp(0.52, 0.85, t)
      return
    case 'tear':
      out.signTilt = 0.12 * ramp(0, 0.2, t)
      out.squeeze = -0.22 * ramp(0.05, 0.5, t)
      out.free = ramp(0.5, 0.8, t)
      return
    case 'crumple':
      out.signLift = -0.1 * ramp(0, 0.5, t)
      out.signPush = 0.04 * ramp(0, 0.5, t)
      out.squeeze = 0.84 * ramp(0.02, 0.55, t)
      out.free = ramp(0.7, 0.98, t)
      return
    case 'devour':
      out.signLift = -0.9 * ramp(0.1, 0.85, t)
      out.signPush = -0.1 * ramp(0.1, 0.85, t)
      out.squeeze = 0.7 * ramp(0.1, 0.85, t)
      out.free = ramp(0.85, 1.15, t)
      return
    case 'snap':
      return
  }
}
