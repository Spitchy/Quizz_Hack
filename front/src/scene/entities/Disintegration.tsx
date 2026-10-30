import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { AdditiveBlending, NormalBlending, type Points, type PointsMaterial } from 'three'
import { advanceCloud, DISINTEGRATE_DURATION, particleTexture, type ParticleCloud } from './particles'

// Désintégration : le corps se défait en particules prises sur sa propre
// géométrie, qui s'élèvent en tourbillonnant et s'éteignent.

export function Disintegration({ cloud, additive = true }: { cloud: ParticleCloud; additive?: boolean }) {
  const points = useRef<Points>(null)
  const material = useRef<PointsMaterial>(null)
  const startedAt = useRef<number | null>(null)
  const current = useRef(cloud)
  useEffect(() => {
    current.current = cloud
    return () => cloud.geometry.dispose()
  }, [cloud])

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime
    const age = clock.elapsedTime - startedAt.current
    const k = Math.min(1, age / DISINTEGRATE_DURATION)
    advanceCloud(current.current, age)
    if (material.current) {
      material.current.opacity = 1 - k * k
      material.current.size = 0.045 * (1 - k * 0.5)
    }
    if (points.current) points.current.visible = k < 1
  })

  return (
    <points ref={points} geometry={cloud.geometry}>
      <pointsMaterial
        ref={material}
        size={0.045}
        map={particleTexture()}
        alphaTest={0.02}
        vertexColors
        transparent
        depthWrite={false}
        blending={additive ? AdditiveBlending : NormalBlending}
        toneMapped={false}
      />
    </points>
  )
}
