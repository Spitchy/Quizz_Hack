import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { Question } from '../api/client'
import { PALETTE } from './layout'
import { layoutSign, type SignBox, type SignLayout } from './signLayout'

// Textures procédurales dessinées sur canvas : aucune image à charger.

export const SIGN_FONT = '"Special Elite", monospace'
/** Utilisée le temps que Special Elite se charge. */
export const SIGN_FALLBACK_FONT = 'monospace'
export const SIGN_BOX: SignBox = { width: 1024, height: 768, padding: 64 }

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  return [el, el.getContext('2d')!] as const
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rand: () => number) {
  const image = ctx.getImageData(0, 0, w, h)
  const data = image.data
  // Xorshift entier amorcé par `rand` : même grain d'une fois sur l'autre,
  // dix fois plus rapide que le générateur flottant sur un grand canvas.
  let x = (rand() * 0x7fffffff) | 1
  const scale = amount / 0x100000000
  for (let i = 0; i < data.length; i += 4) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    const n = x * scale
    data[i] += n
    data[i + 1] += n
    data[i + 2] += n
  }
  ctx.putImageData(image, 0, 0)
}

function stains(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, rand: () => number) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 20 + rand() * 120
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

function toTexture(el: HTMLCanvasElement, repeat?: [number, number]) {
  const texture = new CanvasTexture(el)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  if (repeat) {
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(...repeat)
  }
  return texture
}

export type WallpaperVariant = 'normal' | 'damp' | 'dark'

/**
 * Papier peint jaune des Backrooms : rayures fines, motif discret, taches.
 * `damp` : coulures d'humidité ; `dark` : jauni, encrassé, moisissures.
 */
export function wallpaperTexture(variant: WallpaperVariant = 'normal', repeat: [number, number] = [1, 1]) {
  const [el, ctx] = canvas(512, 512)
  const rand = seeded(variant === 'normal' ? 7 : variant === 'damp' ? 11 : 17)
  ctx.fillStyle = variant === 'dark' ? PALETTE.wallDim : PALETTE.wall
  ctx.fillRect(0, 0, 512, 512)
  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = 'rgba(90,70,20,0.10)'
    ctx.fillRect(x, 0, 3, 512)
    ctx.fillStyle = 'rgba(255,245,200,0.06)'
    ctx.fillRect(x + 14, 0, 2, 512)
  }
  ctx.fillStyle = 'rgba(80,60,15,0.12)'
  for (let y = 16; y < 512; y += 48) {
    for (let x = 16; x < 512; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x + 5, y)
      ctx.lineTo(x, y + 6)
      ctx.lineTo(x - 5, y)
      ctx.fill()
    }
  }
  stains(ctx, 512, 512, 7, 'rgba(70,55,10,0.22)', rand)

  if (variant === 'damp') {
    // Coulures depuis le plafond.
    for (let i = 0; i < 9; i++) {
      const x = rand() * 512
      const length = 120 + rand() * 300
      const g = ctx.createLinearGradient(0, 0, 0, length)
      g.addColorStop(0, 'rgba(60,45,10,0.45)')
      g.addColorStop(1, 'rgba(60,45,10,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, 0, 4 + rand() * 10, length)
    }
    stains(ctx, 512, 512, 5, 'rgba(50,40,10,0.3)', rand)
  }
  if (variant === 'dark') {
    stains(ctx, 512, 512, 12, 'rgba(25,22,8,0.4)', rand)
    // Moisissure en bas du mur.
    const g = ctx.createLinearGradient(0, 512, 0, 300)
    g.addColorStop(0, 'rgba(30,35,15,0.55)')
    g.addColorStop(1, 'rgba(30,35,15,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 300, 512, 212)
  }

  grain(ctx, 512, 512, variant === 'dark' ? 34 : 22, rand)
  return toTexture(el, repeat)
}

/** Flaque de lumière sous un néon : dégradé radial, mélangé en additif. */
export function lightPoolTexture() {
  const [el, ctx] = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return toTexture(el)
}

/** Moquette humide, brun-jaune. */
export function carpetTexture(repeat: [number, number]) {
  const [el, ctx] = canvas(256, 256)
  const rand = seeded(13)
  ctx.fillStyle = PALETTE.carpet
  ctx.fillRect(0, 0, 256, 256)
  stains(ctx, 256, 256, 6, 'rgba(30,22,8,0.35)', rand)
  grain(ctx, 256, 256, 46, rand)
  return toTexture(el, repeat)
}

/** Dalles de faux plafond. */
export function ceilingTexture(repeat: [number, number]) {
  const [el, ctx] = canvas(256, 256)
  const rand = seeded(29)
  ctx.fillStyle = PALETTE.ceiling
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(60,50,25,0.55)'
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, 256, 256)
  stains(ctx, 256, 256, 3, 'rgba(90,70,20,0.3)', rand)
  grain(ctx, 256, 256, 30, rand)
  return toTexture(el, repeat)
}

/** Décalage de frappe de chaque ligne (px), pour réécrire une ligne à l'identique. */
export type SignJitter = readonly (readonly [number, number])[]

export interface SignBase {
  layout: SignLayout | null
  jitter: SignJitter
}

/** Contexte 2D lu souvent (grain) : gardé côté CPU, sans relecture GPU. */
export function signContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  return target.getContext('2d', { willReadFrequently: true })!
}

/**
 * Panneau en carton, sans choix mis en évidence : la question et ses choix
 * tapés à la machine, taches, fêlure, grain. Coûteux : dessiné une fois par
 * question, puis recopié à chaque changement de visée (`drawSignHighlight`).
 * `question = null` : panneau vierge (entité de l'intersection suivante).
 */
export function drawSignBase(
  target: HTMLCanvasElement,
  question: Question | null,
  options: { cracked: boolean; font: string; answer?: number | null },
): SignBase {
  const { width, height } = SIGN_BOX
  if (target.width !== width) target.width = width
  if (target.height !== height) target.height = height
  const ctx = signContext(target)
  const rand = seeded(question ? question.id.length * 97 + 3 : 5)

  ctx.fillStyle = PALETTE.paper
  ctx.fillRect(0, 0, width, height)
  stains(ctx, width, height, 9, 'rgba(90,70,30,0.18)', rand)
  const edge = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.7)
  edge.addColorStop(0, 'rgba(0,0,0,0)')
  edge.addColorStop(1, 'rgba(40,28,10,0.55)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, width, height)

  let layout: SignLayout | null = null
  const jitter: [number, number][] = []
  if (question) {
    const measure = (text: string, size: number) => {
      ctx.font = `${size}px ${options.font}`
      return ctx.measureText(text).width
    }
    layout = layoutSign(question, SIGN_BOX, measure, 58)
    ctx.textBaseline = 'top'
    for (const line of layout.lines) {
      ctx.font = `${line.fontSize}px ${options.font}`
      ctx.fillStyle = line.kind === 'question' ? PALETTE.ink : 'rgba(26,23,18,0.82)'
      // Léger décalage aléatoire par ligne : frappe irrégulière.
      const offset: [number, number] = [(rand() - 0.5) * 3, (rand() - 0.5) * 2]
      jitter.push(offset)
      ctx.fillText(line.text, SIGN_BOX.padding + offset[0], line.y + offset[1])
    }
    // Mode test (mock uniquement) : la bonne réponse est cochée en marge.
    const answer = options.answer ?? null
    const answerBand = answer === null ? undefined : layout.choiceBands.find((b) => b.choice === answer)
    if (answerBand) {
      ctx.fillStyle = 'rgba(80,160,60,0.18)'
      ctx.fillRect(SIGN_BOX.padding - 8, answerBand.top - 2, width - SIGN_BOX.padding * 2 + 16, answerBand.bottom - answerBand.top)
      ctx.fillStyle = '#2f7a2a'
      ctx.font = `bold ${Math.round(layout.fontSize)}px sans-serif`
      ctx.fillText('✓', width - SIGN_BOX.padding + 4, answerBand.top)
    }
  }

  if (options.cracked) {
    ctx.strokeStyle = 'rgba(20,12,4,0.9)'
    ctx.lineWidth = 6
    ctx.beginPath()
    let x = width / 2
    ctx.moveTo(x, 0)
    for (let y = 0; y <= height; y += 48) {
      x = width / 2 + (rand() - 0.5) * 60
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  grain(ctx, width, height, 18, rand)
  return { layout, jitter }
}

/** Choix visé : sa ligne repassée à l'encre noire et une flèche en marge. */
export function drawSignHighlight(ctx: CanvasRenderingContext2D, base: SignBase, highlight: number | null, font: string): void {
  const { layout, jitter } = base
  if (!layout || highlight === null) return
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000000'
  layout.lines.forEach((line, i) => {
    if (line.kind !== 'choice' || line.choice !== highlight) return
    ctx.font = `${line.fontSize}px ${font}`
    ctx.fillText(line.text, SIGN_BOX.padding + jitter[i][0], line.y + jitter[i][1])
  })
  const band = layout.choiceBands.find((b) => b.choice === highlight)
  if (band) {
    ctx.strokeStyle = 'rgba(10,8,5,0.85)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(SIGN_BOX.padding - 30, band.top + 6)
    ctx.lineTo(SIGN_BOX.padding - 12, (band.top + band.bottom) / 2)
    ctx.lineTo(SIGN_BOX.padding - 30, band.bottom - 6)
    ctx.stroke()
  }
}
