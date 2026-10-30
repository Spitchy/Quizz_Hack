import { describe, expect, it } from 'vitest'
import { generateCorridor } from './corridor'
import { bfs, entityPlacement, floorNeighbors, isFloor, tileAt, tileIndex } from './generate'

describe('generateCorridor (disposition de test)', () => {
  const maze = generateCorridor({ seed: 'test' })

  it('10 entités en ligne droite, alternées gauche / droite, face au couloir', () => {
    expect(maze.entities).toHaveLength(10)
    maze.entities.forEach((e, i) => {
      expect(e.id).toBe(i)
      expect(e.x).toBe(i % 2 === 0 ? 1 : 3)
      expect(isFloor(maze, e.x + e.facing.dx, e.y + e.facing.dy)).toBe(true)
      expect(floorNeighbors(maze, e.x, e.y)).toHaveLength(1)
      const reading = tileAt(entityPlacement(e).reading.x, entityPlacement(e).reading.z)
      expect(isFloor(maze, reading.x, reading.y)).toBe(true)
    })
  })

  it('du départ, on les croise dans l’ordre (0 la plus proche)', () => {
    const fromSpawn = bfs(maze, maze.spawn)
    const order = maze.entities.map((e) => fromSpawn[tileIndex(maze, e.x, e.y)])
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every((d) => d > 0)).toBe(true)
  })

  it('le départ regarde le long du couloir, les trois ambiances sont présentes', () => {
    expect(maze.spawn.facing).toEqual({ dx: 0, dy: -1 })
    expect(isFloor(maze, maze.spawn.x, maze.spawn.y - 1)).toBe(true)
    expect(new Set(maze.zones)).toEqual(new Set([0, 1, 2]))
    expect(maze.zones[tileIndex(maze, maze.spawn.x, maze.spawn.y)]).toBe(0)
  })

  it('s’adapte au nombre de questions', () => {
    expect(generateCorridor({ seed: 'x', entityCount: 3 }).entities).toHaveLength(3)
  })
})
