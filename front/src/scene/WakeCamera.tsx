import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import type { DefeatStage } from '../app/sequence'
import { damp, smoothNoise } from './entities/anim'
import { shakeOffset } from './motion'
import { ARM_TARGET, CAMERA_POS, DOOR, doctorHead, INJECT } from './wakeStage'

// Caméra dirigée du réveil : les yeux s'ouvrent sur l'ampoule, descendent sur
// son propre corps sanglé et ensanglanté, vont aux poches de sang et aux
// tubulures, au bras droit qui tire sur sa sangle ; la porte s'ouvre, il suit
// le médecin des yeux, lève la tête vers lui quand il se penche, regard affolé
// vers l'aiguille qui entre, puis de nouveau vers lui. Tout passe par des
// ressorts : aucun saut.

const BULB = new Vector3(0, 2.42, 0.5)
const CHEST = new Vector3(0, 0.8, 1.38)
const LAP = new Vector3(0, 0.62, 1.15)
const BAGS = new Vector3(-0.63, 1.62, 1.21)
const IV_SITE = new Vector3(-0.29, 0.75, 1.42)
const RIGHT_STRAP = new Vector3(0.29, 0.73, 1.32)
const DOORWAY = new Vector3(DOOR.hingeX + DOOR.width / 2, 1.35, DOOR.z)
/** L'aiguille et la main qui la tient, un peu au-dessus du point d'injection. */
const NEEDLE = new Vector3(ARM_TARGET.x + 0.06, ARM_TARGET.y + 0.08, ARM_TARGET.z - 0.08)

const look = new Vector3()

/** Où regarder, `since` secondes après le début de l'étape. */
function lookTarget(stage: DefeatStage, since: number, out: Vector3): Vector3 {
  if (stage === 'wake') {
    if (since < 1.1) return out.copy(BULB)
    if (since < 1.9) return out.copy(CHEST)
    if (since < 2.6) return out.copy(LAP)
    if (since < 3.5) return out.copy(BAGS)
    if (since < 4.2) return out.copy(IV_SITE)
    if (since < 4.95) return out.copy(RIGHT_STRAP)
    return out.copy(DOORWAY)
  }
  if (stage === 'inject') {
    if (since < INJECT.enter + 0.4) return out.copy(DOORWAY)
    if (since < INJECT.stab - 0.25) return out.copy(doctorHead)
    if (since < INJECT.lookBack) return out.copy(NEEDLE)
    return out.copy(doctorHead)
  }
  return out.copy(doctorHead)
}

export function WakeCamera({ stage }: { stage: DefeatStage }) {
  const st = useRef({
    stage: null as DefeatStage | null,
    at: 0,
    yaw: { value: 0, velocity: 0 },
    pitch: { value: 0.95, velocity: 0 },
    roll: { value: -0.18, velocity: 0 },
  })
  useFrame(({ camera, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const s = st.current
    if (s.stage !== stage) {
      s.stage = stage
      s.at = t
    }
    const since = t - s.at

    lookTarget(stage, since, look).sub(CAMERA_POS)
    const yaw = Math.atan2(-look.x, -look.z)
    const pitch = Math.atan2(look.y, Math.hypot(look.x, look.z))
    // Regard vif vers l'aiguille, plus lent ailleurs ; encore engourdi au réveil.
    const snap = stage === 'inject' && since > INJECT.stab - 0.25 && since < INJECT.stab + 0.3
    const smooth = snap ? 0.12 : stage === 'wake' && since < 1.9 ? 0.5 : 0.28

    let roll = 0
    let trauma = 0
    if (stage === 'wake') {
      roll = since < 1.5 ? -0.18 : 0
      // Il tire sur ses sangles.
      if (since > 4.2 && since < 4.95) trauma = 0.45
    } else if (stage === 'inject') {
      if (since > INJECT.stab - 0.05 && since < INJECT.stab + 0.45) trauma = 1
    } else if (stage === 'infected') {
      roll = Math.sin(since * 2.3) * 0.08
      trauma = 0.75
    }

    const shake = shakeOffset(trauma, t)
    const drift = smoothNoise(t * 0.5, 4) * 0.025
    camera.rotation.order = 'YXZ'
    camera.position.set(CAMERA_POS.x + shake.x, CAMERA_POS.y + shake.y, CAMERA_POS.z)
    camera.rotation.set(
      damp(s.pitch, pitch, smooth, dt) + shake.pitch + drift,
      damp(s.yaw, s.yaw.value + Math.atan2(Math.sin(yaw - s.yaw.value), Math.cos(yaw - s.yaw.value)), smooth, dt) + shake.yaw,
      damp(s.roll, roll, 0.4, dt) + shake.roll,
    )
  })
  return null
}
