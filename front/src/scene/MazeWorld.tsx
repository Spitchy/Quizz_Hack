import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Object3D,
  type InstancedMesh,
} from 'three'
import type { ScareStage } from '../app/sequence'
import { playAt } from '../audio/stage'
import { TILE_SIZE, ZONES, type Maze } from '../maze/generate'
import { buildWallMeshes, type MeshData } from '../maze/mesh'
import { neonIntensity } from './flicker'
import { lampDeaths, scareLampLevel } from './scareMotion'
import { CORRIDOR_HEIGHT, PALETTE } from './layout'
import { carpetTexture, ceilingTexture, lightPoolTexture, wallpaperTexture } from './textures'

// Le labyrinthe : murs par zone d'ambiance, plinthes, moquette, faux plafond,
// néons (qui grésillent, certains défaillants) et flaques de lumière au sol.
// Seul le halo du joueur éclaire réellement ; les néons sont émissifs.

function toGeometry(data: MeshData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(data.uvs, 2))
  geometry.setIndex(new BufferAttribute(data.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

const PANEL_COLOR = new Color(PALETTE.halo).multiplyScalar(0.95)
const POOL_COLOR = new Color(PALETTE.halo).multiplyScalar(0.16)
const scratch = new Object3D()
const color = new Color()
/** Assez près pour entendre sauter le disjoncteur de la lampe (m). */
const BREAKER_RANGE = 15

interface MazeWorldProps {
  maze: Maze
  danger: number
  /** Noir total (défaite) ou coupure : néons éteints. */
  dark: boolean
  /** Victoire : 0..1, les néons s'allument à pleine puissance et cessent de grésiller. */
  surge?: number
  /** Dossier refermé : les lampes meurent l'une après l'autre jusqu'au joueur. */
  scare?: ScareStage | null
}

export function MazeWorld({ maze, danger, dark, surge = 0, scare = null }: MazeWorldProps) {
  const geometries = useMemo(() => {
    const { walls, baseboards } = buildWallMeshes(maze, CORRIDOR_HEIGHT)
    return { walls: walls.map(toGeometry), baseboards: toGeometry(baseboards) }
  }, [maze])
  useEffect(
    () => () => {
      geometries.walls.forEach((g) => g.dispose())
      geometries.baseboards.dispose()
    },
    [geometries],
  )

  const width = maze.width * TILE_SIZE
  const depth = maze.height * TILE_SIZE
  const textures = useMemo(
    () => ({
      walls: ZONES.map((zone) => wallpaperTexture(zone)),
      floor: carpetTexture([width / 2.2, depth / 2.2]),
      ceiling: ceilingTexture([width / 1.3, depth / 1.3]),
      pool: lightPoolTexture(),
    }),
    [width, depth],
  )
  useEffect(
    () => () => {
      textures.walls.forEach((t) => t.dispose())
      textures.floor.dispose()
      textures.ceiling.dispose()
      textures.pool.dispose()
    },
    [textures],
  )

  const panels = useRef<InstancedMesh>(null)
  const pools = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    maze.lights.forEach((light, i) => {
      const x = (light.x + 0.5) * TILE_SIZE
      const z = (light.y + 0.5) * TILE_SIZE
      scratch.position.set(x, CORRIDOR_HEIGHT - 0.01, z)
      scratch.rotation.set(Math.PI / 2, 0, (light.x + light.y) % 2 ? Math.PI / 2 : 0)
      scratch.updateMatrix()
      panels.current?.setMatrixAt(i, scratch.matrix)
      panels.current?.setColorAt(i, PANEL_COLOR)

      scratch.position.set(x, 0.015, z)
      scratch.rotation.set(-Math.PI / 2, 0, 0)
      scratch.updateMatrix()
      pools.current?.setMatrixAt(i, scratch.matrix)
      pools.current?.setColorAt(i, POOL_COLOR)
    })
    for (const mesh of [panels.current, pools.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [maze])

  const blackout = useRef({ stage: null as ScareStage | null, at: 0, deaths: [] as number[], out: new Set<number>() })

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime
    const b = blackout.current
    const lampX = (i: number) => (maze.lights[i].x + 0.5) * TILE_SIZE
    const lampZ = (i: number) => (maze.lights[i].y + 0.5) * TILE_SIZE
    const away = (i: number) => Math.hypot(lampX(i) - camera.position.x, lampZ(i) - camera.position.z)
    if (b.stage !== scare) {
      b.stage = scare
      b.at = t
      // Il peut encore marcher : l'ordre est fixé là où il se trouve à cet instant.
      if (scare === 'dim') {
        b.deaths = lampDeaths(maze.lights.map((_, i) => away(i)))
        b.out.clear()
      }
    }
    const since = t - b.at
    maze.lights.forEach((light, i) => {
      let k = neonIntensity(light, i, t, danger, dark, surge)
      if (scare) {
        const distance = away(i)
        const death = b.deaths[i] ?? 0
        k *= scareLampLevel(scare, since, death, distance, i)
        if (scare === 'dim' && !b.out.has(i) && since >= death) {
          b.out.add(i)
          // Le disjoncteur saute, dans le plafond, à chaque lampe qui lâche près de lui.
          if (distance < BREAKER_RANGE) playAt('breaker', [lampX(i), CORRIDOR_HEIGHT, lampZ(i)], { gain: 0.9 })
        }
      }
      panels.current?.setColorAt(i, color.copy(PANEL_COLOR).multiplyScalar(k))
      pools.current?.setColorAt(i, color.copy(POOL_COLOR).multiplyScalar(k))
    })
    if (panels.current?.instanceColor) panels.current.instanceColor.needsUpdate = true
    if (pools.current?.instanceColor) pools.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={textures.floor} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[width / 2, CORRIDOR_HEIGHT, depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={textures.ceiling} roughness={0.95} />
      </mesh>

      {geometries.walls.map((geometry, zone) => (
        <mesh key={zone} geometry={geometry}>
          <meshStandardMaterial map={textures.walls[zone]} roughness={0.92} metalness={0} />
        </mesh>
      ))}
      <mesh geometry={geometries.baseboards}>
        <meshStandardMaterial color="#3a2f17" roughness={0.8} />
      </mesh>

      <instancedMesh key={`panels-${maze.seed}`} ref={panels} args={[undefined, undefined, maze.lights.length]}>
        <planeGeometry args={[0.45, 1.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`pools-${maze.seed}`} ref={pools} args={[undefined, undefined, maze.lights.length]}>
        <planeGeometry args={[3.4, 3.4]} />
        <meshBasicMaterial
          map={textures.pool}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}
