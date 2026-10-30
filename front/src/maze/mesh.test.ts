import { describe, expect, it } from 'vitest'
import { DIRS, generateMaze, isFloor, TILE_SIZE } from './generate'
import { buildWallMeshes } from './mesh'

describe('buildWallMeshes', () => {
  const maze = generateMaze({ seed: 'mesh' })
  const { walls, baseboards } = buildWallMeshes(maze, 2.7)

  // Nombre attendu de faces visibles : une par couple (sol, mur voisin).
  let faces = 0
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!isFloor(maze, x, y)) continue
      faces += DIRS.filter((d) => !isFloor(maze, x + d.dx, y + d.dy)).length
    }
  }

  it('une face par bord sol/mur, réparties par zone', () => {
    const quads = walls.reduce((n, w) => n + w.indices.length / 6, 0)
    expect(quads).toBe(faces)
    expect(baseboards.indices.length / 6).toBe(faces)
    expect(walls.filter((w) => w.indices.length > 0).length).toBeGreaterThanOrEqual(2)
  })

  it('les normales pointent vers le sol voisin, à l’horizontale', () => {
    for (const w of walls) {
      // 4 sommets (12 valeurs) par quad : on teste le milieu du bord bas.
      for (let i = 0; i < w.positions.length; i += 12) {
        const nx = w.normals[i]
        const nz = w.normals[i + 2]
        expect(w.normals[i + 1]).toBe(0)
        expect(Math.hypot(nx, nz)).toBeCloseTo(1)
        // Un pas le long de la normale depuis le mur tombe sur du sol.
        const cx = (w.positions[i] + w.positions[i + 3]) / 2 + nx * 0.1
        const cz = (w.positions[i + 2] + w.positions[i + 5]) / 2 + nz * 0.1
        expect(isFloor(maze, Math.floor(cx / TILE_SIZE), Math.floor(cz / TILE_SIZE))).toBe(true)
      }
    }
  })

  it('triangles tournés vers la normale (faces avant visibles depuis le sol)', () => {
    const w = walls.find((m) => m.indices.length > 0)!
    for (let t = 0; t < w.indices.length; t += 3) {
      const [a, b, c] = [w.indices[t], w.indices[t + 1], w.indices[t + 2]].map((i) => [
        w.positions[i * 3],
        w.positions[i * 3 + 1],
        w.positions[i * 3 + 2],
      ])
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const n = w.indices[t] * 3
      expect(cross[0] * w.normals[n] + cross[2] * w.normals[n + 2]).toBeGreaterThan(0)
    }
  })

  it('hauteur des murs et des plinthes', () => {
    const ys = (m: { positions: Float32Array }) => m.positions.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys(walls[0]))).toBeCloseTo(2.7)
    expect(Math.max(...ys(baseboards))).toBeCloseTo(0.14)
  })
})
