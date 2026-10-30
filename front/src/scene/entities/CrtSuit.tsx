import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three'
import { PALETTE } from '../layout'
import { lerp, smoothNoise, twitch, type ArchetypeProps } from './anim'
import { Arm, Ball, Limb } from './parts'
import { createArmRig, poseArm } from './rig'

// « L'Employé » : costume de bureau, et à la place de la tête un vieux
// moniteur cathodique. L'écran affiche un œil qui cligne dans la neige.
// Colère : l'écran passe au rouge avec un visage hurlant, le moniteur saute
// par à-coups (glitch), le corps se convulse.
// Attaque : coup de tête avec le moniteur, l'écran flashe en blanc.

const SIGN_AT = new Vector3(0, 1.38, 0.36)
const GRIP_L = new Vector3(-0.64, 0.02, 0.01)
const GRIP_R = new Vector3(0.64, 0.02, 0.01)
/** Coup de tête : élan maximal du moniteur (m). */
const HEADBUTT = 0.3

const target = new Vector3()
const pole = new Vector3()

type ScreenMode = 'eye' | 'scream' | 'grin' | 'flash' | 'ghost'

function drawScreen(ctx: CanvasRenderingContext2D, mode: ScreenMode, phosphor: string, t: number) {
  const w = 128
  const h = 96
  const image = ctx.createImageData(w, h)
  const red = mode === 'scream'
  for (let i = 0; i < image.data.length; i += 4) {
    const n = Math.random() * (mode === 'flash' ? 255 : red ? 140 : 60)
    image.data[i] = mode === 'flash' ? 255 : red ? n * 1.6 : n * 0.5
    image.data[i + 1] = mode === 'flash' ? 255 : red ? n * 0.2 : n * 0.6
    image.data[i + 2] = mode === 'flash' ? 255 : red ? n * 0.2 : n * 0.55
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  if (mode === 'flash' || mode === 'ghost') return

  ctx.strokeStyle = red ? PALETTE.danger : phosphor
  ctx.fillStyle = red ? PALETTE.danger : phosphor
  ctx.lineWidth = 4
  if (mode === 'eye') {
    // Un œil unique qui cligne et fixe.
    const blink = Math.sin(t * 1.3) > 0.97 ? 0.1 : 1
    ctx.beginPath()
    ctx.ellipse(64, 48, 34, 18 * blink, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(64 + Math.sin(t * 0.7) * 10, 48, 9 * blink, 0, Math.PI * 2)
    ctx.fill()
  } else if (mode === 'scream') {
    ctx.beginPath()
    ctx.ellipse(42, 32, 9, 12, 0, 0, Math.PI * 2)
    ctx.ellipse(86, 32, 9, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(64, 70, 22, 18 + Math.sin(t * 40) * 3, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(44, 34, 6, 0, Math.PI * 2)
    ctx.arc(84, 34, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(24, 56)
    ctx.quadraticCurveTo(64, 92, 104, 56)
    ctx.stroke()
  }
  // Lignes de balayage.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1)
}

export function CrtSuit({ look, motion, mats, sign, ghost }: ArchetypeProps) {
  const body = useRef<Group>(null)
  const upper = useRef<Group>(null)
  const monitor = useRef<Group>(null)
  const held = useRef<Group>(null)
  const armL = useRef(createArmRig())
  const armR = useRef(createArmRig())
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const screenMesh = useRef<Mesh>(null)
  const lastDraw = useRef(-1)

  const screen = useMemo(() => {
    const el = document.createElement('canvas')
    el.width = 128
    el.height = 96
    const tex = new CanvasTexture(el)
    tex.colorSpace = SRGBColorSpace
    return { ctx: el.getContext('2d')!, texture: tex }
  }, [])
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
    return () => screen.texture.dispose()
  }, [screen])

  // Boîtier beige, chemise, mains : matières propres à l'employé (sauf en fantôme).
  const own = useMemo(
    () => ({
      casing: new MeshStandardMaterial({ color: '#a39d8e', roughness: 0.6 }),
      shirt: new MeshStandardMaterial({ color: '#d8d4c8', roughness: 0.9 }),
      skin: new MeshStandardMaterial({ color: '#c4b5a0', roughness: 0.8 }),
    }),
    [],
  )
  useEffect(() => () => Object.values(own).forEach((m) => m.dispose()), [own])
  const casing = ghost ? mats.body : own.casing
  const shirt = ghost ? mats.body : own.shirt
  const skin = ghost ? mats.body : own.skin

  useFrame(() => {
    const m = motion.current
    const h = held.current
    if (!m || !upper.current || !monitor.current || !h) return
    const t = m.t + look.phase
    const anger = m.anger

    // Écran : rafraîchi ~12 fois par seconde.
    if (t - lastDraw.current > 0.08 || t < lastDraw.current) {
      lastDraw.current = t
      const mode: ScreenMode = m.ghost
        ? 'ghost'
        : m.attack > 0.5
          ? 'flash'
          : m.mood === 'angry' || m.mood === 'menace'
            ? anger >= 0.95 || m.mood === 'menace' || Math.sin(t * 7) > 0.6
              ? 'scream'
              : 'grin'
            : 'eye'
      drawScreen(screenRef.current.ctx, mode, look.palette.secondary, t)
      screenRef.current.texture.needsUpdate = true
    }

    // Moniteur : petit balancement ; à la colère, des sursauts brefs (tics, pas des sauts d'image).
    const jolt = anger * Math.max(0, twitch(t * 6, 1, 0.28) * 2.4 - 0.6)
    const butt = Math.max(0, m.attack)
    monitor.current.position.set(twitch(t * 6, 2, 0.28) * 0.12 * jolt, 1.93 + twitch(t * 6, 3, 0.28) * 0.08 * jolt, 0.02 + butt * HEADBUTT)
    monitor.current.rotation.set(Math.sin(t * 0.8) * 0.03 + Math.min(0, m.attack) * 0.35 + butt * 0.25, m.lookYaw * 0.7, jolt * 0.25)

    // Convulsions (bruit lissé) ; coup de tête : le buste part en arrière puis en avant, depuis les hanches.
    upper.current.rotation.set(
      lerp(0, 0.45, butt) + Math.min(0, m.attack) * 0.25 + smoothNoise(t * 10, 6) * 0.3 * anger,
      0,
      smoothNoise(t * 10, 9) * 0.2 * anger,
    )

    // Le panneau tremble entre ses mains, qui ne le lâchent pas.
    h.position.set(SIGN_AT.x + smoothNoise(t * 24, 1) * 0.05 * anger, SIGN_AT.y + smoothNoise(t * 21, 2) * 0.04 * anger, SIGN_AT.z)
    h.rotation.set(smoothNoise(t * 25, 3) * 0.12 * anger, 0, smoothNoise(t * 19, 4) * 0.08 * anger)
    h.updateMatrix()
    for (const [rig, grip, side] of [
      [armL.current, GRIP_L, -1],
      [armR.current, GRIP_R, 1],
    ] as const) {
      if (sign) {
        target.copy(grip).applyMatrix4(h.matrix)
      } else {
        // Sans panneau : bras ballants qui se raidissent, mains en avant pour l'agripper.
        const grab = Math.max(butt, anger * 0.5)
        target.set(side * lerp(0.36, 0.24, grab), lerp(1.0, 1.4, grab) + Math.sin(t * 2 + side) * 0.02, lerp(0.08, 0.6, grab))
      }
      pole.set(side * 0.9, 1.3, -0.5)
      poseArm(rig, target, pole)
    }

    // Démarche de bureau, raide.
    const step = Math.sin(m.walkPhase) * 0.4 * m.walk
    legL.current?.rotation.set(step, 0, 0)
    legR.current?.rotation.set(-step, 0, 0)
  })

  return (
    <group ref={body}>
      {/* Pantalon et chaussures. */}
      <group ref={legL} position={[-0.11, 0.95, 0]}>
        <mesh position={[0, -0.47, 0]} material={mats.body}>
          <boxGeometry args={[0.15, 0.95, 0.16]} />
        </mesh>
        <mesh position={[0, -0.93, 0.05]} material={mats.dark}>
          <boxGeometry args={[0.13, 0.07, 0.27]} />
        </mesh>
      </group>
      <group ref={legR} position={[0.11, 0.95, 0]}>
        <mesh position={[0, -0.47, 0]} material={mats.body}>
          <boxGeometry args={[0.15, 0.95, 0.16]} />
        </mesh>
        <mesh position={[0, -0.93, 0.05]} material={mats.dark}>
          <boxGeometry args={[0.13, 0.07, 0.27]} />
        </mesh>
      </group>
      <group ref={upper} position={[0, 0.95, 0]}>
        <group position={[0, -0.95, 0]}>
          {/* Veste, chemise, cravate. */}
          <mesh position={[0, 1.35, 0]} material={mats.body}>
            <boxGeometry args={[0.52, 0.72, 0.26]} />
          </mesh>
          <mesh position={[0, 1.55, 0.132]} material={shirt}>
            <planeGeometry args={[0.16, 0.3]} />
          </mesh>
          <mesh position={[0, 1.45, 0.137]} material={mats.dark}>
            <planeGeometry args={[0.05, 0.36]} />
          </mesh>
          <Limb from={[0, 1.7, 0]} to={[0, 1.8, 0]} radius={0.05} material={mats.body} />

          {/* Bras (manches de veste, mains nues) : présentent le panneau. */}
          <Ball position={[-0.3, 1.64, 0]} radius={0.075} material={mats.body} />
          <Ball position={[0.3, 1.64, 0]} radius={0.075} material={mats.body} />
          <Arm rig={armL} shoulder={[-0.3, 1.64, 0]} upper={0.34} fore={0.33} radius={0.056} taper={0.85} material={mats.body}
            hand={<Ball position={[0, 0.03, 0]} radius={0.042} material={skin} scale={[0.8, 1.2, 0.6]} />} />
          <Arm rig={armR} shoulder={[0.3, 1.64, 0]} upper={0.34} fore={0.33} radius={0.056} taper={0.85} material={mats.body}
            hand={<Ball position={[0, 0.03, 0]} radius={0.042} material={skin} scale={[0.8, 1.2, 0.6]} />} />
          <group ref={held} position={SIGN_AT}>
            {sign}
          </group>

          {/* Le moniteur cathodique en guise de tête. */}
          <group ref={monitor} position={[0, 1.93, 0.02]}>
            <mesh material={casing}>
              <boxGeometry args={[0.44, 0.36, 0.38]} />
            </mesh>
            <mesh position={[0, 0, -0.24]} material={casing}>
              <boxGeometry args={[0.3, 0.24, 0.14]} />
            </mesh>
            <mesh ref={screenMesh} position={[0, 0, 0.191]}>
              <planeGeometry args={[0.36, 0.27]} />
              {ghost ? <primitive object={mats.body} attach="material" /> : <meshBasicMaterial map={screen.texture} toneMapped={false} />}
            </mesh>
        </group>
      </group>
      </group>
    </group>
  )
}
