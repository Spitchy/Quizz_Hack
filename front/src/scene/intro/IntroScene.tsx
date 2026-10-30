import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { IntroStage } from '../../app/sequence'
import { useIntroSound } from '../../audio/useSoundDirector'
import { AdaptiveDpr, DevSceneHook } from '../Performance'
import { DPR_CEILING } from '../adaptiveDpr'
import { Effects } from '../Effects'
import { Chaser, PhoneHands } from './IntroCast'
import { headPose, introTime } from './introMotion'
import { FogBanks, IntroStreet, Rain } from './IntroStreet'
import { createIntroTextures, FOG_COLOR } from './introTextures'
import { Van } from './IntroVehicles'

// L'intro, en 3D : c'est la même caméra du premier au dernier plan, c'est ce qui
// rend le recul continu entre le plein écran et le téléphone dans ses mains.
// Sa propre scène, chargée à part et démontée avant le jeu : rien n'en reste.

const FOG_DENSITY = 0.052

function IntroContents({ stage }: { stage: IntroStage }) {
  const time = useRef(0)
  const clockAt = useRef({ stage: null as IntroStage | null, at: 0 })
  const textures = useMemo(() => createIntroTextures(), [])
  useEffect(
    () => () => {
      Object.values(textures).forEach((t) => t.dispose())
    },
    [textures],
  )

  // Avant tout le monde : tous lisent le même instant, et la caméra y est déjà.
  useFrame(({ clock, camera }) => {
    const c = clockAt.current
    if (c.stage !== stage) {
      c.stage = stage
      c.at = clock.elapsedTime
    }
    // Outil de test, absent du build de production : figer l'intro à un instant précis.
    const frozen = import.meta.env.DEV ? (window as unknown as { __qhIntroTime?: number }).__qhIntroTime : undefined
    time.current = frozen ?? introTime(stage, clock.elapsedTime - c.at)
    const pose = headPose(time.current)
    camera.rotation.order = 'YXZ'
    camera.position.set(pose.x, pose.y, pose.z)
    camera.rotation.set(pose.pitch, pose.yaw, pose.roll)
  }, -1)

  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <IntroStreet textures={textures} />
      <FogBanks map={textures.fog} />
      <Van time={time} glow={textures.glow} streak={textures.streak} />
      <Chaser time={time} />
      <Rain />
      <PhoneHands time={time} />
      <Effects danger={0.05} shake={0} msaa={4} soft />
    </>
  )
}

export default function IntroScene({ stage }: { stage: IntroStage }) {
  useIntroSound(stage)
  return (
    <>
      <Canvas
        dpr={DPR_CEILING}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 70, near: 0.02, far: 160, position: [0, 1.72, 0] }}
        style={{ position: 'absolute', inset: 0, background: '#000' }}
      >
        <AdaptiveDpr />
        <DevSceneHook />
        <IntroContents stage={stage} />
      </Canvas>
      {/* Le coup de batte : plus d'image, sans transition. */}
      {stage === 'black' && <div className="knockout" aria-hidden />}
    </>
  )
}
