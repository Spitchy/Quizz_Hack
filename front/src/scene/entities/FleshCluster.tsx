import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { smoothNoise, type ArchetypeProps } from './anim'
import { Arm, Ball } from './parts'
import { createArmRig, poseArm, type ArmRig } from './rig'

// « L'Amas » : une masse de chair boursouflée, constellée d'yeux, d'où sortent
// de longs bras grêles qui tiennent le panneau par les coins.
// Colère : la masse enfle et palpite, les bras fouettent l'air, tous les yeux
// virent au rouge.
// Attaque : tous les bras fouettent vers le joueur.

const LOBES: { p: [number, number, number]; r: number }[] = [
  { p: [0, 0.45, 0], r: 0.45 },
  { p: [-0.32, 0.35, 0.05], r: 0.32 },
  { p: [0.3, 0.38, -0.05], r: 0.36 },
  { p: [0.05, 0.85, -0.05], r: 0.33 },
  { p: [-0.18, 0.75, 0.2], r: 0.24 },
  { p: [0.24, 0.72, 0.18], r: 0.22 },
  { p: [0, 0.22, 0.3], r: 0.22 },
]

/**
 * Bras : point d'attache sur la masse, et coin du panneau tenu (repère du
 * panneau) — le dernier, libre, ondule sur le côté.
 */
const ARMS: { from: [number, number, number]; grip: [number, number, number] | null }[] = [
  { from: [-0.35, 0.7, 0.2], grip: [-0.6, -0.4, 0] },
  { from: [0.35, 0.7, 0.2], grip: [0.6, -0.4, 0] },
  { from: [-0.25, 0.95, 0.15], grip: [-0.6, 0.4, 0] },
  { from: [0.25, 0.95, 0.15], grip: [0.6, 0.4, 0] },
  { from: [0.4, 0.5, 0.1], grip: null },
]
const SIGN_AT = new Vector3(0, 1.48, 0.45)
/** Main du bras libre, au repos (repère de l'entité). */
const FREE_HAND = new Vector3(0.95, 0.9, 0.6)

const target = new Vector3()
const pole = new Vector3()
const grip = new Vector3()
const root = new Vector3()

/** Longueurs d'os : un bras au repos garde le coude plié. */
function armLengths(from: [number, number, number], to: Vector3) {
  const d = root.set(...from).distanceTo(to)
  return { upper: d * 0.6, fore: d * 0.58 }
}
const LENGTHS = ARMS.map((arm) => armLengths(arm.from, arm.grip ? grip.set(...arm.grip).add(SIGN_AT) : FREE_HAND))

export function FleshCluster({ look, motion, mats, sign }: ArchetypeProps) {
  const mass = useRef<Group>(null)
  const lobes = useRef<(Mesh | null)[]>([])
  const held = useRef<Group>(null)
  const rigs = useRef<ArmRig[]>(ARMS.map(() => createArmRig()))
  // Un objet `ref` par bras, pour le composant `Arm`.
  const rigRefs = useMemo(() => ARMS.map((_, i) => ({ get current() { return rigs.current[i] } })), [])
  const pupils = useRef<(Mesh | null)[]>([])

  // Yeux éparpillés sur la surface des lobes.
  const eyes = useMemo(() => {
    const out: { p: [number, number, number]; r: number }[] = []
    LOBES.forEach((lobe, i) => {
      const count = i === 0 ? 3 : 2
      for (let k = 0; k < count; k++) {
        const a = look.phase + i * 1.7 + k * 2.1
        const dir: [number, number, number] = [Math.sin(a) * 0.6, Math.cos(a * 1.3) * 0.4, 0.7]
        const len = Math.hypot(...dir)
        out.push({
          p: [lobe.p[0] + (dir[0] / len) * lobe.r, lobe.p[1] + (dir[1] / len) * lobe.r, lobe.p[2] + (dir[2] / len) * lobe.r],
          r: 0.035 + ((i + k) % 3) * 0.012,
        })
      }
    })
    return out
  }, [look.phase])

  useFrame(() => {
    const m = motion.current
    if (!m || !mass.current) return
    const t = m.t + look.phase
    const anger = m.anger

    // Glissement ondulant en marche, gonflement à la colère.
    const swell = 1 + anger * 0.22 + Math.sin(t * (anger ? 9 : 1.4)) * (anger ? 0.06 : 0.025)
    mass.current.scale.set(swell * (1 + Math.sin(m.walkPhase * 2) * 0.06 * m.walk), swell, swell)
    mass.current.position.z = m.attack > 0 ? m.attack * 0.3 : 0
    lobes.current.forEach((lobe, i) => {
      if (!lobe) return
      const s = 1 + Math.sin(t * (anger ? 7 : 1.8) + i * 1.3) * (anger ? 0.08 : 0.04)
      lobe.scale.setScalar(s)
    })

    // Panneau : tenu par les coins, secoué à la colère.
    const h = held.current
    if (h) {
      h.position.set(SIGN_AT.x + smoothNoise(t * 7, 1) * 0.08 * anger, SIGN_AT.y + Math.sin(t * 1.1) * 0.02 + smoothNoise(t * 8, 2) * 0.06 * anger, SIGN_AT.z)
      h.rotation.set(0, 0, smoothNoise(t * 6, 3) * 0.15 * anger)
      h.updateMatrix()
    }

    // Bras : les mains suivent les coins du panneau ; le bras libre ondule,
    // fouette à la colère. Sans panneau, tous frappent vers le joueur.
    const lash = Math.max(0, m.attack)
    const recoil = Math.max(0, -m.attack)
    ARMS.forEach((arm, i) => {
      const rig = rigs.current[i]
      if (arm.grip && sign && h) {
        target.set(...arm.grip).applyMatrix4(h.matrix)
      } else if (!arm.grip && sign) {
        const whip = Math.sin(t * 19 + i * 2) * 0.35 * anger
        target.copy(FREE_HAND).add(grip.set(Math.sin(t * 1.7) * 0.12, Math.sin(t * 1.1) * 0.15 + whip, Math.cos(t * 1.3) * 0.1 + whip * 0.5))
      } else {
        // Ramassés en arrière, puis jetés vers lui, chacun avec son décalage.
        const side = arm.from[0] < 0 ? -1 : 1
        const wave = Math.sin(t * 3 + i * 1.7) * 0.12
        target.set(
          arm.from[0] + side * (0.25 - lash * 0.2) + wave,
          arm.from[1] + 0.5 + recoil * 0.35 - lash * 0.15 + Math.sin(t * 2.2 + i) * 0.08,
          arm.from[2] + 0.25 - recoil * 0.35 + lash * 0.9,
        )
      }
      pole.set(arm.from[0] * 3, arm.from[1] + 0.4, arm.from[2] - 0.6)
      poseArm(rig, target, pole)
    })

    // Pupilles : regardent dans tous les sens au repos, toutes vers le joueur sinon.
    pupils.current.forEach((pupil, i) => {
      if (!pupil) return
      const roam = m.engaged || anger > 0 ? 0 : 1
      pupil.position.x = Math.sin(t * 0.8 + i * 1.9) * 0.012 * roam + Math.sin(m.lookYaw) * 0.01
      pupil.position.y = Math.cos(t * 0.6 + i * 2.3) * 0.01 * roam
    })
  })

  return (
    <group>
      <group ref={mass}>
        {LOBES.map((lobe, i) => (
          <mesh key={i} ref={(o) => { lobes.current[i] = o }} position={lobe.p} material={i % 2 ? mats.secondary : mats.body}>
            <sphereGeometry args={[lobe.r, 18, 14]} />
          </mesh>
        ))}
        {eyes.map((eye, i) => (
          <group key={i} position={eye.p}>
            <Ball position={[0, 0, 0]} radius={eye.r} material={mats.eye} />
            <mesh ref={(o) => { pupils.current[i] = o }} position={[0, 0, eye.r * 0.85]} material={mats.dark}>
              <sphereGeometry args={[eye.r * 0.45, 8, 8]} />
            </mesh>
          </group>
        ))}
        {/* Bouche verticale, pleine de dents. */}
        <mesh position={[0.02, 0.5, 0.455]} rotation={[0, 0, Math.PI / 2]} material={mats.teeth}>
          <planeGeometry args={[0.32, 0.12]} />
        </mesh>
      </group>

      {ARMS.map((arm, i) => (
        <Arm
          key={i}
          rig={rigRefs[i]}
          shoulder={arm.from}
          upper={LENGTHS[i].upper}
          fore={LENGTHS[i].fore}
          radius={0.032}
          taper={0.6}
          material={mats.secondary}
          hand={<Ball position={[0, 0.02, 0]} radius={0.035} material={mats.body} scale={[1, 1.4, 0.8]} />}
        />
      ))}
      <group ref={held} position={SIGN_AT}>
        {sign}
      </group>
    </group>
  )
}
