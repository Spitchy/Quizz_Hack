import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Matrix4,
  Vector3,
  type Group,
  type Mesh,
} from 'three'

// Désintégration : nuage de particules réparti sur la surface même du corps.
// Construit hors du rendu React (au moment où l'entité disparaît).

export const DISINTEGRATE_DURATION = 2.8
const PARTICLES = 1400

export interface ParticleCloud {
  geometry: BufferGeometry
  /** Positions de départ (repère local de l'entité). */
  origin: Float32Array
  /** Vitesse initiale de chaque particule. */
  velocity: Float32Array
}

const ember = new Color('#fff4d6')
const tint = new Color()
const a = new Vector3()
const b = new Vector3()
const c = new Vector3()
const ab = new Vector3()
const ac = new Vector3()
const toSpace = new Matrix4()

/**
 * Triangles visibles du groupe, en coordonnées du repère `space`, à plat
 * (9 flottants par triangle) : aucun objet alloué par triangle.
 */
function collectTriangles(group: Group, space: Group): { corners: Float32Array; cumulative: Float32Array; total: number } {
  group.updateWorldMatrix(true, true)
  space.updateWorldMatrix(true, false)
  const meshes: Mesh[] = []
  let capacity = 0
  group.traverseVisible((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    meshes.push(mesh)
    const index = mesh.geometry.index
    capacity += Math.floor((index ? index.count : mesh.geometry.attributes.position.count) / 3)
  })
  const corners = new Float32Array(capacity * 9)
  const cumulative = new Float32Array(capacity)
  let n = 0
  let total = 0
  const inverse = new Matrix4().copy(space.matrixWorld).invert()
  for (const mesh of meshes) {
    toSpace.multiplyMatrices(inverse, mesh.matrixWorld)
    const pos = mesh.geometry.attributes.position
    const index = mesh.geometry.index
    const count = index ? index.count : pos.count
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(toSpace)
      b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(toSpace)
      c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(toSpace)
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2
      if (area <= 1e-6) continue
      a.toArray(corners, n * 9)
      b.toArray(corners, n * 9 + 3)
      c.toArray(corners, n * 9 + 6)
      cumulative[n++] = total += area
    }
  }
  return { corners, cumulative: cumulative.subarray(0, n), total }
}

/** Échantillonne la surface de `group` (uniformément par aire), dans le repère de `space`. */
export function sampleCloud(group: Group, space: Group, tintColor: string, glow: number): ParticleCloud {
  const { corners, cumulative, total } = collectTriangles(group, space)

  const count = cumulative.length ? PARTICLES : 0
  const origin = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const velocity = new Float32Array(count * 3)
  const base = new Color(tintColor)
  for (let i = 0; i < count; i++) {
    // Triangle tiré au prorata de son aire, point uniforme dedans.
    const r = Math.random() * total
    let lo = 0
    let hi = cumulative.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumulative[mid] < r) lo = mid + 1
      else hi = mid
    }
    let u = Math.random()
    let v = Math.random()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const k = lo * 9
    for (let axis = 0; axis < 3; axis++) {
      const p0 = corners[k + axis]
      origin[i * 3 + axis] = p0 + (corners[k + 3 + axis] - p0) * u + (corners[k + 6 + axis] - p0) * v
    }
    // Teinte du monstre, avec quelques braises plus claires.
    tint.copy(base).lerp(ember, Math.random() < 0.18 ? 0.6 + glow * 0.4 : glow * Math.random())
    colors[i * 3] = tint.r
    colors[i * 3 + 1] = tint.g
    colors[i * 3 + 2] = tint.b
    // Vers le haut, un peu vers l'extérieur.
    velocity[i * 3] = (Math.random() - 0.5) * 0.6
    velocity[i * 3 + 1] = 0.3 + Math.random() * 0.8
    velocity[i * 3 + 2] = (Math.random() - 0.5) * 0.6
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(origin.slice(), 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return { geometry, origin, velocity }
}

/** Avance le nuage à l'âge `age` (s) ; le corps se défait de haut en bas. */
export function advanceCloud(cloud: ParticleCloud, age: number): void {
  const pos = cloud.geometry.attributes.position as BufferAttribute
  const arr = pos.array as Float32Array
  const { origin, velocity } = cloud
  for (let i = 0; i < arr.length; i += 3) {
    const delay = Math.max(0, (2.4 - origin[i + 1]) * 0.22)
    const t = Math.max(0, age - delay)
    const swirl = t * 2.2 + origin[i + 1] * 3
    arr[i] = origin[i] + velocity[i] * t + Math.sin(swirl) * 0.1 * t
    arr[i + 1] = origin[i + 1] + velocity[i + 1] * t + 0.22 * t * t
    arr[i + 2] = origin[i + 2] + velocity[i + 2] * t + Math.cos(swirl) * 0.1 * t
  }
  pos.needsUpdate = true
}

/** Particule ronde et douce (partagée). */
let dot: CanvasTexture | null = null
export function particleTexture(): CanvasTexture {
  if (dot) return dot
  const el = document.createElement('canvas')
  el.width = el.height = 32
  const ctx = el.getContext('2d')!
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  dot = new CanvasTexture(el)
  return dot
}
