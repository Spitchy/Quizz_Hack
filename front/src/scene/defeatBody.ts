import { Vector3, type Object3D } from 'three'
import type { Vec2 } from '../maze/physics'

// Défaite filmée : ce que le corps du joueur partage avec le sang (hors rendu React).

export interface BodyHit {
  /** Instant du coup (s depuis le début du passage à tabac). */
  at: number
  /** D'où vient le coup (position de l'assaillant). */
  from: Vec2
}

/** Ce que le sang a besoin de savoir du corps, écrit à chaque image. */
export interface BodyProbe {
  head: Vector3
  chest: Vector3
  /** 0..1 : à terre. */
  fall: number
  /** Coups encaissés jusqu'ici. */
  taken: number
}

export const createProbe = (): BodyProbe => ({ head: new Vector3(), chest: new Vector3(), fall: 0, taken: 0 })

/** Écrit la sonde depuis le corps (positions monde de la tête et du torse). */
export function writeProbe(probe: BodyProbe, head: Object3D, spine: Object3D, fall: number, taken: number): void {
  head.getWorldPosition(probe.head)
  spine.localToWorld(probe.chest.set(0, 0.35, 0.05))
  probe.fall = fall
  probe.taken = taken
}
