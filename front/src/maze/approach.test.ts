import { describe, expect, it } from 'vitest'
import { pathLength, planApproach, pointAlong } from './approach'
import { generateCorridor } from './corridor'
import { entityPlacement, generateMaze, isFloor, tileAt } from './generate'

describe('planApproach', () => {
  const maze = generateCorridor({ seed: 'approach' })
  // Le joueur lit le panneau de la 6e entité ; les entités 0, 2, 4 ont été fâchées.
  const player = entityPlacement(maze.entities[5]).reading
  const attackers = [0, 2, 4, 5].map((id) => ({ entity: id, from: entityPlacement(maze.entities[id]).position }))
  const { plans, facing, stand, camera } = planApproach(maze, player, attackers)

  it('un trajet par entité fâchée, départs échelonnés', () => {
    expect(plans.map((p) => p.entity)).toEqual([0, 2, 4, 5])
    plans.forEach((p, k) => expect(p.delay).toBeCloseTo(k * 0.4))
  })

  it('le regard se tourne vers le côté d’où vient la majorité (le départ du couloir)', () => {
    expect(Math.hypot(facing.x, facing.z)).toBeCloseTo(1)
    // Les entités 0, 2, 4 sont entre le départ (bas) et le joueur : elles arrivent par +z.
    expect(facing.z).toBeGreaterThan(0.5)
  })

  it('les trajets restent dans le couloir et finissent autour du joueur, là où il a reculé', () => {
    for (const plan of plans) {
      for (const p of plan.path) {
        const t = tileAt(p.x, p.z)
        expect(isFloor(maze, t.x, t.y)).toBe(true)
      }
      const end = plan.path[plan.path.length - 1]
      const d = Math.hypot(end.x - stand.x, end.z - stand.z)
      expect(d).toBeGreaterThan(0.9)
      expect(d).toBeLessThan(2.4)
    }
    // Les premières arrivées sont à portée de coup.
    const close = plans.filter((p) => Math.hypot(p.path.at(-1)!.x - stand.x, p.path.at(-1)!.z - stand.z) < 1.2)
    expect(close.length).toBeGreaterThanOrEqual(3)
  })

  it('aucune ne passe à travers le joueur pour rejoindre sa place', () => {
    for (const plan of plans) {
      const total = pathLength(plan.path)
      for (let s = 0; s <= total; s += 0.05) {
        const p = pointAlong(plan.path, s)
        expect(Math.hypot(p.x - stand.x, p.z - stand.z)).toBeGreaterThan(0.85)
      }
    }
  })

  it('caméra de surveillance : au plafond, sur le sol du couloir, vue dégagée sur le joueur', () => {
    const { position, target } = camera
    expect(position.y).toBeGreaterThan(2.2)
    const t = tileAt(position.x, position.z)
    expect(isFloor(maze, t.x, t.y)).toBe(true)
    expect(Math.hypot(position.x - stand.x, position.z - stand.z)).toBeGreaterThan(1.5)
    expect(target).toMatchObject({ x: stand.x, z: stand.z })
  })

  it('personne ne se tient entre la caméra et lui', () => {
    const toCamera = Math.atan2(camera.position.x - stand.x, camera.position.z - stand.z)
    for (const plan of plans) {
      const end = plan.path.at(-1)!
      const a = Math.atan2(end.x - stand.x, end.z - stand.z)
      const diff = Math.abs(((a - toCamera + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      expect(diff).toBeGreaterThan(0.9)
    }
  })

  it('les plus lointaines surgissent du noir à 7 tuiles au plus', () => {
    for (const plan of plans) expect(pathLength(plan.path)).toBeLessThan(7 * 2.6 + 4)
  })

  it('elles ne s’arrêtent pas au même endroit', () => {
    const ends = plans.map((p) => p.path[p.path.length - 1])
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        expect(Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z)).toBeGreaterThan(0.5)
      }
    }
  })

  it('fonctionne aussi dans le vrai labyrinthe', () => {
    const real = generateMaze({ seed: 'approach-maze' })
    const p = entityPlacement(real.entities[3]).reading
    const out = planApproach(real, p, real.entities.slice(0, 3).map((e) => ({ entity: e.id, from: entityPlacement(e).position })))
    for (const plan of out.plans) {
      for (const pt of plan.path) {
        const t = tileAt(pt.x, pt.z)
        expect(isFloor(real, t.x, t.y)).toBe(true)
      }
    }
  })
})

describe('pointAlong', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 0, z: 4 },
    { x: 3, z: 4 },
  ]
  it('parcourt la polyligne à vitesse constante', () => {
    expect(pathLength(path)).toBe(7)
    expect(pointAlong(path, 2)).toMatchObject({ x: 0, z: 2 })
    expect(pointAlong(path, 5)).toMatchObject({ x: 1, z: 4 })
    expect(pointAlong(path, 99)).toMatchObject({ x: 3, z: 4 })
    expect(pointAlong(path, 1).heading).toBeCloseTo(0)
    expect(pointAlong(path, 6).heading).toBeCloseTo(Math.PI / 2)
  })
})
