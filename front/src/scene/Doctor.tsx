import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import type { DefeatStage } from '../app/sequence'
import { playAt } from '../audio/stage'
import { pathLength, pointAlong } from '../maze/approach'
import { clamp01, damp, ease, smoothNoise } from './entities/anim'
import { Arm, Ball, Limb } from './entities/parts'
import { createArmRig, poseArm } from './entities/rig'
import { createDoctorMaterials, glowEyes, HIPS, placeSyringe, type DoctorMaterials, type DoctorParts } from './doctorParts'
import { ARM_TARGET, DOCTOR_PATH, INJECT, trackDoctorHead } from './wakeStage'

// Défaite, deuxième acte : le « médecin ». Une créature en blouse tachée,
// calot et masque chirurgical, tête grise allongée et deux grands yeux noirs.
// Il attend derrière la porte pendant le réveil ; elle s'ouvre, il entre,
// vient à côté du joueur, se penche, plante la seringue dans son avant-bras
// sanglé, pousse le piston, puis recule en riant pendant que ses yeux prennent
// la couleur du virus. Bras en deux os posés par cinématique inverse : la main
// va où il faut sans que le bras s'étire.

/** Écart d'angle le plus court (rad). */
function shortestAngle(from: number, to: number): number {
  return ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

const STEP_BACK = new Vector3(1.15, 0, 0.3)
/** Seringue : de la main (gant, bout du piston) à la pointe de l'aiguille. */
const SYRINGE_REACH = 0.58

const target = new Vector3()
const pole = new Vector3()
const aim = new Vector3()
const dir = new Vector3()
const wrist = new Vector3()
const shoulder = new Vector3()

export function Doctor({ stage }: { stage: DefeatStage }) {
  const mats = useMemo(() => createDoctorMaterials(), [])
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats],
  )
  const root = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const head = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const shinL = useRef<Group>(null)
  const shinR = useRef<Group>(null)
  const armR = useRef(createArmRig())
  const armL = useRef(createArmRig())
  const syringe = useRef<Group>(null)
  const liquid = useRef<Mesh>(null)
  const st = useRef({ stage: null as DefeatStage | null, at: 0, phase: 0, footfall: 0, yaw: { value: Math.PI, velocity: 0 }, lean: { value: 0, velocity: 0 } })

  useFrame(({ clock, camera }, rawDt) => {
    const r = root.current
    const tr = torso.current
    const inn = inner.current
    const h = head.current
    const sy = syringe.current
    if (!r || !tr || !inn || !h || !sy) return
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const s = st.current
    if (s.stage !== stage) {
      s.stage = stage
      s.at = t
    }
    const since = t - s.at

    // --- Où il se tient : derrière la porte, puis il entre et vient à côté du joueur. ---
    let walk = 0
    let leanTarget = 0
    let laugh = 0
    let heading: number | null = null
    const total = pathLength(DOCTOR_PATH)
    if (stage === 'inject') {
      const k = clamp01((since - INJECT.enter) / (INJECT.arrive - INJECT.enter))
      const at = pointAlong(DOCTOR_PATH, total * ease(k))
      r.position.set(at.x, 0, at.z)
      walk = k > 0 && k < 1 ? 1 : 0
      if (walk) heading = at.heading
      leanTarget = clamp01((since - INJECT.arrive + 0.15) / INJECT.lean) * 0.42
    } else if (stage === 'infected' || stage === 'over') {
      const k = clamp01(since / 1.1)
      const end = DOCTOR_PATH[DOCTOR_PATH.length - 1]
      r.position.lerpVectors(stage === 'over' ? STEP_BACK : end, STEP_BACK, ease(k))
      walk = stage === 'infected' && k < 1 ? 0.6 : 0
      leanTarget = 0.12
      laugh = stage === 'infected' ? 1 : 0.4
    } else {
      r.position.copy(DOCTOR_PATH[0])
    }
    // En marche, face au chemin ; arrivé, tourné vers le joueur (rotation amortie).
    const wanted = heading ?? Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z)
    const yaw = damp(s.yaw, s.yaw.value + shortestAngle(s.yaw.value, wanted), 0.25, dt)
    r.rotation.y = yaw
    const lean = damp(s.lean, leanTarget, 0.25, dt)

    // Démarche raide, genoux qui plient ; fou rire qui secoue les épaules.
    s.phase += dt * 7 * walk
    // Ses semelles sur le carrelage : un pas à chaque demi-cycle de sa démarche.
    const footfall = Math.floor(s.phase / Math.PI)
    if (footfall !== s.footfall) {
      s.footfall = footfall
      playAt('step-hard', [r.position.x, 0.05, r.position.z], { gain: 0.9, rate: 0.82 + Math.random() * 0.08 })
    }
    const step = Math.sin(s.phase) * 0.5 * walk
    legL.current?.rotation.set(step, 0, 0)
    legR.current?.rotation.set(-step, 0, 0)
    shinL.current?.rotation.set(Math.max(0, Math.cos(s.phase)) * 0.6 * walk, 0, 0)
    shinR.current?.rotation.set(Math.max(0, -Math.cos(s.phase)) * 0.6 * walk, 0, 0)
    const shudder = laugh ? Math.sin(t * 26) * 0.05 * laugh : 0
    tr.rotation.set(lean + shudder, 0, shudder * 0.5)
    tr.position.y = HIPS + (laugh ? Math.abs(Math.sin(t * 13)) * 0.03 * laugh : Math.abs(Math.sin(s.phase)) * 0.025 * walk)
    // La tête : penchée, curieuse, qui fixe le joueur.
    const tilt = stage === 'wake' ? 0.35 : stage === 'inject' ? 0.2 + smoothNoise(t * 0.6, 2) * 0.1 : 0.5
    h.rotation.set(-lean * 0.6, 0, tilt + (laugh ? Math.sin(t * 19) * 0.12 * laugh : 0))

    // --- Bras droit : la main amène la seringue, la plante, pousse le piston. ---
    inn.updateWorldMatrix(true, false)
    inn.localToWorld(shoulder.copy(armR.current.shoulder))
    dir.subVectors(ARM_TARGET, shoulder).normalize()
    let aiming = false
    if (stage === 'inject' && since > INJECT.arrive - 0.3) {
      aiming = true
      // Prête, au-dessus du bras ; puis plantée : la pointe atteint le point d'injection.
      const stab = ease(clamp01((since - INJECT.stab + 0.14) / 0.14))
      target.copy(ARM_TARGET).addScaledVector(dir, -(SYRINGE_REACH + 0.2)).add(aim.set(0, 0.1, 0))
      aim.copy(ARM_TARGET).addScaledVector(dir, -(SYRINGE_REACH - 0.025))
      target.lerp(aim, stab)
      inn.worldToLocal(target)
    } else {
      // Bras plié, seringue tenue contre lui ; elle balance un peu quand il marche.
      target.set(-0.3, 1.08 + Math.sin(s.phase) * 0.03 * walk, 0.18 + Math.cos(s.phase) * 0.04 * walk)
      if (stage === 'infected' || stage === 'over') target.set(-0.32, 0.98, 0.1)
    }
    poseArm(armR.current, target, pole.set(-0.6, 1.2, -0.5))
    // Bras gauche ballant, secoué par le rire.
    target.set(0.31, 0.98 + Math.sin(t * 13) * 0.02 * laugh, 0.06 - Math.sin(s.phase) * 0.08 * walk)
    poseArm(armL.current, target, pole.set(0.6, 1.3, -0.4))

    // La seringue part du poignet réel (le bras ne s'étire jamais).
    const fore = armR.current.fore
    if (fore) {
      fore.updateWorldMatrix(true, false)
      fore.localToWorld(wrist.set(0, armR.current.b, 0))
    }
    placeSyringe(sy, wrist, aiming ? ARM_TARGET : aim.copy(wrist).add(target.set(0, -1, 0.25)))
    if (liquid.current) {
      const pushed = stage === 'inject' ? clamp01((since - INJECT.stab) / (INJECT.pushEnd - INJECT.stab)) : stage === 'wake' ? 0 : 1
      liquid.current.scale.y = 1 - pushed * 0.9
      liquid.current.position.y = -0.14 * pushed * 0.9
    }

    // La caméra le suit des yeux.
    h.getWorldPosition(wrist)
    trackDoctorHead(wrist.x, wrist.y, wrist.z)

    // Ses yeux prennent la couleur du virus quand il a fini.
    const glow = stage === 'infected' || stage === 'over'
    glowEyes(mats, glow, t)
  })

  return (
    <DoctorModel
      parts={{ root, torso, inner, head, legL, legR, shinL, shinR, armR, armL, syringe, liquid }}
      mats={mats}
      position={DOCTOR_PATH[0]}
    />
  )
}

/** Le corps du médecin et sa seringue, sans mise en scène. */
export function DoctorModel({ parts, mats, position }: { parts: DoctorParts; mats: DoctorMaterials; position?: Vector3 }) {
  const { root, torso, inner, head, legL, legR, shinL, shinR, armR, armL, syringe, liquid } = parts
  return (
    <>
      <group ref={root} position={position}>
        {([
          [legL, shinL, -0.11],
          [legR, shinR, 0.11],
        ] as const).map(([leg, shin, x]) => (
          <group key={x} ref={leg} position={[x, HIPS, 0]}>
            <Limb from={[0, 0, 0]} to={[0, -0.46, 0.01]} radius={0.065} material={mats.scrubs} taper={0.9} />
            <group ref={shin} position={[0, -0.46, 0.01]}>
              <Limb from={[0, 0, 0]} to={[0, -0.44, 0.01]} radius={0.058} material={mats.scrubs} taper={0.85} />
              <mesh position={[0, -0.47, 0.06]} material={mats.shoes}>
                <boxGeometry args={[0.11, 0.07, 0.26]} />
              </mesh>
            </group>
          </group>
        ))}

        <group ref={torso} position={[0, HIPS, 0]}>
          <group ref={inner} position={[0, -HIPS, 0]}>
            {/* Blouse longue, ouverte en bas. */}
            <mesh position={[0, 0.98, 0]} material={mats.coat}>
              <cylinderGeometry args={[0.25, 0.29, 0.95, 20, 1, true]} />
            </mesh>
            <mesh position={[0, 1.45, 0]} scale={[1, 1, 0.7]} material={mats.coat}>
              <capsuleGeometry args={[0.24, 0.3, 6, 14]} />
            </mesh>
            {/* Col de blouse, tenue en dessous, stéthoscope et badge. */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.08, 1.63, 0.12]} rotation={[0.35, 0, side * -0.55]} material={mats.coat}>
                <boxGeometry args={[0.1, 0.17, 0.018]} />
              </mesh>
            ))}
            <mesh position={[0, 1.6, 0.128]} rotation={[0.28, 0, 0]} material={mats.scrubs}>
              <boxGeometry args={[0.1, 0.16, 0.012]} />
            </mesh>
            <mesh position={[0, 1.66, 0.05]} rotation={[Math.PI / 2.4, 0, 0]} material={mats.shoes}>
              <torusGeometry args={[0.12, 0.012, 6, 20]} />
            </mesh>
            <mesh position={[0.12, 1.45, 0.175]} material={mats.mask}>
              <planeGeometry args={[0.07, 0.09]} />
            </mesh>
            {/* Épaules arrondies, bras en deux os (manche de blouse), mains gantées. */}
            <Ball position={[-0.24, 1.56, 0.02]} radius={0.075} material={mats.coat} />
            <Ball position={[0.24, 1.56, 0.02]} radius={0.075} material={mats.coat} />
            <Arm rig={armR} shoulder={[-0.24, 1.56, 0.02]} upper={0.31} fore={0.29} radius={0.062} taper={0.82} material={mats.coat} />
            <Arm rig={armL} shoulder={[0.24, 1.56, 0.02]} upper={0.31} fore={0.29} radius={0.062} taper={0.82} material={mats.coat}
              hand={
                <>
                  <Ball position={[0, 0.03, 0]} radius={0.042} material={mats.glove} scale={[0.95, 1, 0.55]} />
                  {/* Une griffe : quatre doigts tendus, le pouce à l'écart. */}
                  {[-0.03, -0.01, 0.01, 0.03].map((x, i) => (
                    <Limb key={x} from={[x, 0.058, 0]} to={[x * 1.35, 0.135 + (i % 3 === 0 ? -0.012 : 0), 0.024]} radius={0.0098} material={mats.glove} taper={0.78} />
                  ))}
                  <Limb from={[-0.036, 0.018, 0.012]} to={[-0.072, 0.074, 0.03]} radius={0.0108} material={mats.glove} taper={0.8} />
                </>
              } />
            <Limb from={[0, 1.62, 0]} to={[0, 1.78, 0.03]} radius={0.05} material={mats.skin} />

            {/* Tête grise et allongée, calot, masque, grands yeux noirs. Vue de très près : assez de faces. */}
            <group ref={head} position={[0, 1.93, 0.04]}>
              <mesh scale={[0.85, 1.3, 0.95]} material={mats.face}>
                <sphereGeometry args={[0.14, 40, 30]} />
              </mesh>
              {/* Pommettes creusées, arête du nez qui soulève le masque. */}
              <mesh position={[0, 0.006, 0.122]} scale={[0.32, 1.1, 0.62]} material={mats.face}>
                <sphereGeometry args={[0.042, 16, 12]} />
              </mesh>
              <mesh position={[0, 0.1, -0.01]} scale={[0.95, 0.75, 1]} material={mats.cap}>
                <sphereGeometry args={[0.135, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              </mesh>
              <mesh position={[0, -0.075, 0.08]} scale={[1, 0.85, 0.65]} material={mats.mask}>
                <sphereGeometry args={[0.12, 30, 20, -Math.PI / 2, Math.PI, Math.PI / 3, Math.PI / 2]} />
              </mesh>
              {/* Les élastiques du masque, vers les oreilles. */}
              {[-1, 1].map((side) => (
                <Limb key={side} from={[side * 0.1, -0.045, 0.05]} to={[side * 0.118, 0.008, -0.02]} radius={0.0028} material={mats.scrubs} taper={1} />
              ))}
              {/* Yeux trop grands, luisants, et tout au fond une pointe de virus. */}
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.05, 0.035, 0.105]}>
                  <mesh material={mats.eyes} scale={[1, 1.35, 0.6]}>
                    <sphereGeometry args={[0.04, 24, 18]} />
                  </mesh>
                  <mesh position={[side * -0.004, 0.002, 0.0248]} material={mats.pupil}>
                    <circleGeometry args={[0.0065, 14]} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>

      {/* Seringue : construite le long de Y, tournée pour pointer vers +Z ; le gant tient le piston. */}
      <group ref={syringe}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={mats.glass}>
            <cylinderGeometry args={[0.036, 0.036, 0.32, 16, 1, true]} />
          </mesh>
          <mesh ref={liquid} material={mats.liquid}>
            <cylinderGeometry args={[0.03, 0.03, 0.28, 16]} />
          </mesh>
          <mesh position={[0, 0.2, 0]} material={mats.steel}>
            <cylinderGeometry args={[0.003, 0.003, 0.12, 6]} />
          </mesh>
          <mesh position={[0, -0.22, 0]} material={mats.steel}>
            <cylinderGeometry args={[0.008, 0.008, 0.14, 6]} />
          </mesh>
          <Ball position={[0, -0.32, 0]} radius={0.05} material={mats.glove} scale={[1, 0.9, 0.8]} />
        </group>
      </group>
    </>
  )
}
