import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, PlaneGeometry, SRGBColorSpace, Vector3, type Group, type Mesh, type Object3D } from 'three'
import type { Question } from '../api/client'
import type { Maze } from '../maze/generate'
import { createDebris, isOpen, launchDebris, seatDebris, stepDebris, type Debris } from './entities/signDebris'
import { BREAK_RELEASE, ramp, type SignBreak } from './entities/signBreak'
import { choiceAt } from './signLayout'
import { drawSignBase, drawSignHighlight, SIGN_BOX, SIGN_FALLBACK_FONT, SIGN_FONT, signContext, type SignBase } from './textures'
import { useFontReady } from './useFontReady'

export const SIGN_WIDTH = 1.25
export const SIGN_HEIGHT = (SIGN_WIDTH * SIGN_BOX.height) / SIGN_BOX.width

interface SignProps {
  question: Question | null
  showQuestion: boolean
  broken: boolean
  /** Le geste de ce monstre quand il le détruit. */
  breakStyle?: SignBreak
  /** Pour que les morceaux rebondissent sur les murs au lieu de les traverser. */
  maze?: Maze
  highlight: number | null
  /** Mode test (mock) : bonne réponse cochée. Le vrai back ne la donne jamais. */
  answer?: number | null
  onHover?: (choice: number | null) => void
  onPick?: (choice: number) => void
}

function toSignTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const blankSigns = new Map<boolean, CanvasTexture>()

/** Texture partagée d'un panneau sans texte (intact ou fendu). */
function blankSign(cracked: boolean): CanvasTexture {
  let texture = blankSigns.get(cracked)
  if (!texture) {
    const canvas = document.createElement('canvas')
    drawSignBase(canvas, null, { cracked, font: SIGN_FALLBACK_FONT })
    texture = toSignTexture(canvas)
    blankSigns.set(cracked, texture)
  }
  return texture
}

/**
 * Surface d'un panneau lisible : un canvas et une texture, créés une fois et
 * repeints sur place. Le fond (question, taches, grain) est mis en cache par
 * question ; changer de visée ne fait que recopier ce fond et repasser une ligne.
 */
interface SignSurface {
  canvas: HTMLCanvasElement | null
  texture: CanvasTexture | null
  base: HTMLCanvasElement | null
  baseKey: string
  drawn: SignBase | null
}

const createSurface = (): SignSurface => ({ canvas: null, texture: null, base: null, baseKey: '', drawn: null })

interface PaintOptions {
  highlight: number | null
  cracked: boolean
  font: string
  answer: number | null
}

/** Repeint la surface (hors rendu React) et renvoie sa texture et sa mise en page. */
function paintSign(surface: SignSurface, question: Question, options: PaintOptions) {
  if (!surface.canvas) {
    surface.canvas = document.createElement('canvas')
    surface.canvas.width = SIGN_BOX.width
    surface.canvas.height = SIGN_BOX.height
    surface.base = document.createElement('canvas')
    surface.texture = toSignTexture(surface.canvas)
  }
  const key = `${question.id}|${options.cracked}|${options.font}|${options.answer}`
  if (key !== surface.baseKey || !surface.drawn) {
    surface.drawn = drawSignBase(surface.base!, question, options)
    surface.baseKey = key
  }
  const ctx = signContext(surface.canvas)
  ctx.drawImage(surface.base!, 0, 0)
  drawSignHighlight(ctx, surface.drawn, options.highlight, options.font)
  surface.texture!.needsUpdate = true
  return { texture: surface.texture!, layout: surface.drawn.layout }
}

function disposeSurface(surface: SignSurface) {
  surface.texture?.dispose()
  surface.texture = null
  surface.canvas = null
  surface.base = null
  surface.drawn = null
  surface.baseKey = ''
}

/** Moitié gauche ou droite du panneau : UV restreints à sa moitié de texture. */
function halfGeometry(side: 0 | 1): PlaneGeometry {
  const geometry = new PlaneGeometry(SIGN_WIDTH / 2, SIGN_HEIGHT)
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + side * 0.5)
  return geometry
}

interface SignParts {
  whole: Group | null
  leftEdge: Group | null
  rightEdge: Group | null
  left: Group | null
  right: Group | null
  ball: Mesh | null
}

interface BreakState {
  since: number | null
  style: SignBreak
  launched: boolean
  whole: Debris
  left: Debris
  right: Debris
  ball: Debris
}

const createBreakState = (): BreakState => ({
  since: null,
  style: 'snap',
  launched: false,
  whole: createDebris(0.03, 0.66, 0.5),
  left: createDebris(0.025, 0.66, -0.7),
  right: createDebris(0.035, 0.66, 2.1),
  ball: createDebris(0.11, 0.12, null),
})

const forward = new Vector3()
const lateral = new Vector3()
const velocity = new Vector3()
const spin = new Vector3()

/** Vers où il peut jeter sans viser un mur : l'axe du panneau et le côté le plus dégagé. */
function aimFrom(part: Object3D, maze: Maze | undefined): number {
  part.getWorldDirection(forward)
  forward.y = 0
  forward.normalize()
  lateral.set(forward.z, 0, -forward.x)
  part.getWorldPosition(velocity)
  return isOpen(maze, velocity.x + lateral.x, velocity.z + lateral.z, 0.3) ? 1 : -1
}

/** Un morceau par côté, qui part de son côté. */
function launchHalves(s: BreakState, parts: SignParts, maze: Maze | undefined, spread: number, up: number, ahead: number) {
  const { leftEdge, rightEdge } = parts
  if (!leftEdge || !rightEdge) return
  aimFrom(leftEdge, maze)
  launchDebris(s.left, leftEdge, velocity.copy(lateral).multiplyScalar(spread).addScaledVector(forward, ahead).setY(up), spin.set(3, -5, 4))
  launchDebris(s.right, rightEdge, velocity.copy(lateral).multiplyScalar(-spread).addScaledVector(forward, ahead).setY(up * 0.85), spin.set(-4, 6, -3))
}

/** Une image de la destruction du panneau (hors rendu React). */
function animateBreak(s: BreakState, parts: SignParts, dt: number, maze: Maze | undefined) {
  const { whole, left, right, ball, leftEdge, rightEdge } = parts
  if (s.since === null || !whole || !left || !right || !leftEdge || !rightEdge || !ball) return
  s.since += dt
  const t = s.since
  const release = BREAK_RELEASE[s.style]
  const due = release !== null && t >= release && !s.launched

  switch (s.style) {
    case 'snap': {
      // Il se rompt d'un coup, et chaque moitié pivote autour de la main qui la tient.
      const k = Math.min(1, t * 5)
      const e = 1 - (1 - k) ** 3
      left.rotation.set(0.3 * e, -0.15 * e, 0.7 * e)
      left.position.y = -0.05 * e
      right.rotation.set(0.4 * e, 0.2 * e, -0.85 * e)
      right.position.y = -0.08 * e
      break
    }
    case 'throw':
      if (due) {
        const side = aimFrom(whole, maze)
        velocity.copy(forward).multiplyScalar(2.3).addScaledVector(lateral, side * 1.9).setY(2.3)
        launchDebris(s.whole, whole, velocity, spin.set(5, 8, 3.5))
      }
      break
    case 'tear': {
      // Il tire : la déchirure s'ouvre à partir du milieu.
      const k = ramp(0.05, 0.5, t)
      left.rotation.set(0.1 * k, 0, 0.32 * k)
      right.rotation.set(-0.1 * k, 0, -0.26 * k)
      if (due) launchHalves(s, parts, maze, 1.7, 1.5, 0.7)
      break
    }
    case 'smash':
      if (due) {
        // Il l'abat : les deux moitiés éclatent, à peine au-dessus du sol.
        left.rotation.set(0.4, 0, 0.5)
        right.rotation.set(-0.3, 0, -0.5)
        launchHalves(s, parts, maze, 2.1, 1.1, 1)
      }
      break
    case 'crumple': {
      const k = ramp(0.02, 0.55, t)
      whole.scale.set(1 - 0.93 * k, 1 - 0.88 * k, 1)
      whole.rotation.z = Math.sin(t * 38) * 0.14 * k
      whole.rotation.x = Math.sin(t * 31) * 0.1 * k
      whole.visible = k < 0.97
      ball.visible = k > 0.3
      if (!s.launched) ball.scale.setScalar(0.125 * ramp(0.25, 0.6, t))
      if (due) {
        const side = aimFrom(ball, maze)
        velocity.copy(forward).multiplyScalar(1.35).addScaledVector(lateral, side * 0.75).setY(0.5)
        launchDebris(s.ball, ball, velocity, spin.set(7, 3, 5))
      }
      break
    }
    case 'devour': {
      const k = ramp(0.1, 0.85, t)
      whole.scale.setScalar(Math.max(0.001, 1 - k))
      whole.rotation.z = Math.sin(t * 26) * 0.2 * k
      whole.visible = k < 0.99
      break
    }
  }
  if (due) s.launched = true

  for (const [debris, part] of [
    [s.whole, whole],
    [s.left, leftEdge],
    [s.right, rightEdge],
    [s.ball, ball],
  ] as const) {
    if (!debris.active) continue
    stepDebris(debris, Math.min(dt, 0.05), maze)
    seatDebris(debris, part)
  }
}

export function Sign({ question, showQuestion, broken, breakStyle = 'snap', maze, highlight, answer = null, onHover, onPick }: SignProps) {
  const fontReady = useFontReady(`48px ${SIGN_FONT}`)
  const font = fontReady ? SIGN_FONT : SIGN_FALLBACK_FONT

  // Les panneaux vierges (toutes les entités pas encore abordées) partagent
  // leur texture ; un panneau lisible repeint la sienne sur place.
  const surface = useMemo(() => createSurface(), [])
  useEffect(() => () => disposeSurface(surface), [surface])
  const { texture, layout } = useMemo(() => {
    if (!showQuestion || !question) return { texture: blankSign(broken), layout: null }
    return paintSign(surface, question, { highlight, cracked: broken, font, answer })
  }, [surface, question, showQuestion, broken, highlight, font, answer])

  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const whole = useRef<Group>(null)
  const leftEdge = useRef<Group>(null)
  const rightEdge = useRef<Group>(null)
  const ball = useRef<Mesh>(null)
  const halves = useMemo(() => [halfGeometry(0), halfGeometry(1)] as const, [])
  useEffect(() => () => halves.forEach((g) => g.dispose()), [halves])

  // Rupture : le geste de ce monstre. Un panneau déjà brisé au montage (partie
  // reprise) reste simplement cassé en deux entre ses mains.
  const brokenAtMount = useRef(broken)
  const breaking = useRef(createBreakState())
  useFrame((_, dt) => {
    const s = breaking.current
    if (!broken) return
    if (s.since === null) {
      s.since = brokenAtMount.current ? 1 : 0
      s.style = brokenAtMount.current ? 'snap' : breakStyle
    }
    animateBreak(s, { whole: whole.current, leftEdge: leftEdge.current, rightEdge: rightEdge.current, left: left.current, right: right.current, ball: ball.current }, dt, maze)
  })

  const toChoice = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!layout || !e.uv || broken || !showQuestion) return null
    // `uv.x` vaut 0..0.5 sur la moitié gauche ; seule la hauteur compte.
    return choiceAt(layout, (1 - e.uv.y) * SIGN_BOX.height)
  }

  const halfWidth = SIGN_WIDTH / 2
  const interactive = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => onHover?.(toChoice(e)),
    onPointerOut: () => onHover?.(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const choice = toChoice(e)
      if (choice !== null) onPick?.(choice)
    },
  }

  return (
    <group>
      {/* Le panneau écrasé en boule : invisible tant qu'il n'a pas servi. */}
      <mesh ref={ball} visible={false} scale={0.001}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
      <group ref={whole}>
      {/* Pivot sur le bord extérieur de chaque moitié (là où sont les mains). */}
      <group ref={leftEdge} position={[-halfWidth, 0, 0]}>
        <group ref={left}>
          <mesh position={[halfWidth / 2, 0, 0]} geometry={halves[0]} {...interactive}>
            <meshStandardMaterial map={texture} roughness={0.85} />
          </mesh>
          <mesh position={[halfWidth / 2, 0, -0.012]}>
            <boxGeometry args={[halfWidth, SIGN_HEIGHT, 0.02]} />
            <meshStandardMaterial color="#3b3220" roughness={1} />
          </mesh>
        </group>
      </group>
      <group ref={rightEdge} position={[halfWidth, 0, 0]}>
        <group ref={right}>
          <mesh position={[-halfWidth / 2, 0, 0]} geometry={halves[1]} {...interactive}>
            <meshStandardMaterial map={texture} roughness={0.85} />
          </mesh>
          <mesh position={[-halfWidth / 2, 0, -0.012]}>
            <boxGeometry args={[halfWidth, SIGN_HEIGHT, 0.02]} />
            <meshStandardMaterial color="#3b3220" roughness={1} />
          </mesh>
        </group>
      </group>
      </group>
    </group>
  )
}
