import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { MeshStandardMaterial, Vector3, type Group, type Material, type Mesh } from 'three'
import { APPROACH_SECONDS, collapseAt, type DefeatStage } from '../app/sequence'
import { playBeatingHit } from '../audio/stage'
import type { Vec2 } from '../maze/physics'
import { writeProbe, type BodyHit, type BodyProbe } from './defeatBody'
import { damp, lerp, smoothNoise } from './entities/anim'
import { Arm, Ball, Limb } from './entities/parts'
import { createArmRig, poseArm } from './entities/rig'

// Défaite, vue de la caméra de surveillance : le corps du joueur, figé au
// milieu du couloir. Il tremble, se protège la tête, encaisse chaque coup
// (le buste part à l'opposé du coup), tombe à genoux puis bascule en arrière,
// sur le dos, du côté de la caméra (là où aucune ne se tient). Fait des mêmes
// briques que les monstres.

const HIPS = 0.93
const KNEEL_HIPS = 0.56
/** Pivot de la chute en arrière : les genoux, posés au sol. */
const PIVOT = new Vector3(0, 0.1, 0.02)
const FALL_ANGLE = 1.48
const FEET_STAND: readonly [number, number, number][] = [
  [-0.12, 0.06, 0.03],
  [0.12, 0.06, 0.03],
]
const FEET_KNEEL: readonly [number, number, number][] = [
  [-0.14, 0.07, -0.44],
  [0.14, 0.07, -0.44],
]

const target = new Vector3()
const pole = new Vector3()
const local = new Vector3()

/** Taches de sang sur le corps (repère du buste), révélées coup après coup. */
const STAINS: readonly { at: [number, number, number]; r: number; s: [number, number, number] }[] = [
  { at: [0.05, 0.78, 0.09], r: 0.04, s: [1, 1.4, 0.4] },
  { at: [-0.06, 0.66, 0.1], r: 0.05, s: [1.2, 1, 0.35] },
  { at: [0.08, 0.38, 0.105], r: 0.07, s: [1, 1.5, 0.3] },
  { at: [-0.1, 0.25, 0.1], r: 0.06, s: [1.3, 1, 0.3] },
  { at: [0, 0.72, -0.09], r: 0.06, s: [1.2, 1, 0.4] },
  { at: [0.02, 0.12, 0.1], r: 0.08, s: [1.5, 1.1, 0.3] },
  { at: [-0.03, 0.82, 0.04], r: 0.07, s: [1.1, 0.6, 1] },
  { at: [0.12, 0.45, -0.1], r: 0.07, s: [1, 1.3, 0.3] },
]

function createBodyMaterials() {
  return {
    skin: new MeshStandardMaterial({ color: '#c2ab93', roughness: 0.7 }),
    shirt: new MeshStandardMaterial({ color: '#8b8576', roughness: 0.95 }),
    trousers: new MeshStandardMaterial({ color: '#2c2f37', roughness: 0.95 }),
    shoes: new MeshStandardMaterial({ color: '#131212', roughness: 0.6 }),
    hair: new MeshStandardMaterial({ color: '#17120e', roughness: 0.9 }),
    blood: new MeshStandardMaterial({ color: '#5c0303', roughness: 0.25, metalness: 0.05 }),
  }
}

function Shoe({ material }: { material: Material }) {
  return <Ball position={[0, 0.02, 0.06]} radius={0.06} material={material} scale={[0.8, 0.55, 1.7]} />
}

function Hand({ material }: { material: Material }) {
  return <Ball position={[0, 0.03, 0]} radius={0.045} material={material} scale={[0.8, 1.2, 0.55]} />
}

interface PlayerBodyProps {
  stage: DefeatStage | null
  stand: Vec2
  /** Orientation du corps (rad) : face au côté d'où elles arrivent. */
  yaw: number
  hits: readonly BodyHit[]
  probe: RefObject<BodyProbe>
}

export function PlayerBody({ stage, stand, yaw, hits, probe }: PlayerBodyProps) {
  const mats = useMemo(() => createBodyMaterials(), [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const root = useRef<Group>(null)
  const pivot = useRef<Group>(null)
  const hips = useRef<Group>(null)
  const spine = useRef<Group>(null)
  const head = useRef<Group>(null)
  const stains = useRef<(Mesh | null)[]>([])
  const armL = useRef(createArmRig())
  const armR = useRef(createArmRig())
  const legL = useRef(createArmRig())
  const legR = useRef(createArmRig())
  const st = useRef({
    stage: null as DefeatStage | null,
    since: 0,
    taken: 0,
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    twist: { value: 0, velocity: 0 },
    kneel: { value: 0, velocity: 0 },
    fall: { value: 0, velocity: 0 },
    guard: { value: 0, velocity: 0 },
  })

  useFrame(({ clock }, rawDt) => {
    const r = root.current
    const pv = pivot.current
    const hp = hips.current
    const sp = spine.current
    const hd = head.current
    if (!r || !pv || !hp || !sp || !hd) return
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const s = st.current
    const filmed = stage === 'approach' || stage === 'beat' || stage === 'knockout'
    r.visible = filmed
    if (!filmed || !stage) {
      s.stage = stage
      return
    }
    if (stage !== s.stage) {
      if (stage === 'approach' || s.stage === null) {
        s.taken = 0
        s.since = t
      }
      if (stage === 'beat') {
        s.since = t
        s.taken = 0
      }
      s.stage = stage
    }
    const since = t - s.since
    r.position.set(stand.x, 0, stand.z)
    r.rotation.y = yaw

    // --- Coups : chacun pousse le buste et la tête à l'opposé de l'assaillant. ---
    if (stage === 'beat') {
      while (s.taken < hits.length && since >= hits[s.taken].at) {
        const hit = hits[s.taken]
        // Direction du coup dans le repère du corps.
        local.set(stand.x - hit.from.x, 0, stand.z - hit.from.z).normalize()
        const lx = local.x * Math.cos(yaw) - local.z * Math.sin(yaw)
        const lz = local.x * Math.sin(yaw) + local.z * Math.cos(yaw)
        // Les coups s'enchaînent : chacun pousse moins, pour que le corps reste lisible.
        const force = Math.min(1, 12 / hits.length)
        s.pitch.velocity += lz * 9 * force
        s.roll.velocity += -lx * 9 * force
        s.twist.velocity += (s.taken % 2 ? 1 : -1) * 6 * force
        playBeatingHit(s.taken, hits.length, stand.x, stand.z)
        s.taken++
      }
    }
    const { kneel: kneelTarget, fall: fallTarget } = stage === 'knockout' ? { kneel: 1, fall: 1 } : collapseAt(s.taken, hits.length)
    const kneel = damp(s.kneel, kneelTarget, 0.28, dt)
    const fall = damp(s.fall, fallTarget, 0.42, dt)
    // Ressorts de recul (ils reviennent d'eux-mêmes, en oscillant un peu).
    for (const spring of [s.pitch, s.roll, s.twist]) {
      spring.velocity -= (spring.value * 60 + spring.velocity * 7) * dt
      spring.value += spring.velocity * dt
    }
    // Il lève les bras à mesure qu'elles approchent, et ne les baisse plus.
    const approach = stage === 'approach' ? Math.min(1, since / APPROACH_SECONDS) : 1
    const guard = damp(s.guard, approach > 0.45 ? 1 : 0.25, 0.4, dt) * (1 - fall)

    // --- Posture : debout tremblant, à genoux, puis face contre terre. ---
    const shiver = smoothNoise(t * 14, 1) * 0.02 + Math.sin(t * 3.4) * 0.012
    pv.rotation.set(-fall * FALL_ANGLE, 0, 0)
    hp.position.set(shiver * 0.5, lerp(HIPS, KNEEL_HIPS, kneel), lerp(0, -0.02, kneel))
    sp.rotation.set(
      kneel * 0.32 * (1 - fall) + guard * 0.18 + s.pitch.value + shiver,
      s.twist.value * 0.4 + smoothNoise(t * 0.7, 3) * 0.15 * (1 - kneel),
      s.roll.value + shiver * 0.5,
    )
    // La tête : elle cherche des yeux celles qui arrivent ; à terre, retombée sur le côté.
    hd.rotation.set(
      -s.pitch.value * 1.4 + guard * 0.25 * (1 - fall),
      smoothNoise(t * 0.9, 5) * 1.1 * (1 - guard * 0.6) * (1 - fall) + s.twist.value * 0.8 + fall * 1.25,
      s.roll.value * 1.5,
    )

    // --- Jambes : les pieds restent au sol pendant toute la chute. ---
    const c = Math.cos(-pv.rotation.x)
    const sn = Math.sin(-pv.rotation.x)
    ;[legL.current, legR.current].forEach((rig, i) => {
      const a = FEET_STAND[i]
      const b = FEET_KNEEL[i]
      // Pied au sol (repère du corps), ramené dans le repère tourné de la chute, puis des hanches.
      const fx = lerp(a[0], b[0], kneel)
      const fy = lerp(a[1], b[1], kneel) - PIVOT.y
      const fz = lerp(a[2], b[2], kneel) - PIVOT.z
      target.set(fx, fy * c - fz * sn + PIVOT.y, fy * sn + fz * c + PIVOT.z)
      target.sub(hp.position)
      pole.set(a[0] * 2, -0.4, 1.5)
      poseArm(rig, target, pole)
    })

    // --- Bras : en garde devant le visage, battus par les coups ; à terre, en croix sur le sol. ---
    ;[armL.current, armR.current].forEach((rig, i) => {
      const side = i ? 1 : -1
      const flail = s.pitch.value * 0.5 + s.roll.value * side * 0.4
      target.set(
        lerp(side * lerp(0.26, 0.11, guard) + s.twist.value * 0.1, side * 0.5, fall),
        lerp(lerp(0.02, 0.66, guard), 0.4, fall) + flail,
        lerp(lerp(0.05, 0.22, guard), -0.1, fall) - flail * 0.3,
      )
      pole.set(side * lerp(0.4, 0.55, guard), lerp(0.3, 0.1, guard), lerp(-0.4, 0.4, guard))
      poseArm(rig, target, pole)
    })

    // Sang sur les vêtements, coup après coup.
    stains.current.forEach((m, i) => {
      if (m) m.visible = i < s.taken * 1.2 || stage === 'knockout'
    })

    // Pour les éclaboussures et les flaques.
    writeProbe(probe.current, hd, sp, fall, s.taken)
  })

  return (
    <group ref={root} name="player-body" visible={false}>
      <group ref={pivot} position={PIVOT}>
        <group position={[-PIVOT.x, -PIVOT.y, -PIVOT.z]}>
          <group ref={hips} position={[0, HIPS, 0]}>
            {/* Bassin et jambes (pied au bout du tibia, pointe vers l'avant). */}
            <mesh position={[0, 0.02, 0]} scale={[1.15, 0.7, 0.75]} material={mats.trousers}>
              <sphereGeometry args={[0.15, 14, 10]} />
            </mesh>
            <Arm rig={legL} shoulder={[-0.1, -0.02, 0]} upper={0.45} fore={0.43} radius={0.075} taper={0.7} material={mats.trousers} hand={<Shoe material={mats.shoes} />} />
            <Arm rig={legR} shoulder={[0.1, -0.02, 0]} upper={0.45} fore={0.43} radius={0.075} taper={0.7} material={mats.trousers} hand={<Shoe material={mats.shoes} />} />

            <group ref={spine}>
              {/* Buste, chemise usée. */}
              <mesh position={[0, 0.3, 0]} scale={[1, 1, 0.62]} material={mats.shirt}>
                <capsuleGeometry args={[0.17, 0.34, 6, 14]} />
              </mesh>
              <Ball position={[-0.2, 0.47, 0]} radius={0.062} material={mats.shirt} />
              <Ball position={[0.2, 0.47, 0]} radius={0.062} material={mats.shirt} />
              <Arm rig={armL} shoulder={[-0.2, 0.47, 0]} upper={0.29} fore={0.27} radius={0.05} material={mats.shirt} hand={<Hand material={mats.skin} />} />
              <Arm rig={armR} shoulder={[0.2, 0.47, 0]} upper={0.29} fore={0.27} radius={0.05} material={mats.shirt} hand={<Hand material={mats.skin} />} />
              <Limb from={[0, 0.52, 0]} to={[0, 0.63, 0.01]} radius={0.05} material={mats.skin} taper={0.9} />

              <group ref={head} position={[0, 0.72, 0.02]}>
                <Ball position={[0, 0, 0]} radius={0.11} material={mats.skin} scale={[0.85, 1.05, 0.95]} />
                <mesh position={[0, 0.03, -0.01]} scale={[0.9, 0.85, 0.98]} material={mats.hair}>
                  <sphereGeometry args={[0.112, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                </mesh>
                <Ball position={[-0.035, 0.015, 0.093]} radius={0.012} material={mats.hair} />
                <Ball position={[0.035, 0.015, 0.093]} radius={0.012} material={mats.hair} />
              </group>

              {STAINS.map((stain, i) => (
                <mesh
                  key={i}
                  ref={(m) => {
                    stains.current[i] = m
                  }}
                  position={stain.at}
                  scale={stain.s}
                  material={mats.blood}
                  visible={false}
                >
                  <sphereGeometry args={[stain.r, 10, 8]} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
