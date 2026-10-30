import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, Color, type Group, type Mesh } from 'three'
import type { ExitRoom } from '../maze/exitRoom'
import { TILE_SIZE } from '../maze/generate'
import { buildWallMeshes } from '../maze/mesh'
import type { EntityLook } from './entities/archetypes'
import { Entity } from './Entity'

// Victoire : une pièce blanche si lumineuse qu'elle brûle les yeux. De la
// poussière flotte dans la lumière ; au fond, une porte sombre dont les bords
// laissent filtrer une lumière plus vive encore. Le long du chemin, les ombres
// des entités qu'on a libérées attendent — et se défont en poussière quand on passe.

const ROOM_HEIGHT = 4
const WHITE = new Color('#ffffff').multiplyScalar(1.35)
const SEEP = new Color('#fff6dc').multiplyScalar(2.4)
const DOOR_WIDTH = 1.15
const DOOR_HEIGHT = 2.3
const DUST = 320

export interface FreedEntity {
  id: number
  look: EntityLook
}

interface WhiteRoomProps {
  room: ExitRoom
  /** La porte s'ouvre (le joueur l'a atteinte). */
  open: boolean
  /** Entités libérées (bonnes réponses) : leurs ombres bordent le chemin. */
  freed: readonly FreedEntity[]
}

/** Poussière en suspension, répartie au hasard dans la pièce. */
function createDust(width: number, depth: number) {
  const positions = new Float32Array(DUST * 3)
  const seeds = new Float32Array(DUST)
  for (let i = 0; i < DUST; i++) {
    positions[i * 3] = TILE_SIZE + Math.random() * (width - TILE_SIZE * 2)
    positions[i * 3 + 1] = Math.random() * ROOM_HEIGHT
    positions[i * 3 + 2] = TILE_SIZE + Math.random() * (depth - TILE_SIZE * 2)
    seeds[i] = Math.random() * 100
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  return { geometry, seeds }
}

function Dust({ width, depth }: { width: number; depth: number }) {
  const dust = useMemo(() => createDust(width, depth), [width, depth])
  const current = useRef(dust)
  useEffect(() => {
    current.current = dust
    return () => dust.geometry.dispose()
  }, [dust])

  useFrame((_, dt) => {
    const { geometry, seeds } = current.current
    const attr = geometry.attributes.position as BufferAttribute
    const a = attr.array as Float32Array
    for (let i = 0; i < DUST; i++) {
      seeds[i] += dt
      a[i * 3] += Math.sin(seeds[i] * 0.7) * 0.002
      a[i * 3 + 1] += 0.012 * dt * 10 * (0.3 + (i % 5) * 0.1)
      a[i * 3 + 2] += Math.cos(seeds[i] * 0.5) * 0.002
      if (a[i * 3 + 1] > ROOM_HEIGHT) a[i * 3 + 1] = 0
    }
    attr.needsUpdate = true
  })

  return (
    <points geometry={dust.geometry}>
      <pointsMaterial size={0.025} color="#b9b09a" transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}

/** Les ombres des entités libérées, de part et d'autre du chemin vers la porte. */
function Ghosts({ freed, room }: { freed: readonly FreedEntity[]; room: ExitRoom }) {
  const [passed, setPassed] = useState<ReadonlySet<number>>(new Set())
  const width = room.maze.width * TILE_SIZE
  const spots = useMemo(
    () =>
      freed.map((f, i) => {
        const left = i % 2 === 0
        const row = Math.floor(i / 2)
        return {
          ...f,
          x: left ? TILE_SIZE + 0.7 : width - TILE_SIZE - 0.7,
          z: (room.maze.height - 2.3) * TILE_SIZE - row * 1.9,
          yaw: left ? Math.PI / 2 : -Math.PI / 2,
        }
      }),
    [freed, room, width],
  )

  useFrame(({ camera }) => {
    // Quand le joueur arrive à leur hauteur, elles se défont en poussière.
    const fresh = spots.filter((s) => !passed.has(s.id) && camera.position.z < s.z + 0.6)
    if (fresh.length) setPassed(new Set([...passed, ...fresh.map((s) => s.id)]))
  })

  return (
    <>
      {spots.map((s) => (
        <Entity
          key={s.id}
          render={{ mood: 'calm', visible: !passed.has(s.id), smileOnly: false }}
          look={s.look}
          position={[s.x, 0, s.z]}
          rotationY={s.yaw}
          ghost
          sign={null}
        />
      ))}
    </>
  )
}

export function WhiteRoom({ room, open, freed }: WhiteRoomProps) {
  const walls = useMemo(() => {
    const { walls } = buildWallMeshes(room.maze, ROOM_HEIGHT)
    const data = walls[0]
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
    geometry.setIndex(new BufferAttribute(data.indices, 1))
    return geometry
  }, [room])
  useEffect(() => () => walls.dispose(), [walls])

  const door = useRef<Group>(null)
  const beyond = useRef<Mesh>(null)
  const seep = useRef<Group>(null)
  const openedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (seep.current) seep.current.scale.setScalar(1 + Math.sin(t * 2.1) * 0.03)
    if (!open) {
      openedAt.current = null
      if (door.current) door.current.rotation.y = 0
      return
    }
    openedAt.current ??= t
    const k = Math.min(1, (t - openedAt.current) / 1.2)
    if (door.current) door.current.rotation.y = -1.6 * (1 - (1 - k) ** 3)
    if (beyond.current) beyond.current.visible = k > 0.02
  })

  const width = room.maze.width * TILE_SIZE
  const depth = room.maze.height * TILE_SIZE
  const { x: doorX, z: doorZ } = room.doorPosition

  return (
    <>
      <color attach="background" args={['#ffffff']} />
      <fogExp2 attach="fog" args={['#fffdf6', 0.018]} />

      <mesh geometry={walls}>
        <meshBasicMaterial color={WHITE} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#f4f2ec" toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[width / 2, ROOM_HEIGHT, depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color={WHITE} toneMapped={false} />
      </mesh>

      <Dust width={width} depth={depth} />
      <Ghosts freed={freed} room={room} />

      {/* Ombre douce au pied de la porte. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.01, doorZ + 0.6]}>
        <planeGeometry args={[1.6, 1.2]} />
        <meshBasicMaterial color="#d8d4c8" transparent opacity={0.5} />
      </mesh>

      {/* Lumière qui filtre autour du battant et sous la porte. */}
      <group ref={seep} position={[doorX, 0, doorZ + 0.03]}>
        <mesh position={[0, DOOR_HEIGHT / 2, 0]}>
          <planeGeometry args={[DOOR_WIDTH + 0.06, DOOR_HEIGHT + 0.05]} />
          <meshBasicMaterial color={SEEP} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.35]}>
          <planeGeometry args={[DOOR_WIDTH, 0.7]} />
          <meshBasicMaterial color={SEEP} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      </group>

      {/* Derrière : une lumière chaude et verte, l'extérieur. */}
      <mesh ref={beyond} position={[doorX, DOOR_HEIGHT / 2, doorZ + 0.035]} visible={false}>
        <planeGeometry args={[DOOR_WIDTH, DOOR_HEIGHT]} />
        <meshBasicMaterial color={new Color('#e9f5c8').multiplyScalar(1.8)} toneMapped={false} />
      </mesh>

      {/* Cadre et battant (pivot sur le bord gauche). */}
      <mesh position={[doorX, DOOR_HEIGHT + 0.05, doorZ + 0.05]}>
        <boxGeometry args={[DOOR_WIDTH + 0.2, 0.1, 0.1]} />
        <meshBasicMaterial color="#1f1c18" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[doorX + side * (DOOR_WIDTH / 2 + 0.05), DOOR_HEIGHT / 2, doorZ + 0.05]}>
          <boxGeometry args={[0.1, DOOR_HEIGHT + 0.1, 0.1]} />
          <meshBasicMaterial color="#1f1c18" />
        </mesh>
      ))}
      <group ref={door} position={[doorX - DOOR_WIDTH / 2, 0, doorZ + 0.07]}>
        <mesh position={[DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0]}>
          <boxGeometry args={[DOOR_WIDTH - 0.04, DOOR_HEIGHT - 0.03, 0.05]} />
          <meshBasicMaterial color="#110f0d" />
        </mesh>
        <mesh position={[DOOR_WIDTH - 0.12, 1.05, 0.05]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color="#8c8370" />
        </mesh>
      </group>
    </>
  )
}
