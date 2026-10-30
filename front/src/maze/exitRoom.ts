import { DIRS, FLOOR, TILE_SIZE, WALL, tileIndex, type Maze, type Tile } from './generate'

// Victoire : une pièce blanche, nue, avec une porte au fond. Même structure
// `Maze` que le labyrinthe, pour réutiliser le déplacement et les collisions.
//
//   # # D # #   ← la porte (D) est dans le mur du fond
//   # . . . #
//   # . . . #   ← 3 × 5 tuiles de sol
//   # . . . #
//   # . . . #
//   # . @ . #   ← départ, regard vers la porte
//   # # # # #

const WIDTH = 5
const HEIGHT = 7

export interface ExitRoom {
  maze: Maze
  door: Tile
  /** Centre du bas de la porte, en coordonnées monde. */
  doorPosition: { x: number; z: number }
}

export function generateExitRoom(): ExitRoom {
  const maze: Maze = {
    seed: 0,
    width: WIDTH,
    height: HEIGHT,
    tiles: new Uint8Array(WIDTH * HEIGHT).fill(WALL),
    zones: new Uint8Array(WIDTH * HEIGHT),
    rooms: [{ x: 1, y: 1, width: 3, height: 5 }],
    lights: [],
    spawn: { x: 2, y: HEIGHT - 2, facing: DIRS[3] },
    entities: [],
  }
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) maze.tiles[tileIndex(maze, x, y)] = FLOOR
  }
  const door = { x: 2, y: 0 }
  return { maze, door, doorPosition: { x: (door.x + 0.5) * TILE_SIZE, z: (door.y + 1) * TILE_SIZE } }
}

/** Le joueur est arrivé devant la porte (sur la tuile juste devant). */
export function reachedDoor(room: ExitRoom, player: Tile): boolean {
  return player.x === room.door.x && player.y === room.door.y + 1
}
