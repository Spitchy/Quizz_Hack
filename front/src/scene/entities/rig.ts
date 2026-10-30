import { LatheGeometry, Vector2, Vector3, type Group } from 'three'
import { solveTwoBone } from './ik'

// Os arrondis et bras articulés des monstres : géométrie et pose, hors rendu
// React (les composants sont dans `parts.tsx`).

const UP = new Vector3(0, 1, 0)

/**
 * Os arrondi : cylindre effilé fermé par deux demi-sphères de même rayon que
 * ses bouts. Deux os qui partagent une articulation s'y fondent sans jour ni
 * cassure. Centré sur l'origine, le long de Y.
 */
export function limbGeometry(r0: number, r1: number, length: number, radial = 9): LatheGeometry {
  const points: Vector2[] = []
  const cap = 4
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2)
    points.push(new Vector2(Math.max(1e-4, r0 * Math.cos(a)), -length / 2 + r0 * Math.sin(a)))
  }
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2)
    points.push(new Vector2(Math.max(1e-4, r1 * Math.cos(a)), length / 2 + r1 * Math.sin(a)))
  }
  return new LatheGeometry(points, radial)
}

/** Bras à deux os posé chaque image par cinématique inverse (voir `poseArm`). */
export interface ArmRig {
  upper: Group | null
  fore: Group | null
  /** Longueurs épaule–coude et coude–poignet. */
  a: number
  b: number
  /** Épaule, dans le repère du groupe parent du bras. */
  shoulder: Vector3
}

export const createArmRig = (): ArmRig => ({ upper: null, fore: null, a: 0.3, b: 0.3, shoulder: new Vector3() })

/** Accroche le groupe du bras (épaule) au gréement, avec ses longueurs. */
export function attachUpper(rig: ArmRig, group: Group | null, a: number, b: number, x: number, y: number, z: number): void {
  rig.upper = group
  rig.a = a
  rig.b = b
  rig.shoulder.set(x, y, z)
}

/** Accroche le groupe de l'avant-bras (coude) au gréement. */
export function attachFore(rig: ArmRig, group: Group | null): void {
  rig.fore = group
}

const elbow = new Vector3()
const wrist = new Vector3()
const bone = new Vector3()

function orient(group: Group, from: Vector3, to: Vector3) {
  group.position.copy(from)
  group.quaternion.setFromUnitVectors(UP, bone.subVectors(to, from).normalize())
}

/** Pose le bras : main sur `target`, coude plié vers `pole` (repère du parent). */
export function poseArm(rig: ArmRig, target: Vector3, pole: Vector3): void {
  if (!rig.upper || !rig.fore) return
  solveTwoBone(rig.shoulder, target, rig.a, rig.b, pole, elbow, wrist)
  orient(rig.upper, rig.shoulder, elbow)
  orient(rig.fore, elbow, wrist)
}
