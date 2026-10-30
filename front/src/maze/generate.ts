import { createRandom, hashSeed, pick, randomInt, shuffle, type Random } from './random'

// Génération du labyrinthe, en pur TypeScript (ni React ni Three.js).
//
// Grille de tuiles : une tuile est soit un mur plein, soit du sol. Les cellules
// du labyrinthe sont aux coordonnées impaires ; les tuiles paires entre deux
// cellules sont les passages (ou les murs) qui les séparent.
//
// Étapes : backtracker récursif (longs couloirs) → salles à piliers →
// boucles (on ouvre des culs-de-sac) → zones d'ambiance → néons → entités.

export const TILE_SIZE = 2.6

export const WALL = 1
export const FLOOR = 0

/** Ambiance d'une zone : papier peint, densité de néons. */
export const ZONES = ['normal', 'damp', 'dark'] as const
export type Zone = (typeof ZONES)[number]

export interface Dir {
  dx: number
  dy: number
}

export const DIRS: readonly Dir[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]

export interface Tile {
  x: number
  y: number
}

export interface EntitySpot extends Tile {
  /** Ordre de distance depuis le départ (0 = la plus proche). */
  id: number
  /** Direction vers laquelle l'entité regarde (vers le couloir ouvert). */
  facing: Dir
}

export interface CeilingLight extends Tile {
  /** Néon défaillant : grésille fort ou reste presque éteint. */
  broken: boolean
}

export interface Room extends Tile {
  width: number
  height: number
}

export interface Maze {
  seed: number
  width: number
  height: number
  /** `WALL` ou `FLOOR`, indexé par `y * width + x`. */
  tiles: Uint8Array
  /** Index dans `ZONES`, par tuile. */
  zones: Uint8Array
  rooms: Room[]
  lights: CeilingLight[]
  spawn: Tile & { facing: Dir }
  entities: EntitySpot[]
}

export interface MazeOptions {
  /** Texte ou nombre : le même seed redonne le même labyrinthe. */
  seed: string | number
  /** Nombre de cellules par côté (la grille fait `2 * cells + 1` tuiles). */
  cells?: number
  entityCount?: number
}

export function tileIndex(maze: Pick<Maze, 'width'>, x: number, y: number): number {
  return y * maze.width + x
}

export function isFloor(maze: Pick<Maze, 'width' | 'height' | 'tiles'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height && maze.tiles[y * maze.width + x] === FLOOR
}

export function floorNeighbors(maze: Pick<Maze, 'width' | 'height' | 'tiles'>, x: number, y: number): Dir[] {
  return DIRS.filter((d) => isFloor(maze, x + d.dx, y + d.dy))
}

/** Distances en nombre de tuiles depuis `start` (-1 si inaccessible). */
export function bfs(maze: Pick<Maze, 'width' | 'height' | 'tiles'>, start: Tile): Int32Array {
  const dist = new Int32Array(maze.width * maze.height).fill(-1)
  if (!isFloor(maze, start.x, start.y)) return dist
  const queue = new Int32Array(maze.width * maze.height)
  let head = 0
  let tail = 0
  const first = start.y * maze.width + start.x
  dist[first] = 0
  queue[tail++] = first
  while (head < tail) {
    const i = queue[head++]
    const x = i % maze.width
    const y = (i - x) / maze.width
    for (const d of DIRS) {
      const nx = x + d.dx
      const ny = y + d.dy
      if (!isFloor(maze, nx, ny)) continue
      const n = ny * maze.width + nx
      if (dist[n] !== -1) continue
      dist[n] = dist[i] + 1
      queue[tail++] = n
    }
  }
  return dist
}

// --- Étapes de génération ---------------------------------------------------

function carveCorridors(maze: Maze, cells: number, random: Random) {
  const visited = new Uint8Array(cells * cells)
  const stack: { cx: number; cy: number; from: Dir | null }[] = []
  const startX = randomInt(random, 0, cells - 1)
  const startY = randomInt(random, 0, cells - 1)
  visited[startY * cells + startX] = 1
  maze.tiles[tileIndex(maze, startX * 2 + 1, startY * 2 + 1)] = FLOOR
  stack.push({ cx: startX, cy: startY, from: null })

  while (stack.length) {
    const top = stack[stack.length - 1]
    const options = DIRS.filter((d) => {
      const nx = top.cx + d.dx
      const ny = top.cy + d.dy
      return nx >= 0 && ny >= 0 && nx < cells && ny < cells && !visited[ny * cells + nx]
    })
    if (!options.length) {
      stack.pop()
      continue
    }
    // Biais « tout droit » : de longs couloirs plutôt qu'un zigzag permanent.
    const straight = top.from && options.find((d) => d.dx === top.from!.dx && d.dy === top.from!.dy)
    const d = straight && random() < 0.35 ? straight : pick(random, options)
    const nx = top.cx + d.dx
    const ny = top.cy + d.dy
    visited[ny * cells + nx] = 1
    maze.tiles[tileIndex(maze, top.cx * 2 + 1 + d.dx, top.cy * 2 + 1 + d.dy)] = FLOOR
    maze.tiles[tileIndex(maze, nx * 2 + 1, ny * 2 + 1)] = FLOOR
    stack.push({ cx: nx, cy: ny, from: d })
  }
}

/** Grandes salles ouvertes, avec des piliers aux anciennes jonctions de murs. */
function carveRooms(maze: Maze, cells: number, random: Random) {
  const count = randomInt(random, 3, 5)
  for (let attempt = 0; attempt < count * 6 && maze.rooms.length < count; attempt++) {
    const w = randomInt(random, 2, 3)
    const h = randomInt(random, 2, 3)
    const cx = randomInt(random, 0, cells - w)
    const cy = randomInt(random, 0, cells - h)
    const room: Room = { x: cx * 2 + 1, y: cy * 2 + 1, width: w * 2 - 1, height: h * 2 - 1 }
    const overlaps = maze.rooms.some(
      (r) =>
        room.x < r.x + r.width + 2 && r.x < room.x + room.width + 2 && room.y < r.y + r.height + 2 && r.y < room.y + room.height + 2,
    )
    if (overlaps) continue
    maze.rooms.push(room)
    const pillars = random() < 0.7
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        const junction = x % 2 === 0 && y % 2 === 0
        maze.tiles[tileIndex(maze, x, y)] = pillars && junction ? WALL : FLOOR
      }
    }
  }
}

/** Culs-de-sac : cellules à une seule sortie (et alcôves si `anyTile`). */
function deadEnds(maze: Maze, anyTile = false): Tile[] {
  const result: Tile[] = []
  const step = anyTile ? 1 : 2
  for (let y = 1; y < maze.height - 1; y += step) {
    for (let x = 1; x < maze.width - 1; x += step) {
      if (isFloor(maze, x, y) && floorNeighbors(maze, x, y).length === 1) result.push({ x, y })
    }
  }
  return result
}

/** Écart minimal (en tuiles de chemin) entre deux entités, et avec le départ. */
const MIN_ENTITY_SPACING = 6
/** Écart minimal à vol d'oiseau (en tuiles) : pas deux entités de part et d'autre d'un mur. */
const MIN_ENTITY_GAP = 4

/**
 * Creuse des alcôves : une tuile de mur qui ne touche qu'un seul passage devient
 * un renfoncement, assez profond pour qu'une entité s'y tienne dos au mur.
 */
function carveAlcoves(maze: Maze, wanted: number, random: Random) {
  const existing = deadEnds(maze).length
  const options: { x: number; y: number }[] = []
  for (let y = 2; y < maze.height - 2; y += 2) {
    for (let x = 2; x < maze.width - 2; x += 2) {
      if (isFloor(maze, x, y) || floorNeighbors(maze, x, y).length !== 1) continue
      const inRoom = maze.rooms.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)
      if (!inRoom) options.push({ x, y })
    }
  }
  let added = 0
  for (const t of shuffle(random, options)) {
    if (existing + added >= wanted) break
    // Une alcôve à la fois par passage : la voisine ne doit pas en être une déjà.
    const [d] = floorNeighbors(maze, t.x, t.y)
    const passage = { x: t.x + d.dx, y: t.y + d.dy }
    if (floorNeighbors(maze, passage.x, passage.y).length !== 2) continue
    maze.tiles[tileIndex(maze, t.x, t.y)] = FLOOR
    added++
  }
}

/** Ouvre une partie des culs-de-sac pour créer des boucles, en en gardant pour les entités. */
function addLoops(maze: Maze, keepDeadEnds: number, random: Random) {
  const ends = shuffle(random, deadEnds(maze))
  let remaining = ends.length
  for (const end of ends) {
    if (remaining <= keepDeadEnds) break
    if (random() > 0.7) continue
    const closed = DIRS.filter((d) => {
      const wx = end.x + d.dx
      const wy = end.y + d.dy
      return !isFloor(maze, wx, wy) && isFloor(maze, end.x + d.dx * 2, end.y + d.dy * 2)
    })
    if (!closed.length) continue
    const d = pick(random, closed)
    maze.tiles[tileIndex(maze, end.x + d.dx, end.y + d.dy)] = FLOOR
    remaining--
  }
}

/** Zones d'ambiance par blocs de 4×4 cellules ; le départ est toujours éclairé. */
function assignZones(maze: Maze, random: Random) {
  const block = 8
  const bw = Math.ceil(maze.width / block)
  const bh = Math.ceil(maze.height / block)
  const blockZones = Array.from({ length: bw * bh }, () => {
    const r = random()
    return r < 0.55 ? 0 : r < 0.8 ? 1 : 2
  })
  const spawnBlock = Math.floor(maze.spawn.y / block) * bw + Math.floor(maze.spawn.x / block)
  blockZones[spawnBlock] = 0
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      maze.zones[tileIndex(maze, x, y)] = blockZones[Math.floor(y / block) * bw + Math.floor(x / block)]
    }
  }
}

const LIGHT_CHANCE = [0.6, 0.4, 0.06]

function placeLights(maze: Maze, random: Random) {
  for (let y = 1; y < maze.height - 1; y += 2) {
    for (let x = 1; x < maze.width - 1; x += 2) {
      if (!isFloor(maze, x, y)) continue
      const zone = maze.zones[tileIndex(maze, x, y)]
      if (random() < LIGHT_CHANCE[zone]) maze.lights.push({ x, y, broken: random() < (zone === 1 ? 0.3 : 0.12) })
    }
  }
}

function chooseSpawn(maze: Maze, cells: number) {
  const center = Math.floor(cells / 2) * 2 + 1
  let best: Tile = { x: center, y: center }
  let bestScore = Infinity
  for (let y = 1; y < maze.height - 1; y += 2) {
    for (let x = 1; x < maze.width - 1; x += 2) {
      if (!isFloor(maze, x, y)) continue
      const score = Math.abs(x - center) + Math.abs(y - center)
      if (score < bestScore) {
        bestScore = score
        best = { x, y }
      }
    }
  }
  const open = floorNeighbors(maze, best.x, best.y)
  maze.spawn = { ...best, facing: open[0] ?? DIRS[0] }
}

/**
 * Un tirage : point le plus éloigné (en chemin) avec un peu de hasard, en
 * écartant les candidats trop proches à vol d'oiseau d'une entité déjà placée
 * (séparées par un seul mur, elles paraîtraient collées).
 */
function pickSpread(
  maze: Maze,
  candidates: Tile[],
  paths: Int32Array[],
  fromSpawn: Int32Array,
  count: number,
  random: Random,
): number[] {
  const minDist = Float64Array.from(candidates, (t) => fromSpawn[tileIndex(maze, t.x, t.y)])
  const chosen: number[] = []
  while (chosen.length < count) {
    const ranked = candidates
      .map((t, i) => ({ t, i, d: minDist[i] }))
      .filter(
        (c) =>
          !chosen.includes(c.i) &&
          c.d >= MIN_ENTITY_SPACING &&
          chosen.every((o) => Math.hypot(candidates[o].x - c.t.x, candidates[o].y - c.t.y) >= MIN_ENTITY_GAP),
      )
      .sort((a, b) => b.d - a.d)
    // Plus personne ne respecte l'écart : on prend le moins mauvais.
    const pool = ranked.length
      ? ranked
      : candidates
          .map((t, i) => ({ t, i, d: minDist[i] }))
          .filter((c) => !chosen.includes(c.i) && c.d > 0)
          .sort((a, b) => b.d - a.d)
    if (!pool.length) break
    const choice = pick(random, pool.slice(0, Math.max(3, Math.ceil(pool.length * 0.25))))
    chosen.push(choice.i)
    candidates.forEach((t, i) => {
      const d = paths[choice.i][tileIndex(maze, t.x, t.y)]
      if (d >= 0) minDist[i] = Math.min(minDist[i], d)
    })
  }
  return chosen
}

/** Plus petit écart à vol d'oiseau entre deux entités (pénalisé s'il en manque). */
function spreadScore(maze: Maze, candidates: Tile[], paths: Int32Array[], chosen: number[], count: number): number {
  if (chosen.length < count) return -1
  let min = Infinity
  for (const a of chosen) {
    for (const b of chosen) {
      if (a === b) continue
      const path = paths[a][tileIndex(maze, candidates[b].x, candidates[b].y)]
      if (path < MIN_ENTITY_SPACING) return 0
      min = Math.min(min, Math.hypot(candidates[a].x - candidates[b].x, candidates[a].y - candidates[b].y))
    }
  }
  return min
}

/**
 * Répartit les entités dans des culs-de-sac, loin du départ et loin les unes
 * des autres.
 */
/** Renvoie l’écart minimal obtenu (voir `spreadScore`). */
function placeEntities(maze: Maze, count: number, random: Random): number {
  const minSpawnDistance = 6
  // Pas assez de culs-de-sac : on creuse des alcôves dans les murs, en partant
  // des zones les plus éloignées des culs-de-sac existants.
  carveAlcoves(maze, count * 5, random)
  const fromSpawn = bfs(maze, maze.spawn)
  const candidates = deadEnds(maze, true).filter((t) => fromSpawn[tileIndex(maze, t.x, t.y)] >= minSpawnDistance)

  const paths = candidates.map((t) => bfs(maze, t))

  // Plusieurs tirages, on garde le mieux réparti : le premier qui respecte
  // l'écart partout, sinon celui dont l'écart minimal est le plus grand.
  let best: { chosen: number[]; score: number } | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const chosen = pickSpread(maze, candidates, paths, fromSpawn, count, random)
    const score = spreadScore(maze, candidates, paths, chosen, count)
    if (!best || score > best.score) best = { chosen, score }
    if (score >= MIN_ENTITY_GAP) break
  }

  maze.entities = (best?.chosen ?? [])
    .map((i) => candidates[i])
    .sort((a, b) => fromSpawn[tileIndex(maze, a.x, a.y)] - fromSpawn[tileIndex(maze, b.x, b.y)])
    .map((t, id) => ({ ...t, id, facing: entityFacing(maze, t) }))
  return best?.score ?? -1
}

/** L'entité regarde vers le passage le plus long devant elle. */
function entityFacing(maze: Maze, t: Tile): Dir {
  let best = DIRS[0]
  let bestRun = -1
  for (const d of DIRS) {
    let run = 0
    while (isFloor(maze, t.x + d.dx * (run + 1), t.y + d.dy * (run + 1)) && run < 6) run++
    if (run > bestRun) {
      bestRun = run
      best = d
    }
  }
  return best
}

/** Variantes essayées si les entités ne peuvent pas être bien réparties. */
const MAX_VARIANTS = 6

export function generateMaze({ seed, cells = 12, entityCount = 10 }: MazeOptions): Maze {
  const numericSeed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)
  // Disposition trop serrée pour bien répartir les entités (rare) : on passe à
  // une variante dérivée du même seed, donc toujours reproductible.
  let fallback: Maze | null = null
  let fallbackScore = -Infinity
  for (let variant = 0; variant < MAX_VARIANTS; variant++) {
    const { maze, spread } = buildMaze((numericSeed + variant * 0x9e3779b9) >>> 0, cells, entityCount)
    maze.seed = numericSeed
    if (spread >= MIN_ENTITY_GAP || entityCount === 0) return maze
    if (spread > fallbackScore) {
      fallback = maze
      fallbackScore = spread
    }
  }
  return fallback!
}

function buildMaze(numericSeed: number, cells: number, entityCount: number): { maze: Maze; spread: number } {
  const random = createRandom(numericSeed)
  const size = cells * 2 + 1
  const maze: Maze = {
    seed: numericSeed,
    width: size,
    height: size,
    tiles: new Uint8Array(size * size).fill(WALL),
    zones: new Uint8Array(size * size),
    rooms: [],
    lights: [],
    spawn: { x: 1, y: 1, facing: DIRS[0] },
    entities: [],
  }

  carveCorridors(maze, cells, random)
  carveRooms(maze, cells, random)
  addLoops(maze, Math.ceil(entityCount * 1.6), random)
  chooseSpawn(maze, cells)
  assignZones(maze, random)
  placeLights(maze, random)
  const spread = placeEntities(maze, entityCount, random)
  return { maze, spread }
}

/** Centre d'une tuile en coordonnées monde (x, z). */
export function tileCenter(t: Tile): { x: number; z: number } {
  return { x: (t.x + 0.5) * TILE_SIZE, z: (t.y + 0.5) * TILE_SIZE }
}

/** Tuile contenant un point du monde. */
export function tileAt(x: number, z: number): Tile {
  return { x: Math.floor(x / TILE_SIZE), y: Math.floor(z / TILE_SIZE) }
}

/** Distance entre l'entité et le joueur quand il lit son panneau. */
export const READING_DISTANCE = 2.0

/**
 * Position de l'entité (adossée au fond de sa tuile) et point de lecture devant
 * elle. `clearance` : distance au mur du fond (m) ; les grands gestes en demandent plus.
 */
export function entityPlacement(spot: EntitySpot, clearance = 0.45) {
  const center = tileCenter(spot)
  const back = TILE_SIZE / 2 - clearance
  const position = { x: center.x - spot.facing.dx * back, z: center.z - spot.facing.dy * back }
  const reading = {
    x: position.x + spot.facing.dx * READING_DISTANCE,
    z: position.z + spot.facing.dy * READING_DISTANCE,
  }
  // Rotation Y pour que le modèle (qui regarde vers +z) fasse face à `facing`.
  const yaw = Math.atan2(spot.facing.dx, spot.facing.dy)
  return { position, reading, yaw }
}
