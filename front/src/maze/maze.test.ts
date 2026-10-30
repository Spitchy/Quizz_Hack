import { describe, expect, it } from 'vitest'
import {
  bfs,
  entityPlacement,
  floorNeighbors,
  generateMaze,
  isFloor,
  tileAt,
  tileCenter,
  tileIndex,
  TILE_SIZE,
  WALL,
  type Maze,
} from './generate'
import { entityDistanceMaps, moveWithCollisions, nearestEntityDistance, PLAYER_RADIUS, signalStrength } from './physics'
import { createRandom, hashSeed } from './random'

const SEEDS = Array.from({ length: 40 }, (_, i) => `session-${i}`)

function floorCount(maze: Maze) {
  return maze.tiles.reduce((n, t) => n + (t === WALL ? 0 : 1), 0)
}

describe('aléatoire déterministe', () => {
  it('même seed, même suite', () => {
    const a = createRandom(hashSeed('abc'))
    const b = createRandom(hashSeed('abc'))
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
  })
})

describe('generateMaze', () => {
  it('même sessionId → même labyrinthe ; autre sessionId → autre labyrinthe', () => {
    const a = generateMaze({ seed: 'session-a' })
    expect(generateMaze({ seed: 'session-a' })).toEqual(a)
    expect(generateMaze({ seed: 'session-b' }).tiles).not.toEqual(a.tiles)
  })

  it.each(SEEDS)('%s : bordure fermée, tout le sol accessible depuis le départ', (seed) => {
    const maze = generateMaze({ seed })
    for (let i = 0; i < maze.width; i++) {
      expect(isFloor(maze, i, 0)).toBe(false)
      expect(isFloor(maze, i, maze.height - 1)).toBe(false)
      expect(isFloor(maze, 0, i)).toBe(false)
      expect(isFloor(maze, maze.width - 1, i)).toBe(false)
    }
    const dist = bfs(maze, maze.spawn)
    const reachable = dist.reduce((n, d) => n + (d >= 0 ? 1 : 0), 0)
    expect(reachable).toBe(floorCount(maze))
  })

  it.each(SEEDS)('%s : 10 entités dans des culs-de-sac, bien réparties', (seed) => {
    const maze = generateMaze({ seed, entityCount: 10 })
    expect(maze.entities).toHaveLength(10)
    expect(maze.entities.map((e) => e.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

    const fromSpawn = bfs(maze, maze.spawn)
    for (const e of maze.entities) {
      // Dos au mur, couloir devant : le point de lecture est du sol.
      expect(floorNeighbors(maze, e.x, e.y)).toHaveLength(1)
      expect(isFloor(maze, e.x + e.facing.dx, e.y + e.facing.dy)).toBe(true)
      const reading = tileAt(entityPlacement(e).reading.x, entityPlacement(e).reading.z)
      expect(isFloor(maze, reading.x, reading.y)).toBe(true)
      expect(fromSpawn[tileIndex(maze, e.x, e.y)]).toBeGreaterThanOrEqual(6)
    }

    // Jamais deux entités collées : au moins 6 tuiles de chemin et 4 à vol d'oiseau.
    for (const a of maze.entities) {
      const from = bfs(maze, a)
      for (const b of maze.entities) {
        if (a === b) continue
        expect(from[tileIndex(maze, b.x, b.y)]).toBeGreaterThanOrEqual(6)
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(4)
      }
    }

    // Les ids suivent la distance depuis le départ.
    const order = maze.entities.map((e) => fromSpawn[tileIndex(maze, e.x, e.y)])
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })

  it('les entités couvrent le labyrinthe (au moins 3 quadrants sur 4)', () => {
    for (const seed of SEEDS) {
      const maze = generateMaze({ seed })
      const quadrants = new Set(
        maze.entities.map((e) => `${e.x < maze.width / 2 ? 'W' : 'E'}${e.y < maze.height / 2 ? 'N' : 'S'}`),
      )
      expect(quadrants.size, seed).toBeGreaterThanOrEqual(3)
    }
  })

  it('variété : salles, boucles, zones et néons', () => {
    let withLoops = 0
    for (const seed of SEEDS) {
      const maze = generateMaze({ seed })
      expect(maze.rooms.length).toBeGreaterThanOrEqual(2)
      expect(new Set(maze.zones).size).toBeGreaterThanOrEqual(2)
      expect(maze.lights.length).toBeGreaterThan(20)
      // Un labyrinthe parfait de n cellules a n-1 passages ; plus = des boucles.
      const cells = ((maze.width - 1) / 2) ** 2
      let passages = 0
      for (let y = 1; y < maze.height - 1; y++) {
        for (let x = 1; x < maze.width - 1; x++) {
          if ((x + y) % 2 === 1 && isFloor(maze, x, y)) passages++
        }
      }
      if (passages > cells - 1) withLoops++
    }
    expect(withLoops).toBe(SEEDS.length)
  })

  it('le départ est éclairé (zone normale)', () => {
    for (const seed of SEEDS) {
      const maze = generateMaze({ seed })
      expect(maze.zones[tileIndex(maze, maze.spawn.x, maze.spawn.y)]).toBe(0)
    }
  })
})

describe('entityPlacement', () => {
  it('adossée au fond de sa tuile, point de lecture devant, modèle tourné vers le couloir', () => {
    const spot = { id: 0, x: 3, y: 3, facing: { dx: 0, dy: 1 } }
    const { position, reading, yaw } = entityPlacement(spot)
    const center = tileCenter(spot)
    expect(position.z).toBeLessThan(center.z)
    expect(reading.z - position.z).toBeCloseTo(2)
    expect(yaw).toBeCloseTo(0)
    expect(entityPlacement({ ...spot, facing: { dx: 1, dy: 0 } }).yaw).toBeCloseTo(Math.PI / 2)
  })
})

describe('moveWithCollisions', () => {
  // Couloir horizontal : y = 1, x de 1 à 3, murs partout ailleurs.
  const corridor: Maze = {
    ...generateMaze({ seed: 'x', cells: 2, entityCount: 0 }),
    width: 5,
    height: 3,
    tiles: Uint8Array.from([1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1]),
  }
  const start = tileCenter({ x: 1, y: 1 })

  it('avance librement dans le couloir', () => {
    const end = moveWithCollisions(corridor, start, { x: TILE_SIZE, z: 0 })
    expect(end.x).toBeCloseTo(start.x + TILE_SIZE)
    expect(end.z).toBeCloseTo(start.z)
  })

  it('s’arrête contre le mur du fond, à son rayon près', () => {
    const end = moveWithCollisions(corridor, start, { x: TILE_SIZE * 10, z: 0 })
    expect(end.x).toBeCloseTo(4 * TILE_SIZE - PLAYER_RADIUS, 2)
  })

  it('glisse le long d’un mur au lieu de s’y coller', () => {
    const end = moveWithCollisions(corridor, start, { x: 1, z: 5 })
    expect(end.x).toBeCloseTo(start.x + 1)
    expect(end.z).toBeCloseTo(2 * TILE_SIZE - PLAYER_RADIUS, 2)
  })

  it('ne traverse jamais un mur, même à grande vitesse', () => {
    const end = moveWithCollisions(corridor, start, { x: 0, z: -50 })
    expect(end.z).toBeGreaterThan(TILE_SIZE)
  })

  it('est repoussé par une entité', () => {
    const blocker = { x: start.x + 1, z: start.z, radius: 0.4 }
    const end = moveWithCollisions(corridor, start, { x: 1, z: 0 }, [blocker])
    expect(Math.hypot(end.x - blocker.x, end.z - blocker.z)).toBeGreaterThanOrEqual(0.4 + PLAYER_RADIUS - 1e-6)
  })
})

describe('signal', () => {
  it('distance à l’entité non résolue la plus proche', () => {
    const maze = generateMaze({ seed: 'signal' })
    const maps = entityDistanceMaps(maze)
    const [first, second] = maze.entities
    expect(nearestEntityDistance(maze, maps, first, () => true)).toBe(0)
    const here = tileIndex(maze, first.x, first.y)
    const othersMin = Math.min(...maps.slice(1).map((map) => map[here]))
    expect(nearestEntityDistance(maze, maps, first, (id) => id !== first.id)).toBe(othersMin)
    expect(nearestEntityDistance(maze, maps, second, () => false)).toBeNull()
  })

  it.each([
    [null, 0],
    [0, 5],
    [6, 4],
    [12, 3],
    [20, 2],
    [32, 1],
    [60, 0],
  ])('signalStrength(%s) = %i', (distance, strength) => {
    expect(signalStrength(distance)).toBe(strength)
  })
})
