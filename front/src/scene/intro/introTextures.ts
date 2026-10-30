import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { createRandom, hashSeed, type Random } from '../../maze/random'

// Les textures de la rue de l'intro, peintes une fois au montage : bitume noyé,
// briques, dalles, volets, enseignes, halos et reflets.

export const FOG_COLOR = '#0c1116'
export const SODIUM = '#ffae63'

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  return { el, ctx: el.getContext('2d')! }
}

function asColor(el: HTMLCanvasElement) {
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  return t
}

function tiled(t: CanvasTexture, x: number, y: number) {
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(x, y)
  t.anisotropy = 8
  return t
}

function softTexture() {
  const { el, ctx } = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.12, 'rgba(255,255,255,0.42)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.09)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.012)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return asColor(el)
}

/** Nappe de brouillard : des dizaines de bouffées, jamais un disque. */
function fogTexture() {
  const random = createRandom(hashSeed('brouillard'))
  const { el, ctx } = canvas(256, 256)
  for (let i = 0; i < 60; i++) {
    const a = random() * Math.PI * 2
    const d = random() * 86
    const x = 128 + Math.cos(a) * d
    const y = 128 + Math.sin(a) * d * 0.6
    const r = 20 + random() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  }
  return asColor(el)
}

/** Reflet d'une lampe sur le bitume : il tremble à peine d'une ligne à l'autre, ses bords s'effacent. */
function streakTexture() {
  const { el, ctx } = canvas(128, 256)
  const random = createRandom(hashSeed('reflet'))
  let shimmer = 0.8
  for (let y = 0; y < 256; y += 2) {
    const k = 1 - y / 256
    shimmer += (0.55 + random() * 0.45 - shimmer) * 0.2
    const alpha = Math.min(1, k ** 1.4 * 1.1) * shimmer
    const g = ctx.createLinearGradient(0, 0, 128, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(255,255,255,${alpha.toFixed(3)})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, y, 128, 2)
  }
  return asColor(el)
}

function speckle(ctx: CanvasRenderingContext2D, random: Random, width: number, height: number, count: number, light: string, dark: string) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = random() > 0.5 ? light : dark
    ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2)
  }
}

/** Bitume : gravier, fissures, et de grandes plaques où l'eau a noyé le grain. */
function asphalt() {
  const random = createRandom(hashSeed('bitume'))
  const color = canvas(1024, 1024)
  const rough = canvas(1024, 1024)
  color.ctx.fillStyle = '#17181b'
  color.ctx.fillRect(0, 0, 1024, 1024)
  rough.ctx.fillStyle = '#9a9a9a'
  rough.ctx.fillRect(0, 0, 1024, 1024)
  speckle(color.ctx, random, 1024, 1024, 26000, 'rgba(120,122,126,0.16)', 'rgba(0,0,0,0.28)')
  speckle(rough.ctx, random, 1024, 1024, 18000, 'rgba(210,210,210,0.3)', 'rgba(30,30,30,0.3)')
  // Plaques d'eau : plus sombres et lisses comme un miroir.
  for (let i = 0; i < 26; i++) {
    const x = random() * 1024
    const y = random() * 1024
    const r = 50 + random() * 150
    for (const [ctx, tint] of [
      [color.ctx, 'rgba(4,5,8,0.55)'],
      [rough.ctx, 'rgba(8,8,8,0.92)'],
    ] as const) {
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
      g.addColorStop(0, tint)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  // Fissures.
  color.ctx.lineWidth = 1.5
  for (let i = 0; i < 16; i++) {
    let x = random() * 1024
    let y = random() * 1024
    let a = random() * Math.PI * 2
    color.ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    color.ctx.beginPath()
    color.ctx.moveTo(x, y)
    for (let k = 0; k < 12; k++) {
      a += (random() - 0.5) * 0.9
      x += Math.cos(a) * 18
      y += Math.sin(a) * 18
      color.ctx.lineTo(x, y)
    }
    color.ctx.stroke()
  }
  return { map: tiled(asColor(color.el), 12, 1), roughness: tiled(new CanvasTexture(rough.el), 12, 1) }
}

function sidewalkTexture() {
  const random = createRandom(hashSeed('dalles'))
  const { el, ctx } = canvas(512, 512)
  ctx.fillStyle = '#2d2d2f'
  ctx.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = `rgba(${40 + random() * 22},${40 + random() * 22},${42 + random() * 22},1)`
      ctx.fillRect(x * 128 + 2, y * 128 + 2, 124, 124)
    }
  }
  speckle(ctx, random, 512, 512, 7000, 'rgba(140,140,140,0.08)', 'rgba(0,0,0,0.2)')
  return tiled(asColor(el), 80, 2)
}

/** Vieilles briques noircies par la pluie. */
function brickTexture() {
  const random = createRandom(hashSeed('briques'))
  const { el, ctx } = canvas(1024, 1024)
  ctx.fillStyle = '#1b1715'
  ctx.fillRect(0, 0, 1024, 1024)
  const rowH = 32
  for (let row = 0; row < 32; row++) {
    const off = row % 2 ? 40 : 0
    for (let col = -1; col < 13; col++) {
      const v = 38 + random() * 34
      ctx.fillStyle = `rgb(${v + 14},${v * 0.78},${v * 0.68})`
      ctx.fillRect(col * 80 + off + 2, row * rowH + 2, 76, rowH - 4)
    }
  }
  // Coulures de pluie, le long des murs.
  for (let i = 0; i < 90; i++) {
    const x = random() * 1024
    const g = ctx.createLinearGradient(0, 0, 0, 1024)
    g.addColorStop(0, 'rgba(0,0,0,0.2)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 2 + random() * 14, 1024)
  }
  speckle(ctx, random, 1024, 1024, 9000, 'rgba(120,110,100,0.08)', 'rgba(0,0,0,0.2)')
  return tiled(asColor(el), 3, 4)
}

/** Une fenêtre : châssis, croisée ; le verre prend la teinte de l'instance. */
function windowTexture() {
  const { el, ctx } = canvas(128, 192)
  const g = ctx.createLinearGradient(0, 0, 0, 192)
  g.addColorStop(0, '#fff')
  g.addColorStop(1, '#a8a8a8')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 192)
  // Rideau tiré de moitié.
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, 54, 192)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, 128, 7)
  ctx.fillRect(0, 185, 128, 7)
  ctx.fillRect(0, 0, 7, 192)
  ctx.fillRect(121, 0, 7, 192)
  ctx.fillRect(61, 0, 6, 192)
  ctx.fillRect(0, 78, 128, 5)
  return asColor(el)
}

/** Rideau de fer baissé, tagué. */
function shutterTexture() {
  const random = createRandom(hashSeed('volets'))
  const { el, ctx } = canvas(512, 256)
  ctx.fillStyle = '#34363a'
  ctx.fillRect(0, 0, 512, 256)
  for (let y = 0; y < 256; y += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, y, 512, 2)
    ctx.fillStyle = 'rgba(150,152,156,0.1)'
    ctx.fillRect(0, y + 3, 512, 2)
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(30,18,10,${0.2 + random() * 0.4})`
    ctx.fillRect(random() * 512, random() * 256, 3 + random() * 24, 2 + random() * 60)
  }
  ctx.save()
  ctx.translate(160, 170)
  ctx.rotate(-0.08)
  ctx.font = 'bold 72px "VT323", monospace'
  ctx.fillStyle = 'rgba(150,40,40,0.55)'
  ctx.fillText('ILS REVIENNENT', -130, 0)
  ctx.restore()
  return asColor(el)
}

/**
 * Le visage d'un tueur, peint pour une sphère (le devant est à u = 0,25) : peau
 * marquée, cheveux courts qui s'arrêtent net, sourcils, barbe de trois jours, une
 * cicatrice. Les lunettes noires sont posées dessus.
 */
function hitmanFaceTexture() {
  const random = createRandom(hashSeed('tueur'))
  const w = 1024
  const h = 512
  const { el, ctx } = canvas(w, h)
  ctx.fillStyle = '#a98f7b'
  ctx.fillRect(0, 0, w, h)
  const cx = w * 0.25
  // Le relief, à la peinture : joues creuses, tempes, arête du nez, menton.
  for (const [x, y, r, tone] of [
    [cx - 70, h * 0.56, 62, 'rgba(50,30,24,0.34)'],
    [cx + 70, h * 0.56, 62, 'rgba(50,30,24,0.42)'],
    [cx, h * 0.54, 26, 'rgba(232,206,184,0.22)'],
    [cx - 44, h * 0.36, 44, 'rgba(232,206,184,0.14)'],
    [cx + 44, h * 0.36, 44, 'rgba(232,206,184,0.1)'],
    [cx - 120, h * 0.46, 70, 'rgba(50,30,24,0.28)'],
    [cx + 120, h * 0.46, 70, 'rgba(50,30,24,0.34)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, tone)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // Barbe de trois jours : un semis de points sombres, le long de la mâchoire.
  for (let i = 0; i < 9000; i++) {
    const x = random() * w
    const y = h * (0.6 + random() * 0.3)
    const dx = Math.abs(((x - cx + w * 1.5) % w) - w / 2) / (w / 2)
    if (dx < 0.11 && y < h * 0.66) continue
    ctx.fillStyle = `rgba(18,14,12,${0.22 + random() * 0.32})`
    ctx.fillRect(x, y, 1.6, 1.6)
  }
  // Bouche fermée, serrée.
  ctx.fillStyle = 'rgba(40,16,14,0.9)'
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.665, 30, 2.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(30,12,10,0.25)'
  ctx.fillRect(cx - 22, h * 0.675, 44, 5)
  // Sillons du nez à la bouche.
  ctx.strokeStyle = 'rgba(40,22,18,0.35)'
  ctx.lineWidth = 2
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + side * 22, h * 0.56)
    ctx.quadraticCurveTo(cx + side * 38, h * 0.62, cx + side * 38, h * 0.68)
    ctx.stroke()
  }
  // Sourcils, juste au-dessus des lunettes.
  ctx.fillStyle = '#17110e'
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(cx + side * 44, h * 0.385)
    ctx.rotate(side * 0.1)
    ctx.fillRect(-28, -5, 56, 9)
    ctx.restore()
  }
  // Cheveux ras : une ligne nette sur le front, tout le crâne, jusqu'à la nuque.
  ctx.fillStyle = '#0f0d0c'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h * 0.62)
  // Derrière la tête, puis la tempe droite.
  ctx.lineTo(cx + w * 0.3, h * 0.62)
  ctx.lineTo(cx + w * 0.17, h * 0.5)
  ctx.lineTo(cx + w * 0.135, h * 0.27)
  ctx.quadraticCurveTo(cx, h * 0.21, cx - w * 0.135, h * 0.27)
  ctx.lineTo(cx - w * 0.17, h * 0.5)
  ctx.lineTo(0, h * 0.62)
  ctx.closePath()
  ctx.fill()
  // Le grain du crâne rasé.
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(90,84,80,${random() * 0.2})`
    ctx.fillRect(random() * w, random() * h * 0.5, 1.5, 3)
  }
  // Une vieille cicatrice, sur la joue.
  ctx.strokeStyle = 'rgba(214,180,164,0.75)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(cx + 62, h * 0.47)
  ctx.quadraticCurveTo(cx + 76, h * 0.56, cx + 60, h * 0.63)
  ctx.stroke()
  const t = asColor(el)
  t.anisotropy = 4
  return t
}

/** Enseigne au néon : les lettres, et leur bave. */
function neonTexture(text: string, color: string, width: number) {
  const { el, ctx } = canvas(width, 128)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 86px "Share Tech Mono", "Arial Narrow", sans-serif'
  ctx.shadowColor = color
  ctx.shadowBlur = 28
  ctx.fillStyle = color
  ctx.fillText(text, width / 2, 68)
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.55
  ctx.fillText(text, width / 2, 68)
  return asColor(el)
}

export function createIntroTextures() {
  const road = asphalt()
  return {
    glow: softTexture(),
    fog: fogTexture(),
    streak: streakTexture(),
    road: road.map,
    roadRough: road.roughness,
    sidewalk: sidewalkTexture(),
    brick: brickTexture(),
    window: windowTexture(),
    shutter: shutterTexture(),
    pharmacy: neonTexture('PHARMACIE', '#35f08a', 640),
    hotel: neonTexture('HÔTEL', '#ff3a3a', 400),
    bar: neonTexture('BAR', '#ffbd59', 300),
  }
}

export type IntroTextures = ReturnType<typeof createIntroTextures>

export { hitmanFaceTexture }
