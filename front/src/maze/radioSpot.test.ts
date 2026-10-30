import { describe, expect, it } from 'vitest'
import { generateCorridor } from './corridor'
import { generateMaze, isFloor, tileAt, tileCenter, type Maze } from './generate'
import { moveWithCollisions } from './physics'
import { canReachRadio, radioSpot } from './radioSpot'

const mazes: [string, Maze][] = [
  ['couloir', generateCorridor({ seed: 'radio-a', entityCount: 10 })],
  ['labyrinthe a', generateMaze({ seed: 'radio-a', entityCount: 10 })],
  ['labyrinthe b', generateMaze({ seed: 'radio-b', entityCount: 10 })],
]

describe('radio', () => {
  it.each(mazes)('se pose sur du sol, contre un mur (%s)', (_, maze) => {
    const spot = radioSpot(maze)!
    expect(isFloor(maze, spot.tile.x, spot.tile.y)).toBe(true)
    expect(isFloor(maze, spot.tile.x - spot.facing.dx, spot.tile.y - spot.facing.dy)).toBe(false)
    expect(tileAt(spot.position.x, spot.position.z)).toEqual(spot.tile)
  })

  it.each(mazes)('reste loin du départ et des entités (%s)', (_, maze) => {
    const { tile } = radioSpot(maze)!
    expect(Math.abs(tile.x - maze.spawn.x) + Math.abs(tile.y - maze.spawn.y)).toBeGreaterThanOrEqual(3)
    for (const e of maze.entities) expect(Math.abs(tile.x - e.x) + Math.abs(tile.y - e.y)).toBeGreaterThan(1)
  })

  it('est au milieu du couloir', () => {
    const maze = mazes[0][1]
    const { tile } = radioSpot(maze)!
    expect(Math.abs(tile.y - maze.height / 2)).toBeLessThanOrEqual(2)
  })

  it('ne bloque jamais le passage : on longe la table dans un couloir d\'une tuile', () => {
    const maze = mazes[0][1]
    const spot = radioSpot(maze)!
    const center = tileCenter(spot.tile)
    let p = { x: center.x, z: center.z + 4 }
    for (let i = 0; i < 200 && p.z > center.z - 4; i++) p = moveWithCollisions(maze, p, { x: 0, z: -0.05 }, [spot.obstacle])
    expect(p.z).toBeLessThanOrEqual(center.z - 4 + 0.05)
  })

  it('donne le même endroit pour la même partie', () => {
    const again = generateCorridor({ seed: 'radio-a', entityCount: 10 })
    expect(radioSpot(again)).toEqual(radioSpot(mazes[0][1]))
  })

  it('laisse ouvrir le dossier seulement à côté de la table', () => {
    const maze = mazes[0][1]
    const spot = radioSpot(maze)!
    expect(canReachRadio(maze, spot, spot.tile)).toBe(true)
    expect(canReachRadio(maze, spot, { x: spot.tile.x, y: spot.tile.y + 1 })).toBe(true)
    expect(canReachRadio(maze, spot, { x: spot.tile.x, y: spot.tile.y + 3 })).toBe(false)
    expect(canReachRadio(maze, spot, null)).toBe(false)
    expect(canReachRadio(maze, null, spot.tile)).toBe(false)
  })
})
