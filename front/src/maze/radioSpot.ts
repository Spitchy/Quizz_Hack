import { DIRS, isFloor, TILE_SIZE, tileCenter, type Dir, type Maze, type Tile } from './generate'
import type { Circle, Vec2 } from './physics'

// Où poser la radio et sa table : au plus près du milieu du niveau, contre un
// mur, loin du départ et des entités. Ne change rien à la génération : la même
// partie retrouve la radio au même endroit. Pur et testable.

/** Distance du centre de la table au mur (m). */
const TABLE_BACK = 0.44
/** Encombrement de la table pour les collisions : le passage reste libre à côté. */
const TABLE_RADIUS = 0.5
/** Pas avant d'avoir un peu marché. */
const MIN_SPAWN_TILES = 3

export interface RadioSpot {
  tile: Tile
  /** Centre de la table, au sol. */
  position: Vec2
  /** Rotation Y : le devant de la table (+z du modèle) regarde vers le couloir. */
  yaw: number
  facing: Dir
  obstacle: Circle
}

const manhattan = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

export function radioSpot(maze: Maze): RadioSpot | null {
  const middle = { x: (maze.width - 1) / 2, y: (maze.height - 1) / 2 }
  let best: { tile: Tile; facing: Dir; score: number } | null = null
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!isFloor(maze, x, y)) continue
      const tile = { x, y }
      if (manhattan(tile, maze.spawn) < MIN_SPAWN_TILES) continue
      if (maze.entities.some((e) => manhattan(tile, e) <= 1)) continue
      const backed = DIRS.filter((d) => !isFloor(maze, x - d.dx, y - d.dy))
      const facing = backed.find((d) => isFloor(maze, x + d.dx, y + d.dy)) ?? backed[0]
      if (!facing) continue
      const score = (x - middle.x) ** 2 + (y - middle.y) ** 2
      if (!best || score < best.score) best = { tile, facing, score }
    }
  }
  if (!best) return null
  const { tile, facing } = best
  const center = tileCenter(tile)
  const back = TILE_SIZE / 2 - TABLE_BACK
  const position = { x: center.x - facing.dx * back, z: center.z - facing.dy * back }
  return {
    tile,
    position,
    yaw: Math.atan2(facing.dx, facing.dy),
    facing,
    obstacle: { ...position, radius: TABLE_RADIUS },
  }
}

/** Le joueur peut ouvrir le dossier : sur la tuile de la table, ou juste à côté. */
export function canReachRadio(maze: Maze, spot: RadioSpot | null, player: Tile | null): boolean {
  if (!spot || !player || !isFloor(maze, player.x, player.y)) return false
  return manhattan(spot.tile, player) <= 1
}
