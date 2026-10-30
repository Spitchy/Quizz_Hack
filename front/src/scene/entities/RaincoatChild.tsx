import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { holdGrip, lerp, poseHeld, smoothNoise, type ArchetypeProps } from './anim'
import { Arm, Ball, Limb } from './parts'
import { createArmRig, poseArm } from './rig'

// « L'Enfant » : petit, ciré de pluie délavé, capuche sur un visage vide où
// brillent deux têtes d'épingle. Il brandit son panneau au-dessus de sa tête.
// Colère : il hurle — le vide de son visage s'étire jusqu'au menton, il
// lévite et frissonne.
// Attaque : se ramasse puis bondit au visage du joueur, bras tendus.

const SIGN_AT = new Vector3(0, 1.72, 0.12)
const GRIP_L = new Vector3(-0.5, -0.47, -0.03)
const GRIP_R = new Vector3(0.5, -0.47, -0.03)
/** Bond : élan vers l'avant et vers le haut (m), sans traverser sa cible. */
const LEAP_FORWARD = 0.35
const LEAP_UP = 0.55

const target = new Vector3()
const pole = new Vector3()
const pose = new Vector3()

export function RaincoatChild({ look, motion, mats, sign }: ArchetypeProps) {
  const body = useRef<Group>(null)
  const coat = useRef<Mesh>(null)
  const head = useRef<Group>(null)
  const face = useRef<Mesh>(null)
  const held = useRef<Group>(null)
  const armL = useRef(createArmRig())
  const armR = useRef(createArmRig())

  useFrame(() => {
    const m = motion.current
    const h = held.current
    if (!m || !body.current || !head.current || !face.current || !coat.current || !h) return
    const t = m.t + look.phase
    const anger = m.anger

    // Lévitation et frisson à la colère ; petits pas sautillants ; ramassé puis bond à l'attaque.
    const lift = Math.max(m.fresh * 0.4, anger * 0.12)
    const leap = Math.max(0, m.attack)
    const crouch = Math.max(0, -m.attack)
    const shiver = smoothNoise(t * 22, 1) * 0.06 * anger
    body.current.position.set(
      shiver,
      lift + Math.abs(Math.sin(m.walkPhase * 1.5)) * 0.07 * m.walk + leap * LEAP_UP - crouch * 0.1 + Math.sin(t * 1.3) * 0.01,
      leap * LEAP_FORWARD - crouch * 0.08,
    )
    // Balancement d'enfant qui fredonne ; tête penchée.
    const calm = 1 - Math.min(1, anger * 2)
    body.current.rotation.set(leap * -0.25 + crouch * 0.15, 0, Math.sin(t * 1.1) * 0.08 * calm)
    head.current.rotation.set(0, m.lookYaw, Math.sin(t * 0.55) * 0.25 * calm + m.menace * 0.5)

    // Le hurlement : le vide du visage s'étire vers le bas.
    const scream = Math.max(m.fresh, anger * 0.6, leap)
    face.current.scale.set(1 + scream * 0.15, 1 + scream * 1.6, 1)
    face.current.position.y = -0.01 - scream * 0.08
    // Le ciré flotte.
    coat.current.scale.set(1 + Math.sin(t * 30) * 0.03 * anger, 1, 1 + Math.cos(t * 27) * 0.03 * anger)

    // Panneau brandi au-dessus de la tête, secoué à la colère ; les mains le tiennent.
    h.position.set(SIGN_AT.x, SIGN_AT.y + Math.sin(t * 18) * 0.04 * anger, SIGN_AT.z)
    h.rotation.set(Math.sin(t * 18) * 0.1 * anger, 0, smoothNoise(t * 6, 4) * 0.2 * anger)
    poseHeld(h, m)
    h.updateMatrix()
    for (const [rig, grip, side] of [
      [armL.current, GRIP_L, -1],
      [armR.current, GRIP_R, 1],
    ] as const) {
      // Sans panneau : bras levés, doigts en griffes ; tendus vers le visage au bond.
      pose.set(side * lerp(0.38, 0.16, leap), lerp(1.35 + Math.sin(t * 3 + side) * 0.05, 1.15, leap), lerp(0.2, 0.55, leap))
      if (sign) holdGrip(target, grip, h, m, pose)
      else target.copy(pose)
      pole.set(side * 0.8, 0.8, -0.3)
      poseArm(rig, target, pole)
    }
  })

  return (
    <group ref={body}>
      {/* Bottes et jambes. */}
      <Limb from={[-0.08, 0.34, 0]} to={[-0.09, 0.07, 0.01]} radius={0.05} material={mats.secondary} taper={0.9} />
      <Limb from={[0.08, 0.34, 0]} to={[0.09, 0.07, 0.01]} radius={0.05} material={mats.secondary} taper={0.9} />
      <Ball position={[-0.09, 0.05, 0.03]} radius={0.065} material={mats.secondary} scale={[1, 0.7, 1.4]} />
      <Ball position={[0.09, 0.05, 0.03]} radius={0.065} material={mats.secondary} scale={[1, 0.7, 1.4]} />

      {/* Ciré : cône évasé, boutons sombres. */}
      <mesh ref={coat} position={[0, 0.62, 0]} material={mats.body}>
        <coneGeometry args={[0.32, 0.72, 14, 1, true]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} material={mats.body}>
        <cylinderGeometry args={[0.13, 0.15, 0.12, 14]} />
      </mesh>
      {[0.85, 0.7, 0.55].map((y) => (
        <Ball key={y} position={[0, y, 0.22 - (0.85 - y) * 0.15]} radius={0.018} material={mats.secondary} />
      ))}

      {/* Bras levés (manches du ciré) : le panneau est brandi au-dessus de la tête. */}
      <Ball position={[-0.15, 0.92, 0]} radius={0.055} material={mats.body} />
      <Ball position={[0.15, 0.92, 0]} radius={0.055} material={mats.body} />
      <Arm rig={armL} shoulder={[-0.15, 0.92, 0]} upper={0.3} fore={0.28} radius={0.046} material={mats.body}
        hand={<Ball position={[0, 0.02, 0]} radius={0.04} material={mats.secondary} />} />
      <Arm rig={armR} shoulder={[0.15, 0.92, 0]} upper={0.3} fore={0.28} radius={0.046} material={mats.body}
        hand={<Ball position={[0, 0.02, 0]} radius={0.04} material={mats.secondary} />} />
      <group ref={held} position={SIGN_AT}>
        {sign}
      </group>

      {/* Capuche, bord de capuche, et le vide du visage posé devant. */}
      <group ref={head} position={[0, 1.13, 0.02]}>
        <Ball position={[0, 0, -0.01]} radius={0.17} material={mats.body} scale={[1, 1.1, 0.82]} />
        <mesh position={[0, -0.01, 0.128]} scale={[1, 1.08, 1]} material={mats.body}>
          <torusGeometry args={[0.118, 0.034, 8, 22]} />
        </mesh>
        <mesh ref={face} position={[0, -0.01, 0.157]} material={mats.dark}>
          <circleGeometry args={[0.104, 24]} />
        </mesh>
        <Ball position={[-0.04, 0.02, 0.16]} radius={0.008} material={mats.eye} />
        <Ball position={[0.04, 0.02, 0.16]} radius={0.008} material={mats.eye} />
      </group>
    </group>
  )
}
