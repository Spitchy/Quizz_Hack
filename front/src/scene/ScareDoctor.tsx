import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, MeshStandardMaterial, Object3D, Quaternion, Vector3, type Group, type Material, type Mesh, type MeshBasicMaterial, type SpotLight } from 'three'
import type { ScareStage } from '../app/sequence'
import { playAt } from '../audio/stage'
import type { ScareLane } from '../maze/scareLane'
import { BeamMaterial } from './BeamMaterial'
import { DoctorModel } from './Doctor'
import { createDoctorMaterials, doctorFace, glowEyes, HIPS, placeSyringe, setLiquid, torchBeam } from './doctorParts'
import { clamp01, damp, smoothNoise } from './entities/anim'
import { Arm, Ball, Limb } from './entities/parts'
import { createArmRig, poseArm, type ArmRig } from './entities/rig'
import { caughtByBeam, doctorDistance, doctorLeap, JUMP_AT, KICK_IMPACT, kickReach, needleCreep, pickReach, TORCH_REST, torchFall, torchHold, torchLevel, torchRaise } from './scareMotion'
import { VIRUS } from './wakeStage'

// Le médecin dans le labyrinthe, une seule fois. Il attend dans le noir, et rien
// ne le montre que le faisceau de la lampe : pas de lueur à lui, ses yeux et sa
// seringue ne brillent que lorsqu'elle les accroche. Toujours monté, caché sous
// le sol, ses matières dessinées dès le départ : son apparition ne fige rien.

const HIDDEN = new Vector3(0, -40, 0)
/** Du poignet à l'œil (m) : la main avance, l'aiguille finit à quelques centimètres. */
const WRIST_FAR = 0.98
const WRIST_NEAR = 0.72
const HAND_ASIDE = 0.34
const target = new Vector3()
const pole = new Vector3()
const eye = new Vector3()
const dir = new Vector3()
const wrist = new Vector3()
const local = new Vector3()
const blade = new Vector3()
const toHim = new Vector3()
const virus = new Color(VIRUS)

interface ScareDoctorProps {
  stage: ScareStage | null
  lane: ScareLane | null
}

export function ScareDoctor({ stage, lane }: ScareDoctorProps) {
  const gl = useThree((s) => s.gl)
  const mats = useMemo(() => createDoctorMaterials(), [])
  useEffect(() => {
    // Les textures : montées d'avance plutôt qu'au premier affichage.
    gl.initTexture(mats.coatTexture)
    gl.initTexture(mats.faceTexture)
    gl.initTexture(mats.maskTexture)
    return () => {
      Object.values(mats).forEach((m) => m.dispose())
    }
  }, [gl, mats])
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
  const st = useRef({ stage: null as ScareStage | null, at: 0, lean: { value: 0, velocity: 0 }, shrieked: false })

  useFrame(({ clock, camera }, rawDt) => {
    const r = root.current
    const tr = torso.current
    const inn = inner.current
    const h = head.current
    const sy = syringe.current
    if (!r || !tr || !inn || !h || !sy) return
    const s = st.current
    const t = clock.elapsedTime
    if (s.stage !== stage) {
      s.stage = stage
      s.at = t
    }
    const distance = stage && lane ? doctorDistance(stage, t - s.at, lane.reach) : null
    r.visible = distance !== null
    sy.visible = distance !== null
    if (distance === null || !stage || !lane) {
      r.position.copy(HIDDEN)
      return
    }
    const dt = Math.min(rawDt, 0.05)
    const since = t - s.at
    const far = stage === 'torch'
    const hit = stage === 'drop' || (stage === 'kick' && since >= KICK_IMPACT)

    r.position.set(camera.position.x + lane.dir.x * distance, doctorLeap(stage, since), camera.position.z + lane.dir.z * distance)
    r.rotation.y = Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z)

    // Immobile au fond ; sur lui, il se penche, jambes écartées ; projeté, il part en arrière.
    const spread = hit ? 0.45 : far ? 0 : 0.28
    legL.current?.rotation.set(hit ? -0.7 : -spread, 0, 0)
    legR.current?.rotation.set(hit ? 0.2 : spread, 0, 0)
    shinL.current?.rotation.set(hit ? 0.5 : spread, 0, 0)
    shinR.current?.rotation.set(hit ? 0.9 : spread * 0.4, 0, 0)
    // Trop grand pour lui : il se plie en deux, son visage vient au niveau du sien.
    const lean = damp(s.lean, hit ? -0.75 : far ? 0 : 0.62, hit ? 0.09 : 0.05, dt)
    tr.rotation.set(lean, 0, 0)
    tr.position.y = HIPS - (hit ? 0.1 * clamp01((since - KICK_IMPACT) * 2) : far ? 0 : 0.12)
    // Sa tête penche, tremble, et le fixe.
    const tremble = far ? 0.02 : smoothNoise(t * 16, 5) * 0.08
    h.rotation.set(far ? 0.1 : hit ? -lean * 0.9 : -lean * 0.95 + 0.08, 0.05 * tremble, 0.24 + tremble)

    // Le bras droit tend la seringue vers le visage, le gauche attrape.
    inn.updateWorldMatrix(true, false)
    camera.getWorldPosition(eye)
    if (far) {
      target.set(-0.32, 0.98, 0.1)
      poseArm(armR.current, target, pole.set(-0.6, 1.2, -0.5))
      target.set(0.32, 0.98, 0.1)
      poseArm(armL.current, target, pole.set(0.6, 1.2, -0.5))
    } else if (hit) {
      target.set(-0.55, 1.75, -0.05)
      poseArm(armR.current, target, pole.set(-0.8, 1.1, -0.5))
      target.set(0.55, 1.7, 0)
      poseArm(armL.current, target, pole.set(0.8, 1.1, -0.5))
    } else {
      const toEye = WRIST_FAR + (WRIST_NEAR - WRIST_FAR) * needleCreep(stage, since)
      // À gauche de l'image : la semelle arrive à droite.
      local.copy(eye).add(blade.set(lane.dir.x * toEye + lane.dir.z * HAND_ASIDE, -0.2, lane.dir.z * toEye - lane.dir.x * HAND_ASIDE))
      inn.worldToLocal(target.copy(local))
      poseArm(armR.current, target, pole.set(-0.7, 1.1, -0.4))
      // L'autre main, en griffe, l'agrippe au col, du côté où il n'y a pas la lampe.
      local.copy(eye).add(blade.set(lane.dir.x * 0.5 + lane.dir.z * 0.16, -0.42, lane.dir.z * 0.5 - lane.dir.x * 0.16))
      inn.worldToLocal(target.copy(local))
      poseArm(armL.current, target, pole.set(0.7, 1.15, -0.3))
    }
    const fore = armR.current.fore
    if (fore) {
      fore.updateWorldMatrix(true, false)
      fore.localToWorld(wrist.set(0, armR.current.b, 0))
    }
    // L'aiguille vise le cou : on voit toute la seringue, jamais son fond.
    placeSyringe(sy, wrist, hit || far ? blade.copy(wrist).add(dir.set(-0.1, -0.6, 0.2)) : blade.copy(eye).add(dir.set(lane.dir.x * 0.1, -0.4, lane.dir.z * 0.1)))
    h.getWorldPosition(doctorFace)

    // Le hurlement part de lui, à l'instant où il est là.
    if (stage === 'jump' && since >= JUMP_AT && !s.shrieked) {
      s.shrieked = true
      playAt('scream-tall', [r.position.x, 1.8, r.position.z], { gain: 1, rate: 0.9 })
    }

    // Rien ne luit tant que la lampe ne l'a pas trouvé : la pointe de ses yeux, sa seringue.
    toHim.subVectors(doctorFace, torchBeam.from).normalize()
    const caught = torchBeam.level * caughtByBeam(toHim.dot(torchBeam.dir))
    glowEyes(mats, true, t, 0, caught)
    setLiquid(mats, virus, caught)
  })

  return (
    <>
      <DoctorModel parts={{ root, torso, inner, head, legL, legR, shinL, shinR, armR, armL, syringe, liquid }} mats={mats} position={HIDDEN} />
      <ProgramWarmup glass={mats.glass} pupil={mats.pupil} />
    </>
  )
}

/**
 * Quelques éclats invisibles, sous le sol, le temps de quelques images : le verre
 * de la seringue, ses yeux et le faisceau de la lampe sont les seules matières
 * qu'aucun décor n'utilise. Dessinées une fois dans la vraie chaîne d'image, elles
 * ne figeront rien quand elles apparaîtront.
 */
function ProgramWarmup({ glass, pupil }: { glass: Material; pupil: Material }) {
  const group = useRef<Group>(null)
  const frames = useRef(0)
  useFrame(() => {
    if (group.current && frames.current++ > 3) group.current.visible = false
  })
  return (
    <group ref={group} position={[0, -50, 0]}>
      <mesh frustumCulled={false} material={glass}>
        <planeGeometry args={[0.001, 0.001]} />
      </mesh>
      <mesh frustumCulled={false} material={pupil}>
        <planeGeometry args={[0.001, 0.001]} />
      </mesh>
      <mesh frustumCulled={false}>
        <coneGeometry args={[0.001, 0.001, 8, 1, true]} />
        <BeamMaterial color="#fff1dc" opacity={0} />
      </mesh>
    </group>
  )
}

// --- La lampe torche -----------------------------------------------------------

function createTorchMaterials() {
  return {
    // La lumière de la lentille lui revient sur les doigts : assez pour les voir dans le noir.
    sleeve: new MeshStandardMaterial({ color: '#343a45', roughness: 0.92, emissive: '#0c0e12' }),
    skin: new MeshStandardMaterial({ color: '#b1957f', roughness: 0.68, emissive: '#2c2018' }),
    body: new MeshStandardMaterial({ color: '#23252a', roughness: 0.42, metalness: 0.75, emissive: '#111214' }),
    ring: new MeshStandardMaterial({ color: '#8a8d92', roughness: 0.3, metalness: 0.9, emissive: '#3a3a36' }),
  }
}

/** Position de la main levée, repère de la tête. */
const HAND_UP = new Vector3(0.2, -0.21, -0.43)
const HAND_DOWN = new Vector3(0.3, -0.72, -0.2)
/** Il ramène la lampe contre lui, en reculant : elle éclaire le visage de face, par en dessous. */
const HAND_BACK = new Vector3(0.17, -0.27, -0.24)
const SHOULDER: [number, number, number] = [0.24, -0.3, 0.1]
const FORWARD = new Vector3(0, 0, 1)
const aimForward = new Vector3(0, 0, -1)
const smoothAim = new Quaternion()
const handPos = new Vector3()
const beamTip = new Vector3()
const handWorld = new Vector3()
const restPoint = new Vector3()
const fromPoint = new Vector3()
const freeQuat = new Quaternion()
const heldQuat = new Quaternion()
const euler = new Euler(0, 0, 0, 'YXZ')

interface FlashLightProps {
  stage: ScareStage | null
  lane: ScareLane | null
}

/**
 * La lampe : dans sa main droite, puis par terre quand le coup de pied la lui
 * arrache, puis de nouveau dans sa main quand il va la ramasser. La main et la
 * lampe sont deux objets. La lumière reste montée en permanence, éteinte : le
 * nombre de lumières ne change jamais.
 */
export function FlashLight({ stage, lane }: FlashLightProps) {
  const mats = useMemo(() => createTorchMaterials(), [])
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats],
  )
  const rig = useRef<Group>(null)
  const hand = useRef<Group>(null)
  const torch = useRef<Group>(null)
  const beam = useRef<Group>(null)
  const lens = useRef<MeshBasicMaterial>(null)
  const light = useRef<SpotLight>(null)
  const aim = useMemo(() => new Object3D(), [])
  const arm = useRef<ArmRig>(createArmRig())
  const st = useRef({ stage: null as ScareStage | null, at: 0, ready: false, fallAt: 0, handY: 1.3, grabAt: 0 })

  useFrame(({ clock, camera }, rawDt) => {
    const g = rig.current
    const h = hand.current
    const body = torch.current
    const l = light.current
    if (!g || !h || !body || !l) return
    const s = st.current
    const t = clock.elapsedTime
    if (s.stage !== stage) {
      s.stage = stage
      s.at = t
    }
    const since = t - s.at
    const raise = torchRaise(stage, since)
    const level = torchLevel(stage, since)
    const hold = torchHold(stage, since)
    const reach = pickReach(stage, since)

    // Le rang de la main : elle suit la tête, avec un temps de retard.
    g.visible = raise > 0.001
    g.position.copy(camera.position)
    if (!s.ready) {
      smoothAim.copy(camera.quaternion)
      s.ready = true
    }
    smoothAim.slerp(camera.quaternion, 1 - Math.exp(-Math.min(rawDt, 0.05) * 15))
    g.quaternion.copy(smoothAim)

    // Le point de chute, dans le repère du couloir, depuis là où il se tient.
    const f = lane?.dir ?? { x: 0, z: -1 }
    restPoint.set(
      camera.position.x + f.x * TORCH_REST.forward - f.z * TORCH_REST.right,
      0.06,
      camera.position.z + f.z * TORCH_REST.forward + f.x * TORCH_REST.right,
    )

    const onHim = stage === 'jump' || (stage === 'kick' && hold === 'held')
    // Où va la main.
    if (reach > 0 && reach <= 1) {
      // Vers la lampe, par terre : le repère de la main bouge avec lui, pas la lampe.
      handPos.copy(restPoint)
      g.worldToLocal(handPos).lerp(HAND_DOWN, 1 - reach)
    } else if (stage === 'pick') {
      // Refermée sur la lampe, elle remonte en même temps que lui.
      g.worldToLocal(handPos.copy(restPoint)).lerp(HAND_UP, reach - 1)
    } else {
      handPos.lerpVectors(HAND_DOWN, onHim ? HAND_BACK : HAND_UP, raise)
    }
    // Elle tremble dans sa main, de plus en plus.
    const shake = onHim ? 0.012 : stage === 'search' ? 0.006 : 0.0035
    handPos.x += smoothNoise(t * 9, 3) * shake
    handPos.y += smoothNoise(t * 11, 4) * shake
    h.position.copy(handPos)

    // Le faisceau revient vers le milieu de l'image, à quelques mètres ; sur lui, droit au visage.
    if (onHim) beamTip.copy(doctorFace)
    else beamTip.copy(aimForward).multiplyScalar(7).applyQuaternion(smoothAim).add(g.position)
    h.lookAt(beamTip)
    h.getWorldPosition(handWorld)
    // Tendu vers le sol, le poignet rejoint la main ; sinon il reste derrière la lampe.
    const reaching = reach > 0 && reach <= 1
    poseArm(arm.current, target.copy(handPos).add(pole.set(0.01, reaching ? 0.01 : -0.04, reaching ? 0.02 : 0.09)), pole.set(0.55, -0.7, 0.2))

    // La lampe : tenue, elle suit la main ; lâchée, elle tombe.
    body.visible = hold !== 'none'
    if (hold === 'held') {
      if (stage === 'pick' || stage === 'search') {
        // Il la remonte : elle se redresse dans sa main, sans sauter.
        h.getWorldQuaternion(heldQuat)
        body.quaternion.slerp(heldQuat, 1 - Math.exp(-Math.min(rawDt, 0.05) * 11))
      } else {
        h.getWorldQuaternion(body.quaternion)
      }
      body.position.copy(handWorld)
      s.handY = handWorld.y
      fromPoint.copy(handWorld)
      s.fallAt = t
    } else if (hold === 'free' && lane) {
      const fall = torchFall(t - s.fallAt, s.handY)
      body.position.lerpVectors(fromPoint, restPoint, fall.along)
      body.position.y = fall.height
      euler.set(fall.tumble, Math.atan2(lane.dir.x, lane.dir.z) + fall.heading, 0)
      body.quaternion.copy(freeQuat.setFromEuler(euler))
    }

    // La lumière part de la lentille, dans la direction de la lampe.
    const dirNow = torchBeam.dir.copy(FORWARD).applyQuaternion(body.quaternion)
    l.position.copy(body.position).addScaledVector(dirNow, 0.1)
    aim.position.copy(l.position).addScaledVector(dirNow, 7)
    aim.updateMatrixWorld()
    torchBeam.from.copy(l.position)
    torchBeam.level = level
    // Tout près, la même lampe brûle.
    l.intensity = level * (onHim ? 1.25 : hold === 'free' ? 5 : 8.5)
    if (lens.current) lens.current.color.setScalar(0.25 + level * 2.2)
    if (beam.current) beam.current.visible = level > 0.05
  })

  return (
    <>
      <primitive object={aim} />
      <spotLight ref={light} target={aim} color="#fff1dc" intensity={0} distance={24} angle={0.5} penumbra={0.92} decay={1.4} />
      <group ref={rig} visible={false}>
        <Arm rig={arm} shoulder={SHOULDER} upper={0.36} fore={0.34} radius={0.045} taper={0.76} material={mats.sleeve} />
        {/* `lookAt` vise avec +Z : on retourne la main pour la lampe, le long de -Z. */}
        <group ref={hand}>
          <group rotation={[0, Math.PI, 0]}>
            {/* Paume, doigts qui s'enroulent, pouce. */}
            <Ball position={[0.021, -0.004, 0.05]} radius={0.033} material={mats.skin} scale={[0.68, 1, 1.25]} />
            {[0.017, 0.038, 0.059, 0.08].map((z, i) => (
              <group key={z} position={[0, 0, z]}>
                <Limb from={[0.022, -0.018, 0]} to={[-0.018, -0.024, 0]} radius={0.0085 - i * 0.0004} material={mats.skin} taper={0.92} />
                <Limb from={[-0.018, -0.024, 0]} to={[-0.024, 0.006, 0]} radius={0.0078 - i * 0.0004} material={mats.skin} taper={0.86} />
              </group>
            ))}
            <Limb from={[0.024, 0.012, 0.06]} to={[0.007, 0.023, 0.016]} radius={0.0098} material={mats.skin} taper={0.82} />
          </group>
        </group>
      </group>
      {/* La lampe elle-même : son repère vise avec +Z. */}
      <group ref={torch} visible={false}>
        <group rotation={[0, Math.PI, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]} material={mats.body}>
            <cylinderGeometry args={[0.019, 0.019, 0.17, 18]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.065]} material={mats.body}>
            <cylinderGeometry args={[0.033, 0.019, 0.06, 20, 1, true]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.096]} material={mats.ring}>
            <torusGeometry args={[0.0325, 0.0035, 8, 24]} />
          </mesh>
          <mesh position={[0, 0, -0.095]} rotation={[Math.PI, 0, 0]}>
            <circleGeometry args={[0.031, 22]} />
            <meshBasicMaterial ref={lens} color="#ffffff" toneMapped={false} />
          </mesh>
          {/* Dans le noir, un faisceau qu'on voit à peine, chargé de poussière. */}
          <group ref={beam} visible={false}>
            <mesh position={[0, 0, -3.2]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[1.25, 6.2, 22, 1, true]} />
              <BeamMaterial color="#fff1dc" opacity={0.07} near={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}

// --- La jambe du joueur --------------------------------------------------------

function createLegMaterials() {
  return {
    trousers: new MeshStandardMaterial({ color: '#39404d', roughness: 0.95, emissive: '#101218' }),
    shoe: new MeshStandardMaterial({ color: '#2a2622', roughness: 0.5, emissive: '#100e0c' }),
    sole: new MeshStandardMaterial({ color: '#0e0c0b', roughness: 0.9 }),
  }
}

const HIP = new Vector3(0.14, -0.78, 0.08)
const FOOT_DOWN = new Vector3(0.16, -1.65, -0.1)
const FOOT_OUT = new Vector3(0.08, -0.34, -0.8)

/** En vue subjective : la jambe droite qui monte et frappe, au bas de l'image. */
export function KickLeg({ stage }: { stage: ScareStage | null }) {
  const mats = useMemo(() => createLegMaterials(), [])
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats],
  )
  const group = useRef<Group>(null)
  const rig = useRef<ArmRig>(createArmRig())
  const st = useRef({ stage: null as ScareStage | null, at: 0 })

  useFrame(({ clock, camera }) => {
    const g = group.current
    if (!g) return
    const s = st.current
    if (s.stage !== stage) {
      s.stage = stage
      s.at = clock.elapsedTime
    }
    const reach = stage === 'kick' ? kickReach(clock.elapsedTime - s.at) : 0
    g.visible = reach > 0
    if (!g.visible) return
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)
    target.lerpVectors(FOOT_DOWN, FOOT_OUT, reach)
    poseArm(rig.current, target, pole.set(0.34, 0.2, -1.2))
  })

  return (
    <group ref={group} visible={false}>
      <Arm
        rig={rig}
        shoulder={[HIP.x, HIP.y, HIP.z]}
        upper={0.5}
        fore={0.48}
        radius={0.095}
        taper={0.72}
        material={mats.trousers}
        hand={
          <>
            {/* Le long de la jambe : +Y sort par la semelle, +Z vers la pointe. */}
            <Ball position={[0, 0.03, 0.07]} radius={0.075} material={mats.shoe} scale={[0.85, 0.8, 1.9]} />
            <mesh position={[0, 0.095, 0.07]} material={mats.sole}>
              <boxGeometry args={[0.12, 0.03, 0.3]} />
            </mesh>
          </>
        }
      />
    </group>
  )
}
