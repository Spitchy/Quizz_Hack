import { CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three'
import type { RefObject } from 'react'
import type { ArmRig } from './entities/rig'
import { createRandom, hashSeed } from '../maze/random'
import { VIRUS } from './wakeStage'

// Le corps du médecin, partagé entre la pièce du réveil et le labyrinthe :
// ses matières, ses pièces animées, et les gestes posés hors rendu React.

function coatTexture() {
  const el = document.createElement('canvas')
  el.width = el.height = 256
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#d9d5c8'
  ctx.fillRect(0, 0, 256, 256)
  // Crasse, auréoles jaunâtres, éclaboussures sombres de sang séché.
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 6 + Math.random() * 40
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const blood = i % 3 === 0
    g.addColorStop(0, blood ? 'rgba(70,12,10,0.75)' : 'rgba(120,100,50,0.25)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(60,10,8,0.7)'
    const x = Math.random() * 256
    ctx.fillRect(x, Math.random() * 120, 2 + Math.random() * 3, 40 + Math.random() * 100)
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** La peau du visage, peinte pour une sphère : le devant est au quart de la texture (u = 0,25). */
function faceSkinTexture() {
  const random = createRandom(hashSeed('visage'))
  const w = 1024
  const h = 512
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#86877b'
  ctx.fillRect(0, 0, w, h)
  // Une peau morte : marbrures vertes, taches violacées.
  for (let i = 0; i < 90; i++) {
    const x = random() * w
    const y = random() * h
    const r = 12 + random() * 60
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const tone = random()
    g.addColorStop(0, tone < 0.5 ? 'rgba(66,76,52,0.26)' : tone < 0.8 ? 'rgba(84,48,62,0.2)' : 'rgba(175,172,150,0.2)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const cx = w * 0.25
  const eyeY = h * 0.42
  // Orbites : deux trous d'ombre autour des yeux.
  for (const side of [-1, 1]) {
    const x = cx + side * w * 0.056
    const g = ctx.createRadialGradient(x, eyeY, 4, x, eyeY, 66)
    g.addColorStop(0, 'rgba(8,4,8,0.98)')
    g.addColorStop(0.55, 'rgba(26,14,22,0.74)')
    g.addColorStop(1, 'rgba(30,20,26,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 70, eyeY - 70, 140, 140)
  }
  // Creux de l'arête du nez, front bosselé.
  const brow = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.36)
  brow.addColorStop(0, 'rgba(0,0,0,0)')
  brow.addColorStop(1, 'rgba(10,8,10,0.34)')
  ctx.fillStyle = brow
  ctx.fillRect(cx - 110, h * 0.2, 220, h * 0.16)
  // Veines noires qui partent des yeux.
  ctx.lineCap = 'round'
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1
    let x = cx + side * w * 0.056 + (random() - 0.5) * 20
    let y = eyeY + (random() - 0.5) * 34
    let a = random() * Math.PI * 2
    ctx.strokeStyle = `rgba(${18 + random() * 20},${10 + random() * 20},${26 + random() * 16},${0.46 + random() * 0.4})`
    ctx.lineWidth = 1 + random() * 2.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      a += (random() - 0.5) * 1.1
      x += Math.cos(a) * (9 + random() * 15)
      y += Math.sin(a) * (7 + random() * 12)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // Une cicatrice recousue en travers du front.
  ctx.strokeStyle = 'rgba(38,12,14,0.92)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 84, h * 0.3)
  ctx.quadraticCurveTo(cx - 10, h * 0.24, cx + 74, h * 0.28)
  ctx.stroke()
  ctx.lineWidth = 2
  for (let k = 0; k < 11; k++) {
    const x = cx - 74 + k * 14
    const y = h * 0.3 + Math.sin((k / 10) * Math.PI) * -h * 0.032
    ctx.beginPath()
    ctx.moveTo(x - 2, y - 8)
    ctx.lineTo(x + 2, y + 8)
    ctx.stroke()
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Le masque chirurgical : plis, et le sang qui a traversé là où il respire. */
function surgicalMaskTexture() {
  const random = createRandom(hashSeed('masque'))
  const el = document.createElement('canvas')
  el.width = 512
  el.height = 256
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#a6bfc0'
  ctx.fillRect(0, 0, 512, 256)
  ctx.fillStyle = 'rgba(38,58,62,0.22)'
  for (const y of [70, 120, 170]) ctx.fillRect(0, y, 512, 4)
  // Saturé de sang au milieu, en coulures.
  for (let i = 0; i < 60; i++) {
    const x = 256 + (random() - 0.5) * 150
    const y = 110 + (random() - 0.5) * 90
    const r = 8 + random() * 34
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(92,6,8,0.58)')
    g.addColorStop(1, 'rgba(92,6,8,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.fillStyle = 'rgba(72,4,6,0.86)'
  for (let i = 0; i < 9; i++) {
    const x = 180 + random() * 150
    ctx.fillRect(x, 130 + random() * 30, 2 + random() * 4, 30 + random() * 90)
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Matières du médecin, créées hors rendu. */
export function createDoctorMaterials() {
  const coat = coatTexture()
  const face = faceSkinTexture()
  const mask = surgicalMaskTexture()
  return {
    coatTexture: coat,
    faceTexture: face,
    maskTexture: mask,
    face: new MeshStandardMaterial({ map: face, roughness: 0.55 }),
    pupil: new MeshBasicMaterial({ color: VIRUS, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    liquid: new MeshBasicMaterial({ color: VIRUS, toneMapped: false }),
    coat: new MeshStandardMaterial({ map: coat, roughness: 0.85 }),
    scrubs: new MeshStandardMaterial({ color: '#3f6f6a', roughness: 0.9 }),
    cap: new MeshStandardMaterial({ color: '#5d8f86', roughness: 0.8 }),
    mask: new MeshStandardMaterial({ map: mask, roughness: 0.92 }),
    skin: new MeshStandardMaterial({ color: '#8e918a', roughness: 0.6 }),
    glove: new MeshStandardMaterial({ color: '#a9c2c7', roughness: 0.35 }),
    shoes: new MeshStandardMaterial({ color: '#121212', roughness: 0.5 }),
    steel: new MeshStandardMaterial({ color: '#c9cdd0', metalness: 0.85, roughness: 0.25 }),
    glass: new MeshStandardMaterial({ color: '#d8e0e0', transparent: true, opacity: 0.35, roughness: 0.1 }),
    eyes: new MeshStandardMaterial({ color: '#050505', roughness: 0.05, metalness: 0.4, emissive: new Color(0, 0, 0) }),
    sleeve: new MeshStandardMaterial({ color: '#2a2a2e', roughness: 1 }),
    hand: new MeshStandardMaterial({ color: '#b39a86', roughness: 0.8 }),
  }
}

export type DoctorMaterials = ReturnType<typeof createDoctorMaterials>

/** Les pièces du médecin, animées hors rendu par celui qui le met en scène. */
export interface DoctorParts {
  root: RefObject<Group | null>
  torso: RefObject<Group | null>
  inner: RefObject<Group | null>
  head: RefObject<Group | null>
  legL: RefObject<Group | null>
  legR: RefObject<Group | null>
  shinL: RefObject<Group | null>
  shinR: RefObject<Group | null>
  armR: RefObject<ArmRig>
  armL: RefObject<ArmRig>
  syringe: RefObject<Group | null>
  liquid: RefObject<Mesh | null>
}

/** Pivot du buste (il se penche depuis les hanches). */
export const HIPS = 0.95

const dir = new Vector3()
const virusGlow = new Color(VIRUS)
const noGlow = new Color(0, 0, 0)

/** Seringue posée en coordonnées monde (hors rendu React). */
export function placeSyringe(syringe: Group, from: Vector3, toward: Vector3) {
  syringe.position.copy(from).addScaledVector(dir.subVectors(toward, from).normalize(), 0.32)
  syringe.lookAt(toward)
}

/** Les yeux prennent la couleur du virus : tout le globe (`glow`) et la pointe au fond (`pupil`). */
export function glowEyes(mats: DoctorMaterials, on: boolean, t: number, glow = 1, pupil = 1) {
  mats.eyes.emissive.copy(on ? virusGlow : noGlow).multiplyScalar(on ? (0.6 + Math.sin(t * 6) * 0.3) * glow : 0)
  mats.pupil.opacity = on ? pupil : 0
}

/** Le faisceau de la lampe, écrit à chaque image : le médecin ne luit que s'il l'accroche. */
export const torchBeam = { from: new Vector3(), dir: new Vector3(0, 0, -1), level: 0 }

/** Son visage, écrit à chaque image : la lampe du joueur le cherche quand il est sur lui. */
export const doctorFace = new Vector3()

/** Le virus dans la seringue (0 : éteint dans le noir, 1 : il brille). */
export function setLiquid(mats: DoctorMaterials, color: Color, level: number) {
  mats.liquid.color.copy(color).multiplyScalar(level)
}
