import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three'
import { particleTexture } from './entities/particles'
import { adaptDpr, DPR_CEILING, initialDpr, median } from './adaptiveDpr'

// Fluidité sans rogner l'image : résolution adaptative, shaders compilés
// d'avance (pas de gel quand un effet apparaît pour la première fois).

/** Durée d'une fenêtre de mesure (s). */
const WINDOW = 1

/** Ajuste la densité de pixels par paliers selon la médiane des durées d'image. */
export function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr)
  const state = useRef(initialDpr(DPR_CEILING))
  const meter = useRef({ samples: [] as number[], elapsed: 0 })
  useFrame((_, dt) => {
    const w = meter.current
    w.samples.push(dt * 1000)
    w.elapsed += dt
    if (w.elapsed < WINDOW) return
    // Onglet en arrière-plan ou pause du débogueur : fenêtre ignorée.
    const frame = w.elapsed / w.samples.length < 0.25 ? median(w.samples) : 0
    w.samples.length = 0
    w.elapsed = 0
    if (!frame) return
    const next = adaptDpr(state.current, frame, DPR_CEILING)
    if (next.dpr !== state.current.dpr) setDpr(next.dpr)
    state.current = next
  })
  return null
}

/**
 * Compile tous les shaders de la scène dès qu'elle est montée, lumières
 * comprises, plutôt qu'au premier affichage de chaque matière. `deps` :
 * recompiler quand le décor change (autre labyrinthe, autre pièce).
 */
export function ShaderWarmup({ deps }: { deps: unknown }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    // Une image plus tard : les composants enfants ont posé leurs matières.
    const id = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).catch(() => {})
    })
    return () => cancelAnimationFrame(id)
  }, [gl, scene, camera, deps])
  return null
}

/**
 * Un point invisible (sous le sol) avec exactement les réglages de matière de
 * la désintégration : son programme est prêt avant la première bonne réponse.
 */
export function ParticleWarmup() {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(3), 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points geometry={geometry} position={[0, -50, 0]} frustumCulled={false}>
      <pointsMaterial
        size={0.001}
        map={particleTexture()}
        alphaTest={0.02}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

/**
 * Outil de test, absent du build de production : la scène et le moteur de
 * rendu, pour les inspecter depuis la console, et une pause de l'image
 * (capture d'un instant précis).
 */
export function DevSceneHook() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const setFrameloop = useThree((s) => s.setFrameloop)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhScene?: unknown; __qhGl?: unknown; __qhPause?: (paused: boolean) => void }
    debug.__qhScene = scene
    debug.__qhGl = gl
    debug.__qhPause = (paused) => setFrameloop(paused ? 'never' : 'always')
    return () => {
      delete debug.__qhScene
      delete debug.__qhGl
      delete debug.__qhPause
    }
  }, [scene, gl, setFrameloop])
  return null
}
