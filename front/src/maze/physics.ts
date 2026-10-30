import { bfs, isFloor, tileAt, tileIndex, TILE_SIZE, type Maze, type Tile } from './generate'

// Déplacement du joueur : collisions contre les murs (tuiles pleines) et les
// entités (cercles), en fonctions pures.

export interface Vec2 {
  x: number
  z: number
}

export interface Circle extends Vec2 {
  radius: number
}

export const PLAYER_RADIUS = 0.32
const EPSILON = 1e-4

function normalize(x: number, z: number): [number, number] {
  const length = Math.hypot(x, z)
  return length > EPSILON ? [x / length, z / length] : [1, 0]
}

function wallAt(maze: Maze, x: number, z: number): boolean {
  const t = tileAt(x, z)
  return !isFloor(maze, t.x, t.y)
}

function hitsWall(maze: Maze, x: number, z: number, r: number): boolean {
  return wallAt(maze, x - r, z - r) || wallAt(maze, x + r, z - r) || wallAt(maze, x - r, z + r) || wallAt(maze, x + r, z + r)
}

/**
 * Déplace un joueur (boîte de demi-côté `radius`) de `delta`, axe par axe :
 * on glisse le long des murs au lieu de s'y coller.
 */
export function moveWithCollisions(
  maze: Maze,
  from: Vec2,
  delta: Vec2,
  obstacles: readonly Circle[] = [],
  radius = PLAYER_RADIUS,
): Vec2 {
  let { x, z } = from

  // Petits pas pour ne jamais traverser une tuile entière en une frame.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.z)) / (TILE_SIZE * 0.25)))
  const sx = delta.x / steps
  const sz = delta.z / steps
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      const nx = x + sx
      if (!hitsWall(maze, nx, z, radius)) x = nx
      else if (sx > 0) x = Math.floor((nx + radius) / TILE_SIZE) * TILE_SIZE - radius - EPSILON
      else x = (Math.floor((nx - radius) / TILE_SIZE) + 1) * TILE_SIZE + radius + EPSILON
    }
    if (sz !== 0) {
      const nz = z + sz
      if (!hitsWall(maze, x, nz, radius)) z = nz
      else if (sz > 0) z = Math.floor((nz + radius) / TILE_SIZE) * TILE_SIZE - radius - EPSILON
      else z = (Math.floor((nz - radius) / TILE_SIZE) + 1) * TILE_SIZE + radius + EPSILON
    }
  }

  // Les entités repoussent le joueur hors de leur cercle.
  for (const o of obstacles) {
    const dx = x - o.x
    const dz = z - o.z
    const min = o.radius + radius
    const dist = Math.hypot(dx, dz)
    if (dist >= min) continue
    // Pile sur le centre : on repousse vers là d'où l'on venait.
    const [ux, uz] = dist > EPSILON ? [dx / dist, dz / dist] : normalize(from.x - o.x, from.z - o.z)
    const px = o.x + ux * (min + EPSILON)
    const pz = o.z + uz * (min + EPSILON)
    if (!hitsWall(maze, px, pz, radius)) {
      x = px
      z = pz
    } else {
      // Pris entre l'entité et un mur : on annule le déplacement.
      return { ...from }
    }
  }
  return { x, z }
}

/** Distances de chaque entité vers toutes les tuiles, calculées une fois. */
export function entityDistanceMaps(maze: Maze): Int32Array[] {
  return maze.entities.map((e) => bfs(maze, e))
}

/** Plus courte distance (en tuiles) du joueur à une entité non résolue, ou `null`. */
export function nearestEntityDistance(
  maze: Maze,
  maps: readonly Int32Array[],
  player: Tile,
  unresolved: (id: number) => boolean,
): number | null {
  const i = tileIndex(maze, player.x, player.y)
  let best: number | null = null
  maze.entities.forEach((e, k) => {
    if (!unresolved(e.id)) return
    const d = maps[k][i]
    if (d >= 0 && (best === null || d < best)) best = d
  })
  return best
}

/**
 * Force du signal (0..5) affichée dans le HUD selon la distance de chemin en
 * tuiles. Calibré sur un labyrinthe de 25×25 où les trajets dépassent souvent 40 tuiles.
 */
export function signalStrength(distance: number | null): number {
  if (distance === null) return 0
  if (distance <= 3) return 5
  if (distance <= 8) return 4
  if (distance <= 16) return 3
  if (distance <= 28) return 2
  if (distance <= 45) return 1
  return 0
}
