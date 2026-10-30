import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { clamp01, smoothNoise, type ArchetypeProps } from './anim'
import { Ball, Limb } from './parts'

// « La Rampante » : à quatre pattes, membres pliés à l'envers comme une
// araignée, tête pendue à l'envers sous le torse. Son panneau est cloué sur
// un pieu planté dans son dos.
// Colère : se cabre sur ses pattes arrière, pattes avant battant l'air,
// et trotte nerveusement de gauche à droite.
// Attaque : se ramasse, puis bondit sur le joueur, pattes avant en crochets.

const LEGS: { x: number; z: number; side: number; front: boolean }[] = [
  { x: -0.2, z: 0.35, side: -1, front: true },
  { x: 0.2, z: 0.35, side: 1, front: true },
  { x: -0.18, z: -0.35, side: -1, front: false },
  { x: 0.18, z: -0.35, side: 1, front: false },
]
/** Élan maximal vers l'avant (m) : elle frappe sans traverser sa cible. */
const LUNGE = 0.32

export function Crawler({ look, motion, mats, sign }: ArchetypeProps) {
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const legs = useRef<(Group | null)[]>([])

  useFrame(() => {
    const m = motion.current
    if (!m || !body.current || !head.current) return
    const t = m.t + look.phase
    const anger = m.anger

    // Respiration du torse, trot latéral nerveux quand elle est fâchée.
    const rear = Math.max(m.fresh * 0.85, anger * 0.25)
    const pounce = Math.max(0, m.attack)
    const crouch = Math.max(0, -m.attack)
    body.current.position.set(
      (Math.sin(t * 9) * 0.7 + smoothNoise(t * 5, 2) * 0.6) * 0.18 * anger * (1 - pounce),
      Math.sin(t * 1.6) * 0.015 + Math.abs(Math.sin(m.walkPhase * 2)) * 0.04 * m.walk + pounce * 0.3 - crouch * 0.12,
      pounce * LUNGE - crouch * 0.12,
    )
    body.current.rotation.set(-rear - pounce * 0.35 + crouch * 0.12, 0, Math.sin(t * 0.9) * 0.03)

    // Tête : à l'envers au repos, se redresse quand elle se cabre ou bondit.
    const upright = clamp01(rear + pounce)
    head.current.rotation.set(0, m.lookYaw * 0.8, Math.PI * (1 - upright) + Math.sin(t * 0.7) * 0.15)

    // Pattes : trottinement en marche, battement des pattes avant en colère,
    // une patte qui tapote le sol au repos ; au bond, les pattes avant crochent.
    LEGS.forEach((leg, i) => {
      const g = legs.current[i]
      if (!g) return
      const gait = Math.sin(m.walkPhase * 2 + i * Math.PI * 0.5) * 0.6 * m.walk
      const flail = leg.front ? Math.sin(t * 20 + i) * 0.7 * anger * (1 - pounce) : 0
      // Tapotement : chaque patte à son tour, une impulsion douce par seconde (nulle aux relais).
      const tap = Math.floor(t) % 4 === i ? Math.sin(Math.PI * (t - Math.floor(t))) ** 2 * 0.25 * (1 - m.walk) : 0
      const hook = leg.front ? -pounce * 0.9 + crouch * 0.3 : crouch * 0.25
      g.rotation.set(gait + flail - tap + hook, 0, 0)
    })
  })

  return (
    <group ref={body}>
      {/* Torse long, incliné vers l'avant. */}
      <mesh position={[0, 0.78, 0]} rotation={[Math.PI / 2 + 0.15, 0, 0]} scale={[1, 1, 0.75]} material={mats.body}>
        <capsuleGeometry args={[0.2, 0.7, 6, 12]} />
      </mesh>
      {/* Côtes saillantes. */}
      {[-0.15, 0, 0.15].map((z) => (
        <mesh key={z} position={[0, 0.86, z]} rotation={[0, 0, Math.PI / 2]} material={mats.secondary}>
          <torusGeometry args={[0.17, 0.018, 6, 12, Math.PI]} />
        </mesh>
      ))}

      {/* Pattes pliées vers le haut puis vers le sol, comme une araignée : un seul trait continu. */}
      {LEGS.map((leg, i) => {
        const knee: [number, number, number] = [leg.side * 0.42, 0.32, leg.front ? 0.18 : -0.18]
        return (
          <group key={i} ref={(g) => { legs.current[i] = g }} position={[leg.x, 0.78, leg.z]}>
            <Limb from={[0, 0, 0]} to={knee} radius={0.042} material={mats.body} taper={0.95} />
            <Ball position={knee} radius={0.047} material={mats.secondary} />
            <Limb from={knee} to={[leg.side * 0.62, -0.76, leg.front ? 0.38 : -0.3]} radius={0.038} material={mats.body} taper={0.35} />
          </group>
        )
      })}

      {/* Tête pendue sous l'avant du torse, à l'envers. */}
      <Limb from={[0, 0.74, 0.4]} to={[0, 0.46, 0.64]} radius={0.055} material={mats.body} taper={0.85} />
      <group ref={head} position={[0, 0.42, 0.68]}>
        <Ball position={[0, 0, 0]} radius={0.15} material={mats.body} scale={[1, 0.9, 1.05]} />
        <Ball position={[-0.06, 0.04, 0.12]} radius={0.032} material={mats.eye} />
        <Ball position={[0.06, 0.04, 0.12]} radius={0.032} material={mats.eye} />
        <Ball position={[0, 0.1, 0.12]} radius={0.018} material={mats.eye} />
        <mesh position={[0, -0.06, 0.145]} material={mats.teeth}>
          <planeGeometry args={[0.2, 0.08]} />
        </mesh>
      </group>

      {/* Pieu planté dans le dos, panneau cloué dessus. */}
      <Limb from={[0, 0.85, -0.15]} to={[0, 1.95, 0.02]} radius={0.025} material={mats.secondary} taper={1} />
      <group position={[0, 1.5, 0.08]}>{sign}</group>
    </group>
  )
}
