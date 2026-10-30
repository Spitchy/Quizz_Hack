import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import { drawNewsFrame, NEWS_HEIGHT, NEWS_WIDTH } from '../../app/newsBroadcast'
import { Arm, Ball, Limb } from '../entities/parts'
import { createArmRig, poseArm, type ArmRig } from '../entities/rig'
import { useFontReady } from '../useFontReady'
import { accompliceOut, chaserPose, fillDistance, phonePose, SCREEN, T, VAN_LANE_Z } from './introMotion'
import { hitmanFaceTexture } from './introTextures'

// Ceux qui bougent dans l'intro : ses mains et le téléphone, les tueurs à gages
// sortis de la camionnette. Tout est posé hors rendu, à chaque image, d'après le
// temps de l'intro.

// --- Les mains et le téléphone ---------------------------------------------------

function createHandMaterials() {
  return {
    skin: new MeshStandardMaterial({ color: '#b89f8c', roughness: 0.56 }),
    nail: new MeshStandardMaterial({ color: '#e3d3c6', roughness: 0.22 }),
    sleeve: new MeshStandardMaterial({ color: '#191b20', roughness: 0.92 }),
    body: new MeshStandardMaterial({ color: '#17181c', roughness: 0.28, metalness: 0.8 }),
  }
}

type HandMaterials = ReturnType<typeof createHandMaterials>

/** Un doigt en trois phalanges, de plus en plus fin, qui suit les points donnés. */
function Finger({ points, radius, mats }: { points: readonly (readonly [number, number, number])[]; radius: number; mats: HandMaterials }) {
  return (
    <>
      {points.slice(0, -1).map((from, i) => (
        <Limb
          key={i}
          from={[from[0], from[1], from[2]]}
          to={[points[i + 1][0], points[i + 1][1], points[i + 1][2]]}
          radius={radius * (1 - i * 0.1)}
          material={mats.skin}
          taper={0.92}
        />
      ))}
    </>
  )
}

/**
 * Une main qui tient le bord du téléphone, vue par celui qui le tient : le dos du
 * téléphone cache la paume et les doigts. Il ne reste que le bord de la main, le
 * pouce posé sur le coin de l'écran, et le poignet qui descend vers la manche.
 * L'origine est sur le bord du téléphone, `side` vaut -1 à gauche.
 */
function Grip({ group, side, mats }: { group: RefObject<Group | null>; side: number; mats: HandMaterials }) {
  const s = side
  return (
    <group ref={group}>
      {/* La paume, à plat derrière le téléphone. */}
      <Ball position={[s * 0.004, -0.004, -0.024]} radius={0.033} material={mats.skin} scale={[1.05, 1.25, 0.3]} />
      {/* Le bord de la main, le long de la tranche. */}
      <Ball position={[s * 0.022, -0.008, -0.017]} radius={0.015} material={mats.skin} scale={[0.72, 2.05, 0.9]} />
      {/* La base du pouce, puis le pouce, fin, à plat sur le coin de l'écran. */}
      <Ball position={[s * 0.0155, -0.03, -0.0095]} radius={0.0155} material={mats.skin} scale={[0.92, 1.15, 0.78]} />
      <Finger
        points={[
          [s * 0.015, -0.033, -0.004],
          [s * 0.002, -0.0255, 0.0035],
          [s * -0.0135, -0.0155, 0.0062],
        ]}
        radius={0.0074}
        mats={mats}
      />
      <mesh position={[s * -0.0145, -0.0148, 0.0126]} rotation={[0, 0, s * 0.55]} scale={[0.82, 1, 0.14]} material={mats.nail}>
        <sphereGeometry args={[0.0058, 12, 8]} />
      </mesh>
      {/* Seul l'index dépasse, à peine, au-dessus du coin. */}
      <Finger
        points={[
          [s * 0.021, 0.026, -0.018],
          [s * 0.008, 0.0428, -0.0115],
          [s * -0.003, 0.0438, -0.0065],
        ]}
        radius={0.0062}
        mats={mats}
      />
      {/* Le poignet rentre dans la manche. */}
      <Limb from={[s * 0.022, -0.033, -0.024]} to={[s * 0.046, -0.07, -0.042]} radius={0.0205} material={mats.skin} taper={0.96} />
    </group>
  )
}

/** Le téléphone : un rectangle aux coins arrondis, à peine plus grand que l'écran. */
function phoneShell() {
  const w = SCREEN.width + 0.008
  const h = SCREEN.height + 0.008
  const r = 0.0075
  const s = new Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return new ExtrudeGeometry(s, { depth: 0.007, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -0.0085)
}

const phoneMatrix = new Object3D()
const wristL = new Vector3()
const wristR = new Vector3()
const rest = new Vector3()
const pole = new Vector3()
const target = new Vector3()
const restQuat = new Quaternion()
const SHOULDER_L: [number, number, number] = [-0.22, -0.3, 0.12]
const SHOULDER_R: [number, number, number] = [0.22, -0.3, 0.12]

/** Dessine le bulletin dans la texture (hors rendu React). */
function paintNews(ctx: CanvasRenderingContext2D, texture: CanvasTexture, t: number) {
  drawNewsFrame(ctx, t)
  texture.needsUpdate = true
}

function setBlack(material: MeshBasicMaterial, on: boolean) {
  material.color.setScalar(on ? 1 : 0)
}

export function PhoneHands({ time }: { time: RefObject<number> }) {
  useFontReady('30px "VT323"')
  const mats = useMemo(() => createHandMaterials(), [])
  const shell = useMemo(() => phoneShell(), [])
  const { texture, ctx } = useMemo(() => {
    const el = document.createElement('canvas')
    el.width = NEWS_WIDTH
    el.height = NEWS_HEIGHT
    const page = new CanvasTexture(el)
    page.colorSpace = SRGBColorSpace
    return { texture: page, ctx: el.getContext('2d')! }
  }, [])
  useEffect(
    () => () => {
      texture.dispose()
      shell.dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
    [texture, shell, mats],
  )

  const rig = useRef<Group>(null)
  const phone = useRef<Group>(null)
  const screen = useRef<MeshBasicMaterial>(null)
  const light = useRef<PointLight>(null)
  const gripL = useRef<Group>(null)
  const gripR = useRef<Group>(null)
  const armL = useRef<ArmRig>(createArmRig())
  const armR = useRef<ArmRig>(createArmRig())
  const lastPaint = useRef(-1)

  useFrame(({ camera }) => {
    const t = time.current
    const r = rig.current
    const ph = phone.current
    if (!r || !ph) return
    const aspect = 'aspect' in camera ? (camera.aspect as number) : 16 / 9
    const fov = 'fov' in camera ? (camera.fov as number) : 70
    const pose = phonePose(t, fillDistance(aspect, fov))
    r.visible = pose.present
    if (!pose.present) {
      // Le téléphone rangé, la même lumière devient un appoint froid : on voit les costumes.
      if (light.current) {
        light.current.position.set(0, -0.15, -0.5)
        light.current.intensity = t >= T.van ? 1.1 : 0
      }
      return
    }
    r.position.copy(camera.position)
    r.quaternion.copy(camera.quaternion)
    ph.position.set(pose.x, pose.y, pose.z)
    ph.rotation.set(pose.rx, 0, pose.rz)

    // Une vingtaine d'images par seconde : une vidéo sur un téléphone, et moins de copies.
    if (pose.screenOn && Math.abs(t - lastPaint.current) > 0.045) {
      lastPaint.current = t
      paintNews(ctx, texture, t)
    }
    if (screen.current) setBlack(screen.current, pose.screenOn)
    if (light.current) {
      light.current.position.set(pose.x, pose.y + 0.02, pose.z + 0.2)
      light.current.intensity = pose.glow * 0.03
    }

    // Les mains suivent les bords du téléphone ; la gauche lâche et retombe.
    phoneMatrix.position.copy(ph.position)
    phoneMatrix.quaternion.copy(ph.quaternion)
    phoneMatrix.updateMatrix()
    const halfWidth = SCREEN.width / 2 + 0.005
    const gl = gripL.current
    const gr = gripR.current
    if (gl && gr) {
      rest.set(-0.26, -1, 0.02)
      gl.position.set(-halfWidth, 0, 0).applyMatrix4(phoneMatrix.matrix).lerp(rest, pose.leftRelease)
      gl.quaternion.copy(ph.quaternion).slerp(restQuat.identity(), pose.leftRelease)
      gr.position.set(halfWidth, 0, 0).applyMatrix4(phoneMatrix.matrix)
      gr.quaternion.copy(ph.quaternion)
      wristL.set(-0.046, -0.07, -0.042).applyQuaternion(gl.quaternion).add(gl.position)
      wristR.set(0.046, -0.07, -0.042).applyQuaternion(gr.quaternion).add(gr.position)
      poseArm(armL.current, target.copy(wristL), pole.set(-0.5, -0.7, 0.1))
      poseArm(armR.current, target.copy(wristR), pole.set(0.5, -0.7, 0.1))
    }
  })

  return (
    <>
      <group ref={rig}>
        <group ref={phone}>
          <mesh geometry={shell} material={mats.body} />
          <mesh position={[0, 0, 0.0002]}>
            <planeGeometry args={[SCREEN.width, SCREEN.height]} />
            <meshBasicMaterial ref={screen} map={texture} toneMapped={false} />
          </mesh>
        </group>
        <Grip group={gripL} side={-1} mats={mats} />
        <Grip group={gripR} side={1} mats={mats} />
        <Arm rig={armL} shoulder={SHOULDER_L} upper={0.31} fore={0.28} radius={0.046} taper={0.6} material={mats.sleeve} />
        <Arm rig={armR} shoulder={SHOULDER_R} upper={0.31} fore={0.28} radius={0.046} taper={0.6} material={mats.sleeve} />
      </group>
      {/* Hors du groupe : la lumière reste branchée, le nombre de lumières ne change pas. */}
      <LightInRig light={light} rig={rig} />
    </>
  )
}

/** Le reflet de l'écran sur ses mains, placé dans le repère de la tête. */
function LightInRig({ light, rig }: { light: RefObject<PointLight | null>; rig: RefObject<Group | null> }) {
  const holder = useRef<Group>(null)
  useFrame(() => {
    const h = holder.current
    const r = rig.current
    if (!h || !r) return
    h.position.copy(r.position)
    h.quaternion.copy(r.quaternion)
  })
  return (
    <group ref={holder}>
      <pointLight ref={light} color="#a9c6e6" intensity={0} distance={10} decay={1.5} />
    </group>
  )
}

// --- Les tueurs à gages ----------------------------------------------------------

function createSuitMaterials() {
  const face = hitmanFaceTexture()
  return {
    faceTexture: face,
    face: new MeshStandardMaterial({ map: face, roughness: 0.6 }),
    suit: new MeshStandardMaterial({ color: '#1b1d23', roughness: 0.52, metalness: 0.05 }),
    lapel: new MeshStandardMaterial({ color: '#0d0e12', roughness: 0.26, metalness: 0.1 }),
    shirt: new MeshStandardMaterial({ color: '#d5d3cb', roughness: 0.7 }),
    tie: new MeshStandardMaterial({ color: '#08080a', roughness: 0.22, metalness: 0.25 }),
    skin: new MeshStandardMaterial({ color: '#a38a78', roughness: 0.6 }),
    shades: new MeshStandardMaterial({ color: '#020203', roughness: 0.04, metalness: 1 }),
    glove: new MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.24, metalness: 0.15 }),
    shoe: new MeshStandardMaterial({ color: '#060607', roughness: 0.12, metalness: 0.4 }),
    bat: new MeshStandardMaterial({ color: '#6e5237', roughness: 0.38 }),
    grip: new MeshStandardMaterial({ color: '#2a2622', roughness: 0.7 }),
  }
}

type SuitMaterials = ReturnType<typeof createSuitMaterials>

/** La veste, de l'ourlet aux épaules : coupe droite, cintrée à la taille, épaules carrées. */
function jacketGeometry() {
  const profile = [
    [0.235, 0.78],
    [0.222, 0.94],
    [0.205, 1.1],
    [0.228, 1.28],
    [0.262, 1.42],
    [0.262, 1.5],
    [0.2, 1.565],
    [0.09, 1.6],
  ].map(([r, y]) => new Vector2(r, y))
  return new LatheGeometry(profile, 28)
}

function flatShape(points: readonly (readonly [number, number])[]) {
  const s = new Shape()
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  return s
}

const SHIRT = flatShape([
  [-0.082, 1.53],
  [0.082, 1.53],
  [0, 1.13],
])
const TIE = flatShape([
  [-0.017, 1.515],
  [0.017, 1.515],
  [0.031, 1.27],
  [0, 1.17],
  [-0.031, 1.27],
])
/** Le revers, cranté : ce qui fait une veste. */
const lapel = (s: number) =>
  flatShape([
    [s * 0.082, 1.53],
    [s * 0.15, 1.41],
    [s * 0.098, 1.375],
    [s * 0.112, 1.33],
    [s * 0.004, 1.13],
    [s * 0.042, 1.34],
  ])
const LAPEL_L = lapel(-1)
const LAPEL_R = lapel(1)

interface HitmanProps {
  root: RefObject<Group | null>
  legL: RefObject<Group | null>
  legR: RefObject<Group | null>
  arm: RefObject<ArmRig>
  armIdle: RefObject<ArmRig>
  mats: SuitMaterials
  jacket: LatheGeometry
}

function HitmanLeg({ mats }: { mats: SuitMaterials }) {
  return (
    <>
      {/* Pantalon droit, qui tombe sur la chaussure. */}
      <Limb from={[0, 0, 0]} to={[0, -0.82, 0.015]} radius={0.098} material={mats.suit} taper={0.78} />
      {/* Chaussures de ville, luisantes, longues. */}
      <Ball position={[0, -0.875, 0.075]} radius={0.056} material={mats.shoe} scale={[0.88, 0.6, 2.25]} />
    </>
  )
}

/** La main gantée : le poignet de chemise, la paume, les doigts serrés, le pouce. */
function GlovedHand({ mats }: { mats: SuitMaterials }) {
  return (
    <>
      <Ball position={[0, -0.004, 0]} radius={0.034} material={mats.shirt} scale={[1, 0.42, 1]} />
      <Ball position={[0, 0.054, 0]} radius={0.046} material={mats.glove} scale={[0.9, 1.15, 0.6]} />
      <Ball position={[0, 0.124, 0.012]} radius={0.038} material={mats.glove} scale={[0.95, 1.05, 0.62]} />
      <Limb from={[-0.034, 0.03, 0.014]} to={[-0.046, 0.098, 0.034]} radius={0.0125} material={mats.glove} taper={0.86} />
    </>
  )
}

/**
 * Tueur à gages : costume noir ajusté, chemise blanche, cravate fine, lunettes
 * noires rectangulaires, gants de cuir. Le visage est peint (`hitmanFaceTexture`).
 */
function Hitman({ root, legL, legR, arm, armIdle, mats, jacket }: HitmanProps) {
  return (
    <group ref={root} visible={false} scale={1.04}>
      <Ball position={[0, 0.9, 0]} radius={0.16} material={mats.suit} scale={[1.22, 0.7, 0.8]} />
      <group ref={legL} position={[-0.115, 0.92, 0]}>
        <HitmanLeg mats={mats} />
      </group>
      <group ref={legR} position={[0.115, 0.92, 0]}>
        <HitmanLeg mats={mats} />
      </group>
      <mesh geometry={jacket} scale={[1, 1, 0.6]} material={mats.suit} />
      {/* Chemise, cravate, revers, boutons : collés à la veste, en suivant la pente du buste. */}
      <group position={[0, 1.13, 0.124]} rotation={[0.1, 0, 0]}>
        <group position={[0, -1.13, 0]}>
          <mesh material={mats.shirt}>
            <shapeGeometry args={[SHIRT]} />
          </mesh>
          <mesh position={[0, 0, 0.003]} material={mats.tie}>
            <shapeGeometry args={[TIE]} />
          </mesh>
          <mesh position={[0, 0, 0.006]} material={mats.lapel}>
            <shapeGeometry args={[LAPEL_L]} />
          </mesh>
          <mesh position={[0, 0, 0.006]} material={mats.lapel}>
            <shapeGeometry args={[LAPEL_R]} />
          </mesh>
          {/* La pochette de poitrine, un trait de blanc. */}
          <mesh position={[-0.145, 1.385, 0.0015]} rotation={[0, 0, 0.1]} material={mats.shirt}>
            <planeGeometry args={[0.058, 0.018]} />
          </mesh>
        </group>
      </group>
      <Ball position={[0, 1.075, 0.132]} radius={0.0085} material={mats.lapel} scale={[1, 1, 0.5]} />
      <Ball position={[0, 0.98, 0.135]} radius={0.0085} material={mats.lapel} scale={[1, 1, 0.5]} />
      {/* Les rabats des poches. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.122, 0.965, 0.112]} rotation={[0.12, side * 0.5, 0]} material={mats.lapel}>
          <boxGeometry args={[0.1, 0.022, 0.008]} />
        </mesh>
      ))}
      {/* Épaules de veste. */}
      {[-1, 1].map((side) => (
        <Ball key={side} position={[side * 0.262, 1.465, 0.012]} radius={0.083} material={mats.suit} scale={[1, 0.86, 0.9]} />
      ))}
      {/* Col blanc, cou de taureau. */}
      <mesh position={[0, 1.595, 0.014]} rotation={[Math.PI / 2 - 0.15, 0, 0]} material={mats.shirt}>
        <torusGeometry args={[0.068, 0.0135, 8, 24]} />
      </mesh>
      <Limb from={[0, 1.57, 0]} to={[0, 1.67, 0.012]} radius={0.07} material={mats.skin} taper={0.96} />
      {/* La tête, un peu baissée : il regarde par en dessous. */}
      <group position={[0, 1.752, 0.024]} rotation={[0.1, 0, 0]} scale={1.08}>
        <mesh scale={[0.84, 1.08, 0.98]} material={mats.face} rotation={[0, 0, 0]}>
          <sphereGeometry args={[0.104, 36, 26]} />
        </mesh>
        {/* La mâchoire, large et carrée, qui prend la barbe de la même peinture. */}
        <mesh position={[0, -0.042, 0.008]} scale={[0.86, 0.72, 0.92]} material={mats.face}>
          <sphereGeometry args={[0.094, 28, 18]} />
        </mesh>
        <mesh position={[0, -0.002, 0.097]} scale={[0.56, 1.25, 0.72]} material={mats.skin}>
          <sphereGeometry args={[0.019, 14, 10]} />
        </mesh>
        {[-1, 1].map((side) => (
          <Ball key={side} position={[side * 0.086, 0, -0.002]} radius={0.016} material={mats.skin} scale={[0.42, 1.2, 0.85]} />
        ))}
        {/* Lunettes noires : deux verres rectangulaires, le pont, les branches. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.038, 0.019, 0.088]} rotation={[0, side * 0.26, 0]} material={mats.shades}>
            <boxGeometry args={[0.05, 0.028, 0.006]} />
          </mesh>
        ))}
        <Limb from={[-0.012, 0.024, 0.097]} to={[0.012, 0.024, 0.097]} radius={0.0028} material={mats.shades} taper={1} />
        {[-1, 1].map((side) => (
          <Limb key={side} from={[side * 0.062, 0.024, 0.077]} to={[side * 0.086, 0.021, 0]} radius={0.0024} material={mats.shades} taper={1} />
        ))}
        {/* L'oreillette, et son fil qui descend dans le col. */}
        <Ball position={[0.089, -0.002, 0.008]} radius={0.0065} material={mats.shades} />
        <Limb from={[0.089, -0.008, 0.002]} to={[0.066, -0.14, -0.034]} radius={0.0016} material={mats.shirt} taper={1} />
      </group>
      <Arm rig={arm} shoulder={[0.272, 1.46, 0.012]} upper={0.33} fore={0.3} radius={0.074} taper={0.68} material={mats.suit} hand={<GlovedHand mats={mats} />} />
      <Arm rig={armIdle} shoulder={[-0.272, 1.46, 0.012]} upper={0.33} fore={0.3} radius={0.074} taper={0.68} material={mats.suit} hand={<GlovedHand mats={mats} />} />
    </group>
  )
}

const camWorld = new Vector3()
const wrist = new Vector3()
const tip = new Vector3()
const low = new Vector3()
const up = new Vector3()
const hit = new Vector3()

/** Le complice reste planté devant la porte, la main à l'oreillette. */
function Accomplice({ time, mats, jacket }: { time: RefObject<number>; mats: SuitMaterials; jacket: LatheGeometry }) {
  const root = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const arm = useRef<ArmRig>(createArmRig())
  const armIdle = useRef<ArmRig>(createArmRig())
  useFrame(({ camera }) => {
    const r = root.current
    if (!r) return
    const t = time.current
    r.visible = accompliceOut(t) && t < T.swing
    if (!r.visible) return
    r.position.set(-0.8, 0.0, VAN_LANE_Z + 1.55)
    r.lookAt(camera.position.x, 0, camera.position.z)
    poseArm(arm.current, target.set(0.13, 1.68, 0.02), pole.set(0.8, 1.2, -0.5))
    poseArm(armIdle.current, target.set(-0.26, 0.96, 0.12), pole.set(-0.7, 1.2, -0.4))
  })
  return <Hitman root={root} legL={legL} legR={legR} arm={arm} armIdle={armIdle} mats={mats} jacket={jacket} />
}

/** Batte : fine au manche, large au bout, le long de +Z, depuis le poignet. */
function batGeometry() {
  return new CylinderGeometry(0.058, 0.024, 0.86, 16).rotateX(Math.PI / 2).translate(0, 0, 0.36)
}

/** L'homme à la batte. */
export function Chaser({ time }: { time: RefObject<number> }) {
  const mats = useMemo(() => createSuitMaterials(), [])
  const geometry = useMemo(() => batGeometry(), [])
  const jacket = useMemo(() => jacketGeometry(), [])
  useEffect(
    () => () => {
      geometry.dispose()
      jacket.dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats, geometry, jacket],
  )
  const root = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const arm = useRef<ArmRig>(createArmRig())
  const armIdle = useRef<ArmRig>(createArmRig())
  const bat = useRef<Mesh>(null)
  const phase = useRef(0)

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const r = root.current
    const b = bat.current
    if (!r || !b) return
    const pose = chaserPose(time.current)
    r.visible = pose.visible
    b.visible = pose.visible
    if (!pose.visible) return

    r.position.set(pose.x, 0, pose.z)
    camera.getWorldPosition(camWorld)
    r.rotation.y = Math.atan2(camWorld.x - pose.x, camWorld.z - pose.z)

    phase.current += dt * 7.5 * pose.stride
    const swing = Math.sin(phase.current) * 0.7 * Math.min(1, pose.stride)
    legL.current?.rotation.set(swing, 0, 0)
    legR.current?.rotation.set(-swing, 0, 0)

    // Bras droit : la batte le long du corps, levée, puis abattue vers son visage.
    r.updateWorldMatrix(true, false)
    low.set(0.34, 1.02, 0.14)
    up.set(0.34, 2.02, -0.12)
    hit.set(0.06, 1.62, 0.6)
    target.copy(low).lerp(up, pose.raise).lerp(hit, pose.strike)
    poseArm(arm.current, target, pole.set(0.8, 1.2, -0.5))
    poseArm(armIdle.current, target.set(-0.32, 1.02 + Math.sin(phase.current) * 0.08, 0.12 - Math.cos(phase.current) * 0.16), pole.set(-0.8, 1.2, -0.4))

    const fore = arm.current.fore
    if (fore) {
      fore.updateWorldMatrix(true, false)
      fore.localToWorld(wrist.set(0, arm.current.b, 0))
      b.position.copy(wrist)
      // Du bas : la pointe tombe ; levée : elle part en arrière ; à la fin, dans l'objectif.
      r.localToWorld(tip.set(0.42 + pose.raise * 0.08, 0.3 + pose.raise * 2.45, 0.14 - pose.raise * 0.7))
      tip.lerp(camWorld, pose.strike)
      b.lookAt(tip)
    }
  })

  return (
    <>
      <Hitman root={root} legL={legL} legR={legR} arm={arm} armIdle={armIdle} mats={mats} jacket={jacket} />
      <Accomplice time={time} mats={mats} jacket={jacket} />
      <mesh ref={bat} geometry={geometry} material={mats.bat} visible={false}>
        {/* Le manche, entouré de ruban noir. */}
        <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={mats.grip}>
          <cylinderGeometry args={[0.031, 0.026, 0.2, 12]} />
        </mesh>
      </mesh>
    </>
  )
}
