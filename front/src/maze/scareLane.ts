import { DIRS, isFloor, TILE_SIZE, tileCenter, type Maze, type Tile } from './generate'
import type { Circle, Vec2 } from './physics'

// Par où arrive le médecin quand le noir tombe : la direction la plus dégagée
// depuis le joueur, sans mur, sans table ni entité sur le chemin. Le regard s'y
// tourne dans le noir, il ne sort donc jamais d'un mur. Pur et testable.

export interface ScareLane {
  /** Rotation Y du regard vers le couloir. */
  yaw: number
  /** Direction du couloir, unitaire. */
  dir: Vec2
  /** Mètres libres devant le joueur. */
  reach: number
}

const STEP = 0.2
/** Inutile de voir plus loin : le brouillard a déjà tout avalé. */
const MAX_REACH = 7
/** Marge devant un mur (m). */
const WALL_MARGIN = 0.35
/** Largeur de son passage, et marge devant ce qui lui barre la route (m). */
const BODY_WIDTH = 0.4
const BODY_MARGIN = 0.5

function isOpen(maze: Maze, x: number, z: number): boolean {
  return isFloor(maze, Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE))
}

/** Longueur libre devant `from` : jusqu'au mur, ou jusqu'au premier obstacle sur la trajectoire. */
function freeLength(maze: Maze, from: Vec2, dir: Vec2, avoid: readonly Circle[]): number {
  let reach = 0
  while (reach < MAX_REACH) {
    const ahead = reach + STEP + WALL_MARGIN
    if (!isOpen(maze, from.x + dir.x * ahead, from.z + dir.z * ahead)) break
    reach += STEP
  }
  for (const c of avoid) {
    const along = (c.x - from.x) * dir.x + (c.z - from.z) * dir.z
    const side = Math.abs((c.x - from.x) * dir.z - (c.z - from.z) * dir.x)
    // Ce qui est derrière lui ou à côté du chemin ne compte pas.
    if (along > 0 && side < c.radius + BODY_WIDTH) reach = Math.min(reach, Math.max(0, along - c.radius - BODY_MARGIN))
  }
  return reach
}

/** La voie la plus longue depuis la tuile du joueur. */
export function scareLane(maze: Maze, player: Tile, avoid: readonly Circle[]): ScareLane {
  const from = tileCenter(player)
  let best: ScareLane | null = null
  for (const d of DIRS) {
    const dir = { x: d.dx, z: d.dy }
    const reach = freeLength(maze, from, dir, avoid)
    if (!best || reach > best.reach) best = { yaw: Math.atan2(-dir.x, -dir.z), dir, reach }
  }
  return best ?? { yaw: 0, dir: { x: 0, z: -1 }, reach: 0 }
}
