import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  MeshStandardMaterial,
  NormalBlending,
  type Mesh,
  type Points,
} from 'three'
import type { DefeatStage } from '../app/sequence'
import { particleTexture } from './entities/particles'
import type { BodyHit, BodyProbe } from './defeatBody'

// Défaite : le sang. À chaque coup, une giclée part du corps à l'opposé de
// l'assaillant, retombe et reste collée au sol en gouttes ; des flaques
// luisantes s'élargissent sous lui, jusqu'à la grande flaque quand il gît.
// Tout est monté d'avance (programmes compilés), invisible hors défaite.

const DROPS = 1400
const PER_HIT = 110
const POOLS = 7
const GRAVITY = 9.8
const FLOOR = 0.012

/** Tache de sang aux bords irréguliers (alpha), partagée. */
let poolAlpha: CanvasTexture | null = null
function poolTexture(): CanvasTexture {
  if (poolAlpha) return poolAlpha
  const el = document.createElement('canvas')
  el.width = el.height = 256
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 256, 256)
  // Lobes superposés autour du centre : une flaque, pas un disque.
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2
    const d = i === 0 ? 0 : 20 + rand() * 60
    const x = 128 + Math.cos(a) * d
    const y = 128 + Math.sin(a) * d
    const r = i === 0 ? 90 : 18 + rand() * 40
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.75, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  poolAlpha = new CanvasTexture(el)
  return poolAlpha
}

interface Pool {
  x: number
  z: number
  /** Rayon final (m), instant d'apparition, durée d'étalement (s). */
  size: number
  born: number
  spread: number
}

interface BloodSim {
  velocity: Float32Array
  next: number
  taken: number
  pools: Pool[]
  bigPool: boolean
  stage: DefeatStage | null
}

/** Une image de simulation : giclées, chute des gouttes, étalement des flaques. */
function stepBlood(
  geometry: BufferGeometry,
  s: BloodSim,
  p: BodyProbe,
  hits: readonly BodyHit[],
  stage: DefeatStage | null,
  t: number,
  dt: number,
  pools: readonly (Mesh | null)[],
  points: Points | null,
) {
  const pos = geometry.attributes.position as BufferAttribute
  const arr = pos.array as Float32Array
  const filmed = stage === 'approach' || stage === 'beat' || stage === 'knockout'
  if (points) points.visible = filmed
  if (stage !== s.stage) {
    if (stage === 'approach' || !filmed) {
      arr.fill(-50)
      s.velocity.fill(0)
      s.taken = 0
      s.pools = []
      s.bigPool = false
      pos.needsUpdate = true
    }
    s.stage = stage
  }

  // Nouvelle giclée à chaque coup encaissé (le corps a déjà compté le coup).
  while (filmed && s.taken < p.taken && s.taken < hits.length) {
    const hit = hits[s.taken]
    const fromHead = s.taken % 3 !== 1
    const origin = fromHead ? p.head : p.chest
    const dx = origin.x - hit.from.x
    const dz = origin.z - hit.from.z
    const len = Math.hypot(dx, dz) || 1
    // Partagé entre tous les coups : les premières gouttes restent au sol jusqu'au bout.
    const drops = Math.min(PER_HIT, Math.floor(DROPS / hits.length))
    for (let n = 0; n < drops; n++) {
      const i = s.next
      s.next = (s.next + 1) % DROPS
      const spread = Math.random()
      arr[i * 3] = origin.x + (Math.random() - 0.5) * 0.08
      arr[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.08
      arr[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.08
      const speed = 0.8 + spread * 2.6
      s.velocity[i * 3] = (dx / len) * speed + (Math.random() - 0.5) * 1.4
      s.velocity[i * 3 + 1] = 0.6 + Math.random() * 2.2
      s.velocity[i * 3 + 2] = (dz / len) * speed + (Math.random() - 0.5) * 1.4
    }
    // Une flaque là où il saigne (au sol, sous l'impact).
    if (s.pools.length < POOLS - 1) {
      s.pools.push({ x: origin.x + (dx / len) * 0.25, z: origin.z + (dz / len) * 0.25, size: 0.22 + Math.random() * 0.18, born: t, spread: 1.2 })
    }
    s.taken++
  }
  // À terre : la grande flaque s'étend lentement sous lui.
  if (filmed && p.fall > 0.8 && !s.bigPool) {
    s.bigPool = true
    s.pools.push({ x: p.chest.x, z: p.chest.z, size: 1.05, born: t, spread: 4.5 })
  }

  // Gouttes : chute libre, puis collées au sol.
  if (filmed) {
    for (let i = 0; i < DROPS; i++) {
      const y = arr[i * 3 + 1]
      if (y <= FLOOR) continue
      s.velocity[i * 3 + 1] -= GRAVITY * dt
      arr[i * 3] += s.velocity[i * 3] * dt
      arr[i * 3 + 1] += s.velocity[i * 3 + 1] * dt
      arr[i * 3 + 2] += s.velocity[i * 3 + 2] * dt
      if (arr[i * 3 + 1] <= FLOOR) arr[i * 3 + 1] = FLOOR
    }
    pos.needsUpdate = true
  }

  pools.forEach((mesh, i) => {
    if (!mesh) return
    const pool = s.pools[i]
    if (!filmed || !pool) {
      // Rangée sous le sol, mais « visible » : son shader est compilé d'avance.
      mesh.position.set(0, -50, 0)
      mesh.scale.setScalar(0.001)
      return
    }
    const k = 1 - Math.exp(-(t - pool.born) / pool.spread)
    mesh.position.set(pool.x, 0.006 + i * 0.0008, pool.z)
    mesh.scale.setScalar(Math.max(0.001, pool.size * k))
  })
}

interface BloodProps {
  stage: DefeatStage | null
  hits: readonly BodyHit[]
  probe: RefObject<BodyProbe>
}

export function Blood({ stage, hits, probe }: BloodProps) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const position = new Float32Array(DROPS * 3).fill(-50)
    const color = new Float32Array(DROPS * 3)
    for (let i = 0; i < DROPS; i++) {
      // Du rouge sombre au rouge vif, au hasard (fixé à la création).
      const k = (Math.sin(i * 91.7) * 0.5 + 0.5) * 0.6
      color.set([0.32 + k * 0.5, 0.01 + k * 0.03, 0.01 + k * 0.02], i * 3)
    }
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('color', new BufferAttribute(color, 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const poolMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        // Sang frais : rouge profond, très luisant ; une pointe d'émission pour
        // qu'il se lise même loin de la lumière, sur l'image de surveillance.
        color: '#8a0a0a',
        emissive: '#2a0000',
        roughness: 0.08,
        metalness: 0.15,
        alphaMap: poolTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  )
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial])

  const points = useRef<Points>(null)
  const pools = useRef<(Mesh | null)[]>([])
  const sim = useRef<BloodSim>({
    velocity: new Float32Array(DROPS * 3),
    next: 0,
    taken: 0,
    pools: [],
    bigPool: false,
    stage: null,
  })

  useFrame(({ clock }, rawDt) => {
    stepBlood(geometry, sim.current, probe.current, hits, stage, clock.elapsedTime, Math.min(rawDt, 0.05), pools.current, points.current)
  })

  return (
    <>
      <points ref={points} name="blood-drops" geometry={geometry} frustumCulled={false} visible={false}>
        <pointsMaterial
          size={0.034}
          map={particleTexture()}
          alphaTest={0.25}
          vertexColors
          transparent
          depthWrite={false}
          blending={NormalBlending}
          toneMapped={false}
        />
      </points>
      {Array.from({ length: POOLS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            pools.current[i] = m
          }}
          rotation={[-Math.PI / 2, 0, i * 1.7]}
          position={[0, -50, 0]}
          scale={0.001}
          material={poolMaterial}
        >
          <circleGeometry args={[1, 28]} />
        </mesh>
      ))}
    </>
  )
}
