import { CanvasTexture, SRGBColorSpace, type Material, type MeshBasicMaterial } from 'three'
import type { ReactNode, RefObject } from 'react'
import { PALETTE } from '../layout'
import type { EntityLook } from './archetypes'

// État d'animation partagé entre `Entity` et les archétypes, et outils purs.

export type Mood = 'calm' | 'angry' | 'menace'

/** État d'animation écrit par `Entity` à chaque frame, lu par les archétypes. */
export interface EntityMotion {
  t: number
  mood: Mood
  /** Secondes depuis le début d'une colère fraîche (mauvaise réponse), sinon `null`. */
  angerSince: number | null
  /** Secondes depuis une bonne réponse (approbation), sinon `null`. */
  approvalSince: number | null
  /** Le joueur lit son panneau. */
  engaged: boolean
  /** Rotation de tête vers le joueur (rad, repère local), amortie. */
  lookYaw: number
  /** Colère lissée (0..1) : 1 pendant la réaction, résiduelle ensuite. */
  anger: number
  /** Réaction fraîche à une mauvaise réponse (0..1), montée vive, retombée douce. */
  fresh: number
  /** Menace lissée (0..1) : défaite, sourire dans le noir. */
  menace: number
  /** Intensité de marche (0..1, lissée) et phase du cycle de pas. */
  walk: number
  walkPhase: number
  /** Coup porté : -1 armé, 0 repos, +1 impact (courbe continue). */
  attack: number
  /** Fantôme (victoire) : silhouette translucide. */
  ghost: boolean
}

export const initialMotion = (): EntityMotion => ({
  t: 0,
  mood: 'calm',
  angerSince: null,
  approvalSince: null,
  engaged: false,
  lookYaw: 0,
  anger: 0,
  fresh: 0,
  menace: 0,
  walk: 0,
  walkPhase: 0,
  attack: 0,
  ghost: false,
})

export interface EntityMaterials {
  body: Material
  secondary: Material
  /** Yeux et lueurs : couleur pilotée par l'humeur. */
  eye: MeshBasicMaterial
  /** Vide : bouches, orbites, visages absents. */
  dark: Material
  /** Rangée de dents (texture). */
  teeth: Material
}

export interface ArchetypeProps {
  look: EntityLook
  motion: RefObject<EntityMotion>
  mats: EntityMaterials
  /** Le panneau, à placer dans les mains (ou ailleurs). */
  sign: ReactNode
  /** Fantôme (victoire) : toutes les matières sont la même ombre translucide. */
  ghost: boolean
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const ease = (t: number) => t * t * (3 - 2 * t)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Image par image : temps quantifié à `fps` images par seconde (stop-motion). */
export const stepped = (t: number, fps: number) => Math.floor(t * fps) / fps
export function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** Bruit lissé (−0,5..0,5) : valeurs pseudo-aléatoires reliées par une courbe douce. */
export function smoothNoise(t: number, seed = 0): number {
  const i = Math.floor(t)
  const o = seed * 31.7
  return lerp(hash(i + o), hash(i + 1 + o), ease(t - i)) - 0.5
}

/**
 * Tic nerveux (−0,5..0,5) : tient une pose, puis bascule très vite vers la
 * suivante (en `snap` de période) — brusque à l'œil, mais jamais d'une image à l'autre.
 */
export function twitch(t: number, seed = 0, snap = 0.3): number {
  const i = Math.floor(t)
  const o = seed * 31.7
  return lerp(hash(i - 1 + o), hash(i + o), ease(clamp01((t - i) / snap))) - 0.5
}

/** Ressort critique (à la `SmoothDamp`) : suit une cible sans à-coup, quelle que soit la cadence. */
export interface Spring {
  value: number
  velocity: number
}

export function damp(spring: Spring, target: number, smoothTime: number, dt: number): number {
  const omega = 2 / Math.max(1e-4, smoothTime)
  const x = omega * dt
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = spring.value - target
  const temp = (spring.velocity + omega * change) * dt
  spring.velocity = (spring.velocity - omega * temp) * decay
  spring.value = target + (change + temp) * decay
  return spring.value
}

/** Colère visée : forte pendant la réaction (≈ 2,4 s), résiduelle ensuite. */
export function angerTarget(mood: Mood, angerSince: number | null): number {
  if (mood === 'menace') return 0.7
  if (mood !== 'angry') return 0
  return angerSince !== null && angerSince < 2.4 ? 1 : 0.3
}

/** Intensité de colère (lissée par `Entity`). */
export const angerLevel = (m: EntityMotion) => m.anger

/**
 * Enveloppe d'un coup : armé (−1) en se ramassant, frappe rapide mais continue
 * jusqu'à +1 à l'instant de l'impact, tenue, puis retour au repos.
 */
export function attackEnvelope(hits: readonly number[], since: number): number {
  for (const at of hits) {
    const dt = since - at
    if (dt > -0.55 && dt < -0.09) return -ease((dt + 0.55) / 0.46)
    if (dt >= -0.09 && dt < 0) return lerp(-1, 1, ease((dt + 0.09) / 0.09))
    if (dt >= 0 && dt < 0.14) return 1
    if (dt >= 0.14 && dt < 0.65) return 1 - ease((dt - 0.14) / 0.51)
  }
  return 0
}

/** Dents : croissant pâle et interstices, partagé par tous les monstres. */
let teethTexture: CanvasTexture | null = null
export function getTeethTexture(): CanvasTexture {
  if (teethTexture) return teethTexture
  const el = document.createElement('canvas')
  el.width = 512
  el.height = 192
  const ctx = el.getContext('2d')!
  ctx.fillStyle = PALETTE.text
  ctx.beginPath()
  ctx.moveTo(16, 40)
  ctx.quadraticCurveTo(256, 250, 496, 40)
  ctx.quadraticCurveTo(256, 140, 16, 40)
  ctx.fill()
  ctx.strokeStyle = 'rgba(5,6,10,0.9)'
  ctx.lineWidth = 5
  for (let i = 1; i < 18; i++) {
    const x = 16 + (480 / 18) * i
    const t = (x - 256) / 240
    ctx.beginPath()
    ctx.moveTo(x, 40 + 60 * (1 - t * t))
    ctx.lineTo(x, 40 + 110 * (1 - t * t))
    ctx.stroke()
  }
  teethTexture = new CanvasTexture(el)
  teethTexture.colorSpace = SRGBColorSpace
  return teethTexture
}
