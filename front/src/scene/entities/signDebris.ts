import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three'
import { isFloor, tileAt, type Maze } from '../../maze/generate'

// Ce qui reste d'un panneau une fois lâché : un morceau qui vole, tombe, rebondit
// contre les murs et reste au sol. Les coordonnées sont celles du monde : il ne
// suit plus le monstre qui s'agite. Aucun nœud n'est créé : on pose le morceau
// d'origine là où il doit être, relativement à son parent.

const GRAVITY = 9.8
const CEILING = 2.55

export interface Debris {
  active: boolean
  resting: boolean
  pos: Vector3
  vel: Vector3
  spin: Vector3
  quat: Quaternion
  /** Orientation à plat sur le sol ; `null` : c'est une boule, elle roule. */
  flat: Quaternion | null
  restY: number
  radius: number
}

export function createDebris(restY: number, radius: number, flatYaw: number | null): Debris {
  return {
    active: false,
    resting: false,
    pos: new Vector3(),
    vel: new Vector3(),
    spin: new Vector3(),
    quat: new Quaternion(),
    flat: flatYaw === null ? null : new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, flatYaw)),
    restY,
    radius,
  }
}

/** Prend le morceau à sa place actuelle dans le monde et le lance. */
export function launchDebris(d: Debris, part: Object3D, vel: Vector3, spin: Vector3): void {
  part.updateWorldMatrix(true, false)
  part.getWorldPosition(d.pos)
  part.getWorldQuaternion(d.quat)
  d.vel.copy(vel)
  d.spin.copy(spin)
  d.active = true
  d.resting = false
}

/** Rien ne dépasse dans un mur à cet endroit. */
export function isOpen(maze: Maze | undefined, x: number, z: number, radius: number): boolean {
  if (!maze) return true
  for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [0, 0]]) {
    const t = tileAt(x + dx, z + dz)
    if (!isFloor(maze, t.x, t.y)) return false
  }
  return true
}

const dq = new Quaternion()
const euler = new Euler()

/** Une image de chute : rebonds sur le sol et les murs, puis repos. */
export function stepDebris(d: Debris, dt: number, maze: Maze | undefined): void {
  if (!d.active || d.resting) return
  d.vel.y -= GRAVITY * dt
  const nextX = d.pos.x + d.vel.x * dt
  const nextZ = d.pos.z + d.vel.z * dt
  if (isOpen(maze, nextX, d.pos.z, d.radius)) d.pos.x = nextX
  else {
    d.vel.x *= -0.35
    d.spin.multiplyScalar(0.7)
  }
  if (isOpen(maze, d.pos.x, nextZ, d.radius)) d.pos.z = nextZ
  else {
    d.vel.z *= -0.35
    d.spin.multiplyScalar(0.7)
  }
  d.pos.y += d.vel.y * dt
  if (d.pos.y > CEILING) {
    d.pos.y = CEILING
    d.vel.y = Math.min(0, d.vel.y)
  }

  euler.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)
  d.quat.premultiply(dq.setFromEuler(euler))
  // Près du sol, une feuille se couche à plat ; une boule continue de rouler.
  if (d.flat && d.pos.y < d.restY + 0.35) d.quat.slerp(d.flat, 1 - Math.exp(-dt * 11))

  if (d.pos.y <= d.restY) {
    d.pos.y = d.restY
    const horizontal = Math.hypot(d.vel.x, d.vel.z)
    if (Math.abs(d.vel.y) < 1.1 && horizontal < 0.45) {
      d.resting = true
      if (d.flat) d.quat.copy(d.flat)
      return
    }
    d.vel.y *= -0.3
    d.vel.x *= 0.62
    d.vel.z *= 0.62
    d.spin.multiplyScalar(0.55)
  }
}

const inverse = new Matrix4()
const parentQuat = new Quaternion()

/** Pose le morceau dans le repère de son parent : il reste où il est dans le monde, même si le parent bouge. */
export function seatDebris(d: Debris, part: Object3D): void {
  const parent = part.parent
  if (!parent) return
  parent.updateWorldMatrix(true, false)
  inverse.copy(parent.matrixWorld).invert()
  part.position.copy(d.pos).applyMatrix4(inverse)
  parent.getWorldQuaternion(parentQuat).invert()
  part.quaternion.copy(parentQuat).multiply(d.quat)
}
