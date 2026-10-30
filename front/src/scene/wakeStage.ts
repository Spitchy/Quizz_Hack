import { Vector3 } from 'three'

// Repères de la pièce du réveil (défaite), partagés entre la pièce, le corps
// sanglé, le médecin et la caméra.

export const VIRUS = '#a8e04a'

/** Le joueur, assis et sanglé sur la chaise, face à la table. */
export const CAMERA_POS = new Vector3(0, 1.15, 1.55)

/** Pièce : demi-largeur (x), demi-profondeur (z), hauteur. */
export const ROOM = { halfWidth: 2.2, halfDepth: 2.6, height: 2.8 } as const

/** Porte du mur d'en face, à droite de la table : charnière à gauche, ouvre vers la pièce. */
export const DOOR = { hingeX: 0.875, width: 0.95, height: 2.1, z: -ROOM.halfDepth } as const

/** Le médecin : derrière la porte, juste passé la porte, puis à côté du joueur, à sa droite. */
export const DOCTOR_PATH = [new Vector3(1.35, 0, -3.5), new Vector3(1.35, 0, -2.0), new Vector3(1.1, 0, -0.1), new Vector3(0.95, 0, 0.72)]

/** Avant-bras droit du joueur, sanglé sur l'accoudoir : c'est là que l'aiguille entre. */
export const ARM_TARGET = new Vector3(0.29, 0.73, 1.4)

/**
 * Étapes de l'injection (s depuis son début), partagées avec la caméra : la
 * porte s'ouvre, il entre, s'approche, se penche, plante, pousse le piston.
 */
export const INJECT = {
  door: 0.9,
  enter: 1.0,
  arrive: 3.5,
  lean: 0.5,
  stab: 4.05,
  pushEnd: 5.1,
  lookBack: 5.35,
} as const

/** Tête du médecin (monde), écrite à chaque image : la caméra la suit des yeux. */
export const doctorHead = new Vector3(1.35, 1.9, -3.5)

/** Mise à jour de la position de la tête (hors rendu React). */
export function trackDoctorHead(x: number, y: number, z: number): void {
  doctorHead.set(x, y, z)
}
