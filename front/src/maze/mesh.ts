import { DIRS, isFloor, TILE_SIZE, ZONES, type Maze } from './generate'

// Géométrie des murs, calculée sans Three.js : uniquement les faces visibles
// (une tuile de sol à côté d'une tuile de mur), regroupées par zone d'ambiance.

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

/** Taille d'un motif de papier peint (m) : les UV sont en coordonnées monde. */
export const WALLPAPER_SCALE = 1.6
export const BASEBOARD_HEIGHT = 0.14

class MeshBuilder {
  positions: number[] = []
  normals: number[] = []
  uvs: number[] = []
  indices: number[] = []

  /** Quad vertical sur le bord d'une tuile, face tournée vers `normal`. */
  quad(cx: number, cz: number, nx: number, nz: number, bottom: number, top: number, inset = 0) {
    // « Droite » vue depuis le sol : up × normale.
    const rx = nz
    const rz = -nx
    const half = TILE_SIZE / 2
    const x = cx + nx * inset
    const z = cz + nz * inset
    const base = this.positions.length / 3
    const corners: [number, number, number][] = [
      [x - rx * half, bottom, z - rz * half],
      [x + rx * half, bottom, z + rz * half],
      [x + rx * half, top, z + rz * half],
      [x - rx * half, top, z - rz * half],
    ]
    for (const [px, py, pz] of corners) {
      this.positions.push(px, py, pz)
      this.normals.push(nx, 0, nz)
      // UV continues d'une tuile à l'autre le long d'un même mur.
      this.uvs.push((px * rx + pz * rz) / WALLPAPER_SCALE, py / WALLPAPER_SCALE)
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  build(): MeshData {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      indices: Uint32Array.from(this.indices),
    }
  }
}

export interface WallMeshes {
  /** Un maillage de murs par zone (index de `ZONES`). */
  walls: MeshData[]
  baseboards: MeshData
}

export function buildWallMeshes(maze: Maze, height: number): WallMeshes {
  const walls = ZONES.map(() => new MeshBuilder())
  const baseboards = new MeshBuilder()
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!isFloor(maze, x, y)) continue
      const zone = maze.zones[y * maze.width + x]
      const cx = (x + 0.5) * TILE_SIZE
      const cz = (y + 0.5) * TILE_SIZE
      for (const d of DIRS) {
        if (isFloor(maze, x + d.dx, y + d.dy)) continue
        // Mur au bord de la tuile, tourné vers l'intérieur.
        const ex = cx + (d.dx * TILE_SIZE) / 2
        const ez = cz + (d.dy * TILE_SIZE) / 2
        walls[zone].quad(ex, ez, -d.dx, -d.dy, 0, height)
        baseboards.quad(ex, ez, -d.dx, -d.dy, 0, BASEBOARD_HEIGHT, 0.012)
      }
    }
  }
  return { walls: walls.map((w) => w.build()), baseboards: baseboards.build() }
}
