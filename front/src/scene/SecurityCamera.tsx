import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Camera, PerspectiveCamera } from 'three'
import type { CameraSpot } from '../maze/approach'
import { smoothNoise } from './entities/anim'

// Défaite : la caméra de surveillance du couloir, fixée au plafond dans un
// coin. Grand angle (le fish-eye est dans le post-traitement), à peine un
// frémissement du support. Elle rend la main au champ normal en se coupant.

const FOV = 88
const NORMAL_FOV = 70

/** Champ de la caméra (hors rendu React). */
function setFov(camera: Camera, fov: number) {
  const cam = camera as PerspectiveCamera
  if (cam.fov === fov) return
  cam.fov = fov
  cam.updateProjectionMatrix()
}

export function SecurityCamera({ spot, active }: { spot: CameraSpot; active: boolean }) {
  const camera = useThree((s) => s.camera)
  // La scène du labyrinthe démontée (réveil), la caméra retrouve son champ.
  useEffect(() => () => setFov(camera, NORMAL_FOV), [camera])
  const was = useRef(false)
  useFrame(({ camera: cam, clock }) => {
    if (!active) {
      if (was.current) {
        was.current = false
        setFov(cam, NORMAL_FOV)
      }
      return
    }
    if (!was.current) {
      was.current = true
      setFov(cam, FOV)
    }
    const t = clock.elapsedTime
    const { position, target } = spot
    cam.position.set(position.x, position.y, position.z)
    cam.lookAt(target.x + smoothNoise(t * 0.4, 1) * 0.04, target.y + smoothNoise(t * 0.5, 2) * 0.03, target.z)
  })
  return null
}
