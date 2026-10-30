import { useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import { Quaternion, Vector3, type Material } from 'three'
import { attachFore, attachUpper, limbGeometry, type ArmRig } from './rig'

// Briques de géométrie communes aux monstres. L'état d'animation et les outils
// purs sont dans `anim.ts` ; la géométrie des os et la pose des bras dans `rig.ts`.

export type V3 = [number, number, number]
const UP = new Vector3(0, 1, 0)

/** Os arrondi entre deux points fixes. */
export function Limb({ from, to, radius, material, taper = 0.75 }: { from: V3; to: V3; radius: number; material: Material; taper?: number }) {
  const key = `${from.join()}|${to.join()}|${radius}|${taper}`
  const { position, quaternion, geometry } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const dir = b.clone().sub(a)
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      geometry: limbGeometry(radius, radius * taper, dir.length()),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh position={position} quaternion={quaternion} material={material} geometry={geometry} />
}

export function Ball({ position, radius, material, scale }: { position: V3; radius: number; material: Material; scale?: V3 }) {
  return (
    <mesh position={position} scale={scale} material={material}>
      <sphereGeometry args={[radius, 14, 12]} />
    </mesh>
  )
}

// --- Bras articulés (posés par `poseArm`, voir `rig.ts`) -----------------------

/** Os arrondi dont la base est sur l'articulation (de 0 à `length` le long de Y). */
function boneGeometry(r0: number, r1: number, length: number) {
  return limbGeometry(r0, r1, length).translate(0, length / 2, 0)
}

interface ArmProps {
  rig: RefObject<ArmRig>
  shoulder: V3
  upper: number
  fore: number
  radius: number
  taper?: number
  material: Material
  /** Main (ou pince, gant…), au bout de l'avant-bras, orientée le long de Y. */
  hand?: ReactNode
  /** Pièce visible au coude (rotule), centrée sur l'articulation. */
  joint?: ReactNode
}

export function Arm({ rig, shoulder, upper, fore, radius, taper = 0.8, material, hand, joint }: ArmProps) {
  const geometries = useMemo(
    () => ({ upper: boneGeometry(radius, radius * 0.88, upper), fore: boneGeometry(radius * 0.88, radius * 0.88 * taper, fore) }),
    [radius, taper, upper, fore],
  )
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])
  const [sx, sy, sz] = shoulder
  return (
    <>
      <group position={shoulder} ref={(g) => attachUpper(rig.current, g, upper, fore, sx, sy, sz)}>
        <mesh geometry={geometries.upper} material={material} />
      </group>
      <group ref={(g) => attachFore(rig.current, g)}>
        <mesh geometry={geometries.fore} material={material} />
        {joint}
        <group position={[0, fore, 0]}>{hand}</group>
      </group>
    </>
  )
}

