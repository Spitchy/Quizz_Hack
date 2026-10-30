import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, PlaneGeometry, SRGBColorSpace, type Group } from 'three'
import type { Question } from '../api/client'
import { choiceAt } from './signLayout'
import { drawSignBase, drawSignHighlight, SIGN_BOX, SIGN_FALLBACK_FONT, SIGN_FONT, signContext, type SignBase } from './textures'
import { useFontReady } from './useFontReady'

export const SIGN_WIDTH = 1.25
export const SIGN_HEIGHT = (SIGN_WIDTH * SIGN_BOX.height) / SIGN_BOX.width

interface SignProps {
  question: Question | null
  showQuestion: boolean
  broken: boolean
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

export function Sign({ question, showQuestion, broken, highlight, answer = null, onHover, onPick }: SignProps) {
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
  const halves = useMemo(() => [halfGeometry(0), halfGeometry(1)] as const, [])
  useEffect(() => () => halves.forEach((g) => g.dispose()), [halves])

  // Rupture : chaque moitié pivote autour de la main qui la tient et pend.
  const breakProgress = useRef(broken ? 1 : 0)
  useFrame((_, dt) => {
    const target = broken ? 1 : 0
    // Brisure brutale, réparation instantanée (nouvelle entité).
    breakProgress.current = target === 0 ? 0 : Math.min(1, breakProgress.current + dt * 5)
    const k = breakProgress.current
    const ease = 1 - (1 - k) ** 3
    if (left.current) {
      left.current.rotation.set(0.3 * ease, -0.15 * ease, 0.7 * ease)
      left.current.position.y = -0.05 * ease
    }
    if (right.current) {
      right.current.rotation.set(0.4 * ease, 0.2 * ease, -0.85 * ease)
      right.current.position.y = -0.08 * ease
    }
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
      {/* Pivot sur le bord extérieur de chaque moitié (là où sont les mains). */}
      <group position={[-halfWidth, 0, 0]}>
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
      <group position={[halfWidth, 0, 0]}>
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
  )
}
