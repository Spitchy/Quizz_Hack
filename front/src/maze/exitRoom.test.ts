import { describe, expect, it } from 'vitest'
import { bfs, isFloor, tileCenter, tileIndex } from './generate'
import { generateExitRoom, reachedDoor } from './exitRoom'
import { moveWithCollisions } from './physics'

describe('generateExitRoom', () => {
  const room = generateExitRoom()

  it('la porte est dans le mur du fond, face au départ, accessible', () => {
    const { maze, door } = room
    expect(isFloor(maze, door.x, door.y)).toBe(false)
    expect(isFloor(maze, door.x, door.y + 1)).toBe(true)
    expect(maze.spawn.x).toBe(door.x)
    expect(maze.spawn.facing).toEqual({ dx: 0, dy: -1 })
    expect(bfs(maze, maze.spawn)[tileIndex(maze, door.x, door.y + 1)]).toBe(4)
  })

  it('arrivée détectée seulement juste devant la porte', () => {
    expect(reachedDoor(room, { x: 2, y: 1 })).toBe(true)
    expect(reachedDoor(room, { x: 2, y: 2 })).toBe(false)
    expect(reachedDoor(room, { x: 1, y: 1 })).toBe(false)
  })

  it('on ne traverse pas la porte : le mur du fond arrête le joueur', () => {
    const start = tileCenter(room.maze.spawn)
    const end = moveWithCollisions(room.maze, start, { x: 0, z: -40 })
    expect(end.z).toBeGreaterThan(room.doorPosition.z)
  })
})
