import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Vector3, type Group } from 'three'
import { hash, holdGrip, poseHeld, stepped, type ArchetypeProps } from './anim'
import { Arm, Ball, Limb } from './parts'
import { createArmRig, poseArm } from './rig'

// « Le Mannequin » : plastique lustré, sans visage, rotules apparentes.
// Il ne bouge que par à-coups, image par image (c'est voulu, et c'est le seul) :
// sa tête change de position d'un coup quand on ne s'y attend pas.
// Colère : la tête pivote à 180°, le dos se cambre, les coudes se déboîtent
// à l'envers — sans que les mains lâchent le panneau.
// Attaque : gifle d'un bras raide, en travers.

const FPS = 8
/** Pivot du buste (il se cambre depuis les hanches). */
const HIPS = 1.05
const SIGN_AT = new Vector3(0, 1.36, 0.34)
const GRIP_L = new Vector3(-0.63, 0.04, 0.02)
const GRIP_R = new Vector3(0.63, 0.04, 0.02)

const target = new Vector3()
const pole = new Vector3()
const pose = new Vector3()

function Hand({ material }: { material: ArchetypeProps['mats']['body'] }) {
  return <Ball position={[0, 0.03, 0]} radius={0.05} material={material} scale={[0.8, 1.2, 0.6]} />
}

export function Mannequin({ look, motion, mats, sign }: ArchetypeProps) {
  const body = useRef<Group>(null)
  const upper = useRef<Group>(null)
  const head = useRef<Group>(null)
  const held = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef(createArmRig())
  const armR = useRef(createArmRig())

  useFrame(() => {
    const m = motion.current
    const h = held.current
    if (!m || !upper.current || !head.current || !h) return
    const t = stepped(m.t + look.phase, FPS)
    const frame = Math.floor(t * FPS)
    // Même ses humeurs passent par crans.
    const anger = Math.round(m.anger * 4) / 4
    const fresh = m.angerSince !== null && m.angerSince < 2.4

    // Pose de tête qui change brutalement toutes les ~2,5 s.
    const slot = Math.floor(t / 2.5)
    const restYaw = (hash(slot) - 0.5) * 0.9
    const restTilt = (hash(slot + 7) - 0.5) * 0.6
    let headYaw = m.engaged || look.watches ? stepped(m.lookYaw, 6) : restYaw
    let headTilt = restTilt
    let arch = 0
    if (anger > 0) {
      // La tête tourne par crans jusqu'à regarder derrière elle, et y reste.
      const turn = fresh ? Math.min(Math.PI, Math.floor((m.angerSince ?? 0) * 4) * 0.8) : Math.PI
      headYaw = turn + (hash(frame) - 0.5) * 0.15
      headTilt = 0.4
      arch = -0.45 * anger
    }
    if (m.menace > 0.5) headTilt = Math.PI / 2.2
    head.current.rotation.set(0, headYaw, headTilt)
    // Le dos se cambre depuis les hanches.
    upper.current.rotation.set(arch, 0, 0)

    // Panneau tenu à deux mains ; il tressaute avec elle.
    h.position.set(SIGN_AT.x, SIGN_AT.y + (anger > 0 ? (hash(frame + 11) - 0.5) * 0.06 : 0), SIGN_AT.z)
    h.rotation.set(0, 0, anger > 0 ? (hash(frame + 5) - 0.5) * 0.12 * anger : 0)
    poseHeld(h, m)
    h.updateMatrix()

    // Coudes : vers l'extérieur au repos ; déboîtés à l'envers (vers l'avant, le haut) à la colère.
    const dislocate = anger > 0 && hash(frame + 3) < 0.6 * anger
    const slap = m.attack < 0 ? m.attack : m.attack * -1
    for (const [rig, grip, side] of [
      [armL.current, GRIP_L, -1],
      [armR.current, GRIP_R, 1],
    ] as const) {
      if (side === 1) {
        // Gifle : bras raide, armé loin sur le côté, puis balayé en travers devant lui.
        const k = Math.max(0, -slap)
        pose.set(0.75 - (m.attack > 0 ? m.attack * 1.1 : 0), 1.55 + k * 0.15, 0.45 + (m.attack > 0 ? m.attack * 0.4 : -k * 0.25))
      } else {
        pose.set(-0.4, 1.15, 0.3)
      }
      if (sign) holdGrip(target, grip, h, m, pose)
      else target.copy(pose)
      if (dislocate) pole.set(side * 0.1, 2.3, 1.2)
      else pole.set(side * 0.9, 1.3, -0.4)
      poseArm(rig, target, pole)
    }

    // Marche raide, sans plier les genoux, par à-coups.
    const step = Math.sin(stepped(m.walkPhase, 2)) * 0.45 * m.walk
    legL.current?.rotation.set(step, 0, 0)
    legR.current?.rotation.set(-step, 0, 0)
  })

  return (
    <group ref={body}>
      {/* Jambes : cuisse, rotule, tibia. */}
      {([
        [legL, -0.12],
        [legR, 0.12],
      ] as [RefObject<Group | null>, number][]).map(([ref, x]) => (
        <group key={x} ref={ref} position={[x, 0.98, 0]}>
          <Limb from={[0, 0, 0]} to={[0, -0.47, 0.02]} radius={0.065} material={mats.body} taper={0.82} />
          <Ball position={[0, -0.48, 0.02]} radius={0.056} material={mats.secondary} />
          <Limb from={[0, -0.49, 0.02]} to={[0, -0.93, 0]} radius={0.05} material={mats.body} taper={0.8} />
          <Ball position={[0, -0.95, 0.05]} radius={0.05} material={mats.body} scale={[0.8, 0.5, 1.6]} />
        </group>
      ))}
      <Ball position={[0, 1.02, 0]} radius={0.16} material={mats.body} scale={[1.25, 0.7, 0.85]} />
      <group ref={upper} position={[0, HIPS, 0]}>
        <group position={[0, -HIPS, 0]}>
          {/* Torse moulé. */}
          <mesh position={[0, 1.42, 0]} scale={[1, 1, 0.6]} material={mats.body}>
            <capsuleGeometry args={[0.2, 0.42, 6, 14]} />
          </mesh>
          <Limb from={[0, 1.72, 0]} to={[0, 1.88, 0]} radius={0.045} material={mats.body} />
          <Ball position={[0, 1.8, 0]} radius={0.052} material={mats.secondary} />

          {/* Épaules à rotule, bras articulés (rotule au coude : la pièce de plastique). */}
          <Ball position={[-0.27, 1.66, 0]} radius={0.065} material={mats.secondary} />
          <Ball position={[0.27, 1.66, 0]} radius={0.065} material={mats.secondary} />
          <Arm rig={armL} shoulder={[-0.27, 1.66, 0]} upper={0.33} fore={0.31} radius={0.046} taper={0.85} material={mats.body} hand={<Hand material={mats.body} />}
            joint={<Ball position={[0, 0, 0]} radius={0.05} material={mats.secondary} />} />
          <Arm rig={armR} shoulder={[0.27, 1.66, 0]} upper={0.33} fore={0.31} radius={0.046} taper={0.85} material={mats.body} hand={<Hand material={mats.body} />}
            joint={<Ball position={[0, 0, 0]} radius={0.05} material={mats.secondary} />} />
          <group ref={held} position={SIGN_AT}>
            {sign}
          </group>

          {/* Tête lisse, sans visage : deux creux à peine marqués. */}
          <group ref={head} position={[0, 1.98, 0]}>
            <Ball position={[0, 0, 0]} radius={0.13} material={mats.body} scale={[0.9, 1.25, 1]} />
            <Ball position={[-0.042, 0.03, 0.115]} radius={0.016} material={mats.dark} scale={[1.3, 0.8, 0.5]} />
            <Ball position={[0.042, 0.03, 0.115]} radius={0.016} material={mats.dark} scale={[1.3, 0.8, 0.5]} />
        </group>
      </group>
      </group>
    </group>
  )
}
