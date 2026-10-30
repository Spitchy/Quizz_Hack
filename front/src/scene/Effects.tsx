import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Scanline, Vignette, wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, type BloomEffect, type ChromaticAberrationEffect } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { Vector2 } from 'three'
import { CctvEffect, driveCctv } from './cctv'

const Cctv = wrapEffect(CctvEffect)

// Post-traitement : grain, vignette, scanlines légères, et une aberration
// chromatique qui augmente avec le danger et claque sur les mauvaises réponses.

const halved = new WeakSet<BloomEffect>()
const drawing = new Vector2()

/**
 * Le halo est flou par nature : on le calcule à demi-résolution (extraction des
 * zones claires et flou mipmap), quatre fois moins de pixels pour le même rendu.
 * Avec `mipmapBlur`, l'option `resolutionScale` de la bibliothèque est ignorée.
 */
function halveBloom(effect: BloomEffect, width: number, height: number) {
  if (!halved.has(effect)) {
    halved.add(effect)
    const setSize = effect.setSize.bind(effect)
    effect.setSize = (w: number, h: number) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))
  }
  effect.setSize(width, height)
}

interface EffectsProps {
  danger: number
  shake: number
  /** Pièce blanche de la victoire : éblouissement, vignette légère. */
  bright?: boolean
  /** Défaite : image de caméra de surveillance. */
  cctv?: boolean
  /** Lissage des arêtes dans la chaîne d'image (0 : aucun, le jeu reste fluide). */
  msaa?: number
  /** Moins de grain et de vignette : l'intro se regarde, elle ne se joue pas. */
  soft?: boolean
}

export function Effects({ danger, shake, bright = false, cctv = false, msaa = 0, soft = false }: EffectsProps) {
  const chroma = useRef<ChromaticAberrationEffect>(null)
  const offset = useMemo(() => new Vector2(0.0006, 0.0006), [])
  const pulse = useRef(0)
  const bloom = useRef<BloomEffect>(null)
  const feed = useRef<CctvEffect>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  useEffect(() => {
    if (!bloom.current) return
    gl.getDrawingBufferSize(drawing)
    halveBloom(bloom.current, drawing.x, drawing.y)
  }, [gl, size, dpr])

  useEffect(() => {
    if (shake > 0) pulse.current = 1
  }, [shake])

  useFrame(({ clock }, dt) => {
    pulse.current = Math.max(0, pulse.current - dt * 2.5)
    const t = clock.elapsedTime
    // Sursauts aléatoires quand l'infection est avancée.
    const glitch = danger > 0.5 && Math.sin(t * 13.7) > 0.97 ? 0.004 : 0
    const amount = 0.0006 + danger * 0.0032 + pulse.current * 0.006 + glitch
    chroma.current?.offset.set(amount, amount * 0.6)
    // La coupe sur la caméra de surveillance est franche, son retrait aussi.
    if (feed.current) driveCctv(feed.current, cctv ? 1 : 0, t)
  })

  return (
    <EffectComposer multisampling={msaa}>
      <Bloom ref={bloom} luminanceThreshold={bright ? 0.95 : 0.75} luminanceSmoothing={0.2} intensity={bright ? 0.35 : 0.9} mipmapBlur />
      <ChromaticAberration ref={chroma} offset={offset} radialModulation={false} modulationOffset={0} />
      <Scanline density={1.4} opacity={0.07} blendFunction={BlendFunction.OVERLAY} />
      <Noise opacity={bright ? 0.06 : soft ? 0.07 : 0.16} premultiply blendFunction={BlendFunction.SCREEN} />
      <Vignette offset={0.22} darkness={bright ? 0.25 : soft ? 0.72 : 0.9} />
      <Cctv ref={feed} />
    </EffectComposer>
  )
}
