import { bfs, DIRS, isFloor, tileAt, tileCenter, tileIndex, type Maze, type Tile } from './generate'
import type { Vec2 } from './physics'

// Défaite : les entités qu'on a fâchées reviennent vers le joueur en suivant
// les couloirs, depuis la direction où il les a laissées. Pur, testable.

export interface ApproachPlan {
  entity: number
  /** Trajet en coordonnées monde, du point de départ (dans le noir) au joueur. */
  path: Vec2[]
  /** Départ décalé (s) : elles n'arrivent pas toutes en même temps. */
  delay: number
}

export interface ApproachOptions {
  /** Longueur maximale du trajet visible, en tuiles. */
  maxTiles?: number
}

/** Chemin de tuiles de `from` jusqu'au joueur, en descendant les distances BFS. */
function pathToPlayer(maze: Maze, dist: Int32Array, from: Tile): Tile[] | null {
  if (dist[tileIndex(maze, from.x, from.y)] < 0) return null
  const tiles = [from]
  let cur = from
  for (let guard = 0; guard < maze.width * maze.height; guard++) {
    const d = dist[tileIndex(maze, cur.x, cur.y)]
    if (d === 0) break
    const next = DIRS.map((dir) => ({ x: cur.x + dir.dx, y: cur.y + dir.dy })).find(
      (n) => isFloor(maze, n.x, n.y) && dist[tileIndex(maze, n.x, n.y)] === d - 1,
    )
    if (!next) break
    tiles.push(next)
    cur = next
  }
  return tiles
}

/**
 * Places autour du joueur (angle par rapport au côté d'où vient la majorité,
 * rayon) : premier cercle à portée de coup, second cercle derrière. Celles du
 * côté de la caméra sont retirées : personne ne se tient entre elle et lui.
 */
const RING: readonly [number, number][] = [
  [0, 1.05],
  [-0.7, 1.05],
  [0.7, 1.05],
  [-1.35, 1.0],
  [1.35, 1.0],
  [-1.95, 1.05],
  [1.95, 1.05],
  [Math.PI, 1.05],
  [-0.4, 1.7],
  [0.4, 1.7],
  [0, 1.75],
  [-1.05, 1.65],
  [1.05, 1.65],
  [Math.PI - 0.4, 1.7],
  [Math.PI + 0.4, 1.7],
]
/** Secteur laissé libre face à la caméra (rad, de part et d'autre). */
const CAMERA_CLEARANCE = 0.95
/** Marge aux murs d'une place (rayon d'une entité). */
const BODY_MARGIN = 0.3
/** Elles ne passent jamais plus près du joueur que leur place. */
const KEEP_OUT = 0.95

export interface CameraSpot {
  /** Caméra de surveillance, en hauteur dans un coin. */
  position: { x: number; y: number; z: number }
  /** Point visé : le joueur, à mi-hauteur. */
  target: { x: number; y: number; z: number }
}

export interface ApproachResult {
  plans: ApproachPlan[]
  /** Direction (unitaire) d'où vient la majorité : le regard du joueur s'y tourne. */
  facing: Vec2
  /** Où le joueur, saisi, recule en titubant : au centre de la tuile voisine, côté couloir. */
  stand: Vec2
  /** Caméra de surveillance qui filme la scène. */
  camera: CameraSpot
}

/** Point au large des murs (le corps d'une entité y tient). */
function roomy(maze: Maze, p: Vec2, margin = BODY_MARGIN): boolean {
  for (const [dx, dz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
    const t = tileAt(p.x + dx, p.z + dz)
    if (!isFloor(maze, t.x, t.y)) return false
  }
  return true
}

/** Pas de mur entre deux points (échantillonnage le long du segment). */
function clearLine(maze: Maze, a: Vec2, b: Vec2): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2))
  for (let i = 0; i <= steps; i++) {
    const t = tileAt(a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps)
    if (!isFloor(maze, t.x, t.y)) return false
  }
  return true
}

/**
 * Caméra de surveillance : au plafond, dans un coin, derrière le joueur
 * (elle voit les entités arriver de face). À défaut, sur les côtés ou devant.
 */
export function securityCamera(maze: Maze, stand: Vec2, facing: Vec2): CameraSpot {
  const back = { x: -facing.x, z: -facing.z }
  const left = { x: -facing.z, z: facing.x }
  const right = { x: facing.z, z: -facing.x }
  const target = { x: stand.x, y: 0.8, z: stand.z }
  for (const dir of [back, facing, left, right]) {
    const lat = { x: -dir.z, z: dir.x }
    for (const d of [2.7, 2.3, 3.1, 1.9]) {
      for (const side of [0.95, -0.95, 0.5, -0.5, 0]) {
        const p = { x: stand.x + dir.x * d + lat.x * side, z: stand.z + dir.z * d + lat.z * side }
        if (roomy(maze, p, 0.12) && clearLine(maze, p, stand)) return { position: { ...p, y: 2.5 }, target }
      }
    }
  }
  return { position: { x: stand.x + back.x * 1.5, y: 2.5, z: stand.z + back.z * 1.5 }, target }
}

const angleOf = (v: Vec2) => Math.atan2(v.x, v.z)
const wrap = (a: number) => ((((a % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
const angleDiff = (a: number, b: number) => Math.abs(wrap(a - b))

/**
 * Chaque entité suit le couloir depuis l'endroit où le joueur l'a laissée
 * jusqu'à l'endroit où il recule (`stand`), et s'arrête à une place autour de
 * lui, du côté d'où elle arrive, sans jamais passer à travers lui.
 */
export function planApproach(
  maze: Maze,
  player: Vec2,
  attackers: readonly { entity: number; from: Vec2 }[],
  { maxTiles = 7 }: ApproachOptions = {},
): ApproachResult {
  const playerTile = tileAt(player.x, player.z)
  const dist = bfs(maze, playerTile)
  const chains = attackers.map(({ from }) => pathToPlayer(maze, dist, tileAt(from.x, from.z)))

  // Le côté d'arrivée le plus fréquent, lu trois tuiles avant le joueur (la
  // tuile voisine ne dit rien : depuis une alcôve, c'est toujours le couloir).
  const sides = new Map<string, { x: number; z: number; n: number }>()
  for (const chain of chains) {
    if (!chain || chain.length < 2) continue
    const probe = chain[Math.max(0, chain.length - 4)]
    const vx = probe.x - playerTile.x
    const vz = probe.y - playerTile.y
    const key = `${Math.sign(vx)},${Math.sign(vz)}`
    const side = sides.get(key) ?? { x: 0, z: 0, n: 0 }
    side.x += vx
    side.z += vz
    side.n++
    sides.set(key, side)
  }
  const ranked = [...sides.entries()].sort((p, q) => q[1].n - p[1].n)
  const best = ranked[0]?.[1]
  const norm = best ? Math.hypot(best.x, best.z) || 1 : 1
  const facing = best ? { x: best.x / norm, z: best.z / norm } : { x: 0, z: -1 }

  // Il recule hors de l'alcôve, sur la tuile par où passent la plupart d'entre elles.
  const majority = chains.find((chain) => {
    if (!chain || chain.length < 2) return false
    const probe = chain[Math.max(0, chain.length - 4)]
    return ranked[0] && `${Math.sign(probe.x - playerTile.x)},${Math.sign(probe.y - playerTile.y)}` === ranked[0][0]
  })
  const stand = majority && majority.length >= 2 ? tileCenter(majority[majority.length - 2]) : player

  // Les trajets vont jusqu'à `stand` (pas jusqu'au point de lecture, qu'il a quitté).
  const toStand = bfs(maze, tileAt(stand.x, stand.z))
  const routes = attackers.map(({ from }) => {
    const tiles = pathToPlayer(maze, toStand, tileAt(from.x, from.z))
    const path: Vec2[] = []
    if (!tiles || tiles.length < 2) {
      path.push(from)
    } else if (tiles.length - 1 > maxTiles) {
      // Trop loin : elle surgit du noir à `maxTiles` tuiles, sur son chemin.
      for (const t of tiles.slice(tiles.length - 1 - maxTiles, -1)) path.push(tileCenter(t))
    } else {
      path.push(from)
      for (const t of tiles.slice(1, -1)) path.push(tileCenter(t))
    }
    // La fin du trajet est coupée là où elle entrerait dans le cercle autour de lui.
    const near = (p: Vec2) => Math.hypot(p.x - stand.x, p.z - stand.z) < KEEP_OUT + 0.6
    while (path.length > 1 && near(path[path.length - 1])) path.pop()
    const last = path[path.length - 1]
    const away = { x: last.x - stand.x, z: last.z - stand.z }
    return { path, arrival: Math.hypot(away.x, away.z) > 1e-3 ? angleOf(away) : angleOf(facing) }
  })

  // Places valides autour de lui (hors du champ de la caméra), chacune prise
  // par l'entité qui arrive du même côté.
  const camera = securityCamera(maze, stand, facing)
  const cameraAngle = angleOf({ x: camera.position.x - stand.x, z: camera.position.z - stand.z })
  const base = angleOf(facing)
  const slots = RING.map(([angle, radius]) => {
    const a = base + angle
    return { angle: a, radius, p: { x: stand.x + Math.sin(a) * radius, z: stand.z + Math.cos(a) * radius } }
  }).filter((slot) => angleDiff(slot.angle, cameraAngle) > CAMERA_CLEARANCE && roomy(maze, slot.p) && clearLine(maze, slot.p, stand))
  const taken = new Set<number>()
  const order = routes.map((_, k) => k).sort((i, j) => pathLength(routes[i].path) - pathLength(routes[j].path))
  const ends: Vec2[] = new Array(attackers.length)
  for (const k of order) {
    let pick = -1
    let score = Infinity
    slots.forEach((slot, i) => {
      if (taken.has(i)) return
      const cost = angleDiff(slot.angle, routes[k].arrival) + (slot.radius > 1.2 ? 0.9 : 0)
      if (cost < score) {
        score = cost
        pick = i
      }
    })
    if (pick >= 0) {
      taken.add(pick)
      ends[k] = slots[pick].p
    } else {
      // Plus de place : derrière les autres, dans l'axe d'arrivée.
      const a = routes[k].arrival
      ends[k] = { x: stand.x + Math.sin(a) * (2.2 + k * 0.1), z: stand.z + Math.cos(a) * (2.2 + k * 0.1) }
    }
  }

  const plans = attackers.map(({ entity }, k) => {
    const path = routes[k].path
    const end = ends[k]
    // Une place loin de son côté d'arrivée : elle le contourne par un point du cercle.
    const last = path[path.length - 1]
    const fromAngle = angleOf({ x: last.x - stand.x, z: last.z - stand.z })
    const toAngle = angleOf({ x: end.x - stand.x, z: end.z - stand.z })
    if (angleDiff(fromAngle, toAngle) > 1.2) {
      const mid = fromAngle + wrap(toAngle - fromAngle) / 2
      for (const radius of [1.3, 1.1]) {
        const around = { x: stand.x + Math.sin(mid) * radius, z: stand.z + Math.cos(mid) * radius }
        if (roomy(maze, around, 0.15)) {
          path.push(around)
          break
        }
      }
    }
    path.push(end)
    return { entity, path, delay: k * 0.4 }
  })
  return { plans, facing, stand, camera }
}

/** Longueur d'une polyligne. */
export function pathLength(path: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
  return total
}

/** Point et direction à la distance `s` le long d'une polyligne. */
export function pointAlong(path: readonly Vec2[], s: number): { x: number; z: number; heading: number } {
  let remaining = Math.max(0, s)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const seg = Math.hypot(b.x - a.x, b.z - a.z)
    const heading = Math.atan2(b.x - a.x, b.z - a.z)
    if (remaining <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(1, remaining / seg) : 1
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading }
    }
    remaining -= seg
  }
  const p = path[path.length - 1]
  return { x: p.x, z: p.z, heading: 0 }
}
