import { describe, expect, it } from 'vitest'
import { generateCorridor } from './corridor'
import { TILE_SIZE, tileCenter, type Maze } from './generate'
import { radioSpot } from './radioSpot'
import { scareLane } from './scareLane'

/** Un couloir droit de 9 tuiles nord-sud, sans rien d'autre. */
function straightCorridor(): Maze {
  const base = generateCorridor({ seed: 'droit', entityCount: 2 })
  const width = 3
  const height = 9
  const floor = base.tiles[base.spawn.y * base.width + base.spawn.x]
  const tiles = new Uint8Array(width * height).fill(floor === 0 ? 1 : 0)
  for (let y = 0; y < height; y++) tiles[y * width + 1] = floor
  return { ...base, width, height, tiles: tiles as Maze['tiles'] }
}

describe('scareLane', () => {
  it('choisit le long du couloir, jamais le mur d’à côté', () => {
    const lane = scareLane(straightCorridor(), { x: 1, y: 2 }, [])
    expect(lane.dir.x).toBe(0)
    expect(lane.dir.z).toBe(1)
    expect(lane.reach).toBeGreaterThan(4)
  })

  it('tourne le regard exactement vers le couloir', () => {
    const lane = scareLane(straightCorridor(), { x: 1, y: 2 }, [])
    expect(-Math.sin(lane.yaw)).toBeCloseTo(lane.dir.x)
    expect(-Math.cos(lane.yaw)).toBeCloseTo(lane.dir.z)
  })

  it('s’arrête devant ce qui barre le passage', () => {
    const maze = straightCorridor()
    const center = tileCenter({ x: 1, y: 4 })
    const free = scareLane(maze, { x: 1, y: 4 }, [])
    const blocked = scareLane(maze, { x: 1, y: 4 }, [{ x: center.x, z: center.z + free.dir.z * 2, radius: 0.5 }, { x: center.x, z: center.z - free.dir.z * 2, radius: 0.5 }])
    expect(blocked.reach).toBeLessThan(1.5)
  })

  it('ne s’occupe pas de ce qui est à côté du chemin, ni de ce qu’il a dans le dos', () => {
    const maze = straightCorridor()
    const center = tileCenter({ x: 1, y: 2 })
    const free = scareLane(maze, { x: 1, y: 2 }, [])
    const lane = scareLane(maze, { x: 1, y: 2 }, [
      { x: center.x + TILE_SIZE, z: center.z + 2, radius: 0.4 },
      { x: center.x, z: center.z - 1, radius: 0.5 },
    ])
    expect(lane.reach).toBe(free.reach)
  })

  it('ouvre toujours un vrai couloir depuis la table, malgré la table', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const maze = generateCorridor({ seed, entityCount: 10 })
      const radio = radioSpot(maze)!
      const avoid = [...maze.entities.map((e) => ({ ...tileCenter(e), radius: 0.4 })), radio.obstacle]
      const lane = scareLane(maze, radio.tile, avoid)
      expect(lane.reach, seed).toBeGreaterThan(2)
    }
  })
})
