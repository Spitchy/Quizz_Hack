import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type PointLight,
  type Texture,
} from 'three'
import type { DefeatStage } from '../app/sequence'
import { Doctor } from './Doctor'
import { clamp01, ease } from './entities/anim'
import { neonFlicker } from './flicker'
import { PALETTE } from './layout'
import { WakeBody } from './WakeBody'
import { WakeCamera } from './WakeCamera'
import { DOOR, INJECT, ROOM, VIRUS } from './wakeStage'

// Défaite, deuxième acte : le joueur se réveille sanglé sur une chaise dans
// une petite pièce carrelée, en sang, sous perfusion (`WakeBody.tsx`). Un
// moniteur affiche son score. La porte d'en face s'ouvre ; le « médecin »
// entre et l'injecte (`Doctor.tsx`). Caméra entièrement dirigée
// (`WakeCamera.tsx`). Tout reste une mise en scène dans l'onglet.

export interface WakeScore {
  pseudo: string | null
  score: number
  scoreMax: number
  errors: number
  maxErrors: number
}

function tileTexture(): CanvasTexture {
  const el = document.createElement('canvas')
  el.width = el.height = 256
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#b9b6a6'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(40,38,30,0.6)'
  ctx.lineWidth = 3
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  // Taches et rouille.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 10 + Math.random() * 50
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(70,50,20,0.35)')
    g.addColorStop(1, 'rgba(70,50,20,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(4, 3)
  return t
}

/** Carrelage d'un pan de mur de `width` × `height` m, à la même échelle que la pièce. */
function wallTiles(tiles: Texture, width: number, height: number, offsetX: number): Texture {
  const t = tiles.clone()
  t.repeat.set((width / (ROOM.halfWidth * 2)) * 4, (height / ROOM.height) * 3)
  t.offset.set((offsetX / (ROOM.halfWidth * 2)) * 4, 0)
  t.needsUpdate = true
  return t
}

/** Mur d'en face, en trois pans autour de l'ouverture de la porte. */
const FRONT_PIECES = [
  { x0: -ROOM.halfWidth, x1: DOOR.hingeX, y0: 0, y1: ROOM.height },
  { x0: DOOR.hingeX + DOOR.width, x1: ROOM.halfWidth, y0: 0, y1: ROOM.height },
  { x0: DOOR.hingeX, x1: DOOR.hingeX + DOOR.width, y0: DOOR.height, y1: ROOM.height },
]

/** Ouverture de la porte : 0 fermée, 1 grande ouverte (vers l'intérieur). */
function doorOpening(stage: DefeatStage, since: number): number {
  if (stage === 'wake') return 0
  if (stage === 'inject') return ease(clamp01(since / INJECT.door))
  return 1
}

/** Pose la porte et la lumière du couloir qu'elle découvre (hors rendu React). */
function swingDoor(door: Group, light: PointLight, open: number, t: number) {
  door.rotation.y = -open * 1.5
  light.intensity = open * 2.2 * neonFlicker(t, 0.8, 13)
}

const STATUS: Record<DefeatStage, string> = {
  freeze: '',
  approach: '',
  beat: '',
  knockout: '',
  wake: '> SUJET RÉVEILLÉ',
  inject: '> INJECTION EN COURS…',
  infected: '> VIRUS ACTIF',
  over: '> VIRUS ACTIF',
}

function monitorTexture(score: WakeScore, stage: DefeatStage) {
  const el = document.createElement('canvas')
  el.width = 512
  el.height = 384
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#060807'
  ctx.fillRect(0, 0, 512, 384)
  ctx.font = '34px "VT323", monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = PALETTE.text
  const lines = [
    `SUJET      ${score.pseudo ?? 'INCONNU'}`,
    `SCORE      ${String(score.score).padStart(4, '0')} / ${score.scoreMax}`,
    `ERREURS    ${score.errors} / ${score.maxErrors}`,
    `INFECTION  100 %`,
  ]
  lines.forEach((line, i) => ctx.fillText(line, 34, 40 + i * 52))
  const infected = stage === 'infected' || stage === 'over'
  ctx.fillStyle = infected ? PALETTE.danger : VIRUS
  ctx.fillText(STATUS[stage], 34, 40 + lines.length * 52 + 20)
  // Lignes de balayage.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 512, 2)
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  return t
}

export function WakeRoom({ stage, score }: { stage: DefeatStage; score: WakeScore }) {
  const tiles = useMemo(() => tileTexture(), [])
  const walls = useMemo(() => {
    const hidden = new MeshStandardMaterial({ visible: false })
    const tiled = new MeshStandardMaterial({ map: tiles, side: BackSide, roughness: 0.7 })
    const front = FRONT_PIECES.map((p) => {
      const map = wallTiles(tiles, p.x1 - p.x0, p.y1 - p.y0, p.x0 + ROOM.halfWidth)
      return new MeshStandardMaterial({ map, roughness: 0.7 })
    })
    // Faces de la boîte : +x, -x, +y, -y, +z, -z (le mur d'en face est fait à part, percé).
    return { box: [tiled, tiled, tiled, tiled, tiled, hidden], front, hidden, tiled }
  }, [tiles])
  useEffect(
    () => () => {
      tiles.dispose()
      walls.hidden.dispose()
      walls.tiled.dispose()
      walls.front.forEach((m) => {
        m.map?.dispose()
        m.dispose()
      })
    },
    [tiles, walls],
  )
  const screen = useMemo(() => monitorTexture(score, stage), [score, stage])
  useEffect(() => () => screen.dispose(), [screen])
  const bulb = useRef<PointLight>(null)
  const bulbGlow = useRef<Mesh>(null)
  const door = useRef<Group>(null)
  const corridor = useRef<PointLight>(null)
  const started = useRef<{ stage: DefeatStage | null; at: number }>({ stage: null, at: 0 })
  const warm = useMemo(() => new Color('#ffe7b0'), [])
  const sick = useMemo(() => new Color(VIRUS), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (started.current.stage !== stage) started.current = { stage, at: t }
    const infected = stage === 'infected' || stage === 'over'
    const k = neonFlicker(t, infected ? 1 : 0.4, 7)
    if (bulb.current) {
      bulb.current.intensity = 3.2 * k
      bulb.current.color.copy(infected ? sick : warm)
    }
    const glow = bulbGlow.current?.material
    if (glow && 'color' in glow) (glow.color as Color).copy(infected ? sick : warm).multiplyScalar(1.5 * k)
    if (door.current && corridor.current) swingDoor(door.current, corridor.current, doorOpening(stage, t - started.current.at), t)
  })

  const doorCenter = DOOR.hingeX + DOOR.width / 2
  return (
    <>
      <color attach="background" args={['#050505']} />
      <fogExp2 attach="fog" args={['#050505', 0.08]} />
      <ambientLight intensity={0.03} />

      {/* Pièce carrelée, vue de l'intérieur ; le mur d'en face est percé d'une porte. */}
      <mesh position={[0, ROOM.height / 2, 0]} material={walls.box}>
        <boxGeometry args={[ROOM.halfWidth * 2, ROOM.height, ROOM.halfDepth * 2]} />
      </mesh>
      {FRONT_PIECES.map((p, i) => (
        <mesh key={i} position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, DOOR.z]} material={walls.front[i]}>
          <planeGeometry args={[p.x1 - p.x0, p.y1 - p.y0]} />
        </mesh>
      ))}

      {/* Chambranle, porte métallique à hublot, couloir sombre derrière. */}
      {([
        [DOOR.hingeX - 0.03, DOOR.height / 2, 0.06, DOOR.height],
        [DOOR.hingeX + DOOR.width + 0.03, DOOR.height / 2, 0.06, DOOR.height],
        [doorCenter, DOOR.height + 0.03, DOOR.width + 0.12, 0.06],
      ] as const).map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, DOOR.z + 0.02]}>
          <boxGeometry args={[w, h, 0.07]} />
          <meshStandardMaterial color="#2c302e" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      <group ref={door} position={[DOOR.hingeX, 0, DOOR.z + 0.03]}>
        <mesh position={[DOOR.width / 2, DOOR.height / 2, 0]}>
          <boxGeometry args={[DOOR.width - 0.02, DOOR.height - 0.02, 0.045]} />
          <meshStandardMaterial color="#56605a" metalness={0.45} roughness={0.55} />
        </mesh>
        <mesh position={[DOOR.width / 2, 1.55, 0.025]}>
          <planeGeometry args={[0.3, 0.36]} />
          <meshStandardMaterial color="#0c0f0e" roughness={0.15} metalness={0.3} />
        </mesh>
        <mesh position={[DOOR.width - 0.12, 1.0, 0.045]}>
          <boxGeometry args={[0.12, 0.025, 0.03]} />
          <meshStandardMaterial color="#a8a69e" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[DOOR.width / 2, 0.15, 0.024]}>
          <planeGeometry args={[DOOR.width - 0.1, 0.25]} />
          <meshStandardMaterial color="#3d2a22" roughness={0.7} />
        </mesh>
      </group>
      <mesh position={[doorCenter, DOOR.height / 2, DOOR.z - 1.3]}>
        <boxGeometry args={[DOOR.width + 0.1, DOOR.height, 2.6]} />
        <meshStandardMaterial color="#1e2220" side={BackSide} roughness={0.9} />
      </mesh>
      <pointLight ref={corridor} position={[doorCenter, 1.95, DOOR.z - 2.2]} color="#c9e0c8" distance={6} decay={1.6} intensity={0} />

      {/* Ampoule nue au bout de son fil. */}
      <mesh position={[0, 2.62, 0.5]}>
        <cylinderGeometry args={[0.004, 0.004, 0.35, 4]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <mesh ref={bulbGlow} position={[0, 2.42, 0.5]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <pointLight ref={bulb} position={[0, 2.3, 0.5]} distance={7} decay={1.8} />

      {/* Table et moniteur. */}
      <mesh position={[0, 0.72, -0.35]}>
        <boxGeometry args={[1.4, 0.06, 0.8]} />
        <meshStandardMaterial color="#2a2620" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.02, -0.5]}>
        <boxGeometry args={[0.66, 0.52, 0.48]} />
        <meshStandardMaterial color="#25241f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.03, -0.255]}>
        <planeGeometry args={[0.56, 0.42]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>

      <WakeBody stage={stage} />
      <Doctor stage={stage} />
      <WakeCamera stage={stage} />
    </>
  )
}
