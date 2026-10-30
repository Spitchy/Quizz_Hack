import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { Arm, Ball, Limb } from './parts'
import { createArmRig, poseArm } from './rig'
import { lerp, twitch, type ArchetypeProps } from './anim'

// « Le Long » : silhouette noire filiforme, tête en œuf, yeux pâles.
// Colère : le cou s'étire vers le plafond, la tête se tord d'un côté à l'autre
// par saccades, le panneau tremble au bout de ses bras.
// Attaque : lève les bras au-dessus de sa tête et frappe vers le bas.

const HIP = 1.25
const KNEE = 0.62
const SHOULDER_Y = 1.9
const NECK_BASE = 1.98
const SIGN_AT = new Vector3(0, 1.42, 0.36)
/** Prises sur les bords du panneau (repère du panneau). */
const GRIP_L = new Vector3(-0.61, 0.06, 0.02)
const GRIP_R = new Vector3(0.61, 0.06, 0.02)

const target = new Vector3()
const pole = new Vector3()

export function TallMan({ look, motion, mats, sign }: ArchetypeProps) {
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const shinL = useRef<Group>(null)
  const shinR = useRef<Group>(null)
  const pelvis = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const held = useRef<Group>(null)
  const neck = useRef<Group>(null)
  const head = useRef<Group>(null)
  const grin = useRef<Mesh>(null)
  const armL = useRef(createArmRig())
  const armR = useRef(createArmRig())

  useFrame(() => {
    const m = motion.current
    const h = held.current
    if (!m || !torso.current || !neck.current || !head.current || !h) return
    const t = m.t + look.phase
    const anger = m.anger

    // Marche : grandes enjambées lentes, le genou plie quand la jambe revient.
    const swing = Math.sin(m.walkPhase) * 0.55 * m.walk
    legL.current?.rotation.set(swing, 0, 0)
    legR.current?.rotation.set(-swing, 0, 0)
    shinL.current?.rotation.set(Math.max(0, Math.cos(m.walkPhase)) * 0.7 * m.walk, 0, 0)
    shinR.current?.rotation.set(Math.max(0, -Math.cos(m.walkPhase)) * 0.7 * m.walk, 0, 0)

    // Repos : balancement lent ; colère : penché ; frappe : tout le buste plonge.
    const strike = m.attack > 0 ? m.attack : 0
    torso.current.rotation.set(0.05 + anger * 0.18 + strike * 0.35 + Math.min(0, m.attack) * 0.12, 0, Math.sin(t * 0.7) * 0.03 * (1 - anger))
    if (pelvis.current) pelvis.current.position.y = Math.abs(Math.sin(m.walkPhase)) * 0.05 * m.walk

    // Cou qui s'étire, tête qui se tord par saccades (rapides, mais jamais d'une image à l'autre).
    const stretch = 1 + anger * (1.2 + 1.2 * m.fresh)
    neck.current.scale.y = stretch
    head.current.position.y = NECK_BASE + 0.22 * stretch + 0.13
    const snap = twitch(t * 6, 3, 0.4) * 1.4 * anger
    head.current.rotation.set(Math.sin(t * 0.4) * 0.04, m.lookYaw, snap + m.menace * 0.35)

    // Panneau : tenu à deux mains, levé et secoué à la colère.
    h.position.set(SIGN_AT.x + twitch(t * 9, 5) * 0.05 * anger, SIGN_AT.y + anger * 0.16, SIGN_AT.z + anger * 0.06)
    h.rotation.set(-anger * 0.2, 0, twitch(t * 8, 7) * 0.16 * anger)
    h.updateMatrix()

    // Bras : les mains suivent les bords du panneau ; sans panneau, elles frappent.
    for (const [rig, grip, side] of [
      [armL.current, GRIP_L, -1],
      [armR.current, GRIP_R, 1],
    ] as const) {
      if (sign) {
        target.copy(grip).applyMatrix4(h.matrix)
      } else {
        // Armé : mains au-dessus de la tête ; impact : abattues devant lui.
        const raise = Math.max(0, -m.attack)
        target.set(side * lerp(0.42, 0.22, raise), lerp(lerp(1.45, 2.7, raise), 1.25, strike), lerp(lerp(0.25, 0.05, raise), 0.95, strike))
        target.x += Math.sin(t * 1.3 + side) * 0.03
      }
      pole.set(side * 0.9, 1.5, -0.5)
      poseArm(rig, target, pole)
    }

    if (grin.current) {
      const s = Math.max(m.menace * 1.4, anger * 0.9)
      grin.current.scale.set(s, s, 1)
      grin.current.visible = s > 0.02
    }
  })

  return (
    <group ref={pelvis}>
      {([
        [legL, shinL, -0.11],
        [legR, shinR, 0.11],
      ] as const).map(([leg, shin, x]) => (
        <group key={x} ref={leg} position={[x, HIP, 0]}>
          <Limb from={[0, 0, 0]} to={[0, -KNEE, 0]} radius={0.05} material={mats.body} taper={0.8} />
          <group ref={shin} position={[0, -KNEE, 0]}>
            <Limb from={[0, 0, 0]} to={[0, -(HIP - KNEE - 0.03), 0]} radius={0.04} material={mats.body} taper={0.8} />
            <Ball position={[0, -(HIP - KNEE - 0.02), 0.04]} radius={0.04} material={mats.body} scale={[0.8, 0.5, 1.7]} />
          </group>
        </group>
      ))}
      {/* Buste : se penche et frappe depuis les hanches. */}
      <group ref={torso} position={[0, HIP, 0]}>
        <group position={[0, -HIP, 0]}>
          <mesh position={[0, 1.6, 0]} scale={[0.85, 1, 0.55]} material={mats.body}>
            <capsuleGeometry args={[0.17, 0.66, 4, 10]} />
          </mesh>

          <Arm rig={armL} shoulder={[-0.25, SHOULDER_Y, 0]} upper={0.42} fore={0.4} radius={0.036} material={mats.body}
            hand={<Ball position={[0, 0.04, 0]} radius={0.045} material={mats.body} scale={[0.8, 1.5, 0.6]} />} />
          <Arm rig={armR} shoulder={[0.25, SHOULDER_Y, 0]} upper={0.42} fore={0.4} radius={0.036} material={mats.body}
            hand={<Ball position={[0, 0.04, 0]} radius={0.045} material={mats.body} scale={[0.8, 1.5, 0.6]} />} />
          <group ref={held} position={SIGN_AT}>
            {sign}
          </group>

          <group ref={neck} position={[0, NECK_BASE, 0.02]}>
            <Limb from={[0, 0, 0]} to={[0, 0.22, 0.05]} radius={0.035} material={mats.body} />
          </group>
          <group ref={head} position={[0, 2.33, 0.08]}>
            <mesh scale={[0.82, 1.55, 0.9]} material={mats.body}>
              <sphereGeometry args={[0.15, 16, 16]} />
            </mesh>
            <Ball position={[-0.044, 0.07, 0.125]} radius={0.017} material={mats.eye} />
            <Ball position={[0.044, 0.07, 0.125]} radius={0.017} material={mats.eye} />
            <mesh ref={grin} position={[0, -0.09, 0.132]} material={mats.teeth} visible={false}>
              <planeGeometry args={[0.3, 0.11]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
