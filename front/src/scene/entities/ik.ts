import { Vector3 } from 'three'

// Cinématique inverse à deux os (épaule → coude → main, hanche → genou → pied) :
// la main va où on la veut, le coude se place de lui-même du côté du « pôle ».
// Pur, testable sans rendu.

const dir = new Vector3()
const side = new Vector3()
const FALLBACK = new Vector3(0, 0, 1)

/**
 * Place le coude (`elbow`) et la main (`hand`) d'un bras de longueurs `a`
 * (épaule–coude) et `b` (coude–main) dont l'épaule est en `root`, la main
 * visant `target`. Trop loin : le bras se tend dans sa direction ; trop près :
 * il se replie sans se croiser. `pole` : point vers lequel le coude se plie.
 */
export function solveTwoBone(
  root: Vector3,
  target: Vector3,
  a: number,
  b: number,
  pole: Vector3,
  elbow: Vector3,
  hand: Vector3,
): void {
  dir.subVectors(target, root)
  const reach = dir.length()
  if (reach < 1e-6) dir.set(0, -1, 0)
  else dir.divideScalar(reach)
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, reach))
  hand.copy(root).addScaledVector(dir, d)

  // Côté du pli : le pôle, projeté perpendiculairement à l'axe épaule–main.
  side.subVectors(pole, root)
  side.addScaledVector(dir, -side.dot(dir))
  if (side.lengthSq() < 1e-8) side.copy(FALLBACK).addScaledVector(dir, -FALLBACK.dot(dir))
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0).addScaledVector(dir, -dir.x)
  side.normalize()

  // Loi des cosinus : angle à l'épaule.
  const cos = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)))
  const sin = Math.sqrt(1 - cos * cos)
  elbow.copy(root).addScaledVector(dir, a * cos).addScaledVector(side, a * sin)
}
