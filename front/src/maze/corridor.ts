import { DIRS, FLOOR, WALL, tileIndex, type Maze } from './generate'
import { createRandom, hashSeed } from './random'

// Disposition de test : un long couloir droit, les entités dans des alcôves
// alternativement à gauche et à droite. Même structure `Maze` que le vrai
// labyrinthe, donc tout le reste du jeu fonctionne à l'identique.
//
//   x : 0 1 2 3 4
//       # . . # #   ← alcôve gauche (x=1), couloir (x=2)
//       # # . . #   ← alcôve droite (x=3)

/** Rangées de couloir entre deux entités. */
const SPACING = 2
const CORRIDOR_X = 2

export function generateCorridor({ seed, entityCount = 10 }: { seed: string | number; entityCount?: number }): Maze {
  const numericSeed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)
  const random = createRandom(numericSeed)
  const width = 5
  const height = entityCount * SPACING + 5
  const maze: Maze = {
    seed: numericSeed,
    width,
    height,
    tiles: new Uint8Array(width * height).fill(WALL),
    zones: new Uint8Array(width * height),
    rooms: [],
    lights: [],
    spawn: { x: CORRIDOR_X, y: height - 2, facing: DIRS[3] },
    entities: [],
  }

  for (let y = 1; y < height - 1; y++) maze.tiles[tileIndex(maze, CORRIDOR_X, y)] = FLOOR

  for (let i = 0; i < entityCount; i++) {
    const y = height - 4 - i * SPACING
    const left = i % 2 === 0
    const x = left ? CORRIDOR_X - 1 : CORRIDOR_X + 1
    maze.tiles[tileIndex(maze, x, y)] = FLOOR
    maze.entities.push({ id: i, x, y, facing: left ? DIRS[0] : DIRS[1] })
  }

  // Les trois ambiances défilent le long du couloir, pour les tester toutes.
  for (let y = 0; y < height; y++) {
    const zone = y >= height - 6 ? 0 : Math.floor((height - 6 - y) / 6) % 3
    for (let x = 0; x < width; x++) maze.zones[tileIndex(maze, x, y)] = zone
  }

  for (let y = 1; y < height - 1; y += 2) {
    maze.lights.push({ x: CORRIDOR_X, y, broken: random() < 0.15 })
  }
  return maze
}
