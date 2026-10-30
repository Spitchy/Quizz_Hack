// Le bulletin vu sur le téléphone. Dessiné sur un canvas à chaque image : la même
// image reste à l'écran du plein cadre jusqu'à la main du joueur. Une télé
// analogique qui bave, un présentateur dans l'ombre. Aucun import de Three.js.

export const NEWS_WIDTH = 1024
export const NEWS_HEIGHT = 576

const HUD_FONT = '"VT323", "Share Tech Mono", monospace'

/** Sous-titres, calés sur `news-broadcast-1.wav` (s). */
export const NEWS_LINES = [
  { at: 0.9, end: 1.71, text: 'Dernière heure.' },
  { at: 2.21, end: 4.21, text: 'Neuf développeurs disparus cette semaine.' },
  { at: 4.66, end: 6.32, text: 'La police recherche le docteur.' },
  { at: 6.82, end: 10.44, text: 'Il kidnappe des développeurs, et il les teste sur les bases du code.' },
  { at: 10.84, end: 13.55, text: 'Ceux qui échouent, il leur inocule le virus.' },
  { at: 14.1, end: 17.44, text: "D'après ce docteur, l'IA a tué le savoir des développeurs." },
  { at: 17.94, end: 20.16, text: 'Si vous codez, restez chez vous ce soir.' },
  { at: 20.51, end: 21.1, text: 'Et révisez.' },
] as const

const HEADLINES = [
  { from: 0, text: 'NEUF DÉVELOPPEURS DISPARUS' },
  { from: 6.8, text: 'ILS SONT TESTÉS SUR LES BASES DU CODE' },
  { from: 10.8, text: 'CEUX QUI ÉCHOUENT SONT INOCULÉS' },
  { from: 14.1, text: "« L'IA A TUÉ LEUR SAVOIR »" },
  { from: 17.9, text: 'RESTEZ CHEZ VOUS. RÉVISEZ.' },
] as const

const TICKER =
  'LE « DOCTEUR » TOUJOURS RECHERCHÉ  +++  HOMME EN BLOUSE, MASQUE CHIRURGICAL  +++  VU PRÈS D\'UNE CAMIONNETTE NOIRE  +++  NE SORTEZ PAS SEUL  +++  NE VOUS FIEZ PAS À VOTRE IA  +++  '

/** La phrase dite à l'instant `t` (s), ou `null` entre deux phrases. */
export function newsLineAt(t: number): string | null {
  return NEWS_LINES.find((l) => t >= l.at && t < l.end)?.text ?? null
}

export function headlineAt(t: number): string {
  let current: string = HEADLINES[0].text
  for (const h of HEADLINES) if (t >= h.from) current = h.text
  return current
}

function hash(n: number): number {
  const s = Math.sin(n * 91.73 + 4.1) * 43758.5453
  return s - Math.floor(s)
}

function bakeCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  const ctx = el.getContext('2d')!
  draw(ctx)
  return el
}

const PORTRAIT = { w: 370, h: 288 } as const

/** Portrait-robot du médecin, cuit une fois : flou, délavé, passé au photocopieur. */
function bakePortrait(): HTMLCanvasElement {
  const { w, h } = PORTRAIT
  return bakeCanvas(w, h, (ctx) => {
    ctx.filter = 'blur(1.8px) grayscale(0.55) contrast(1.25) brightness(0.85)'
    ctx.fillStyle = '#10161c'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h * 0.48
    // Blouse, cou.
    ctx.fillStyle = '#5d605a'
    ctx.beginPath()
    ctx.ellipse(cx, h * 1.08, w * 0.42, h * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3c3f3b'
    ctx.fillRect(cx - w * 0.06, cy + h * 0.2, w * 0.12, h * 0.2)
    // Tête grise, trop longue.
    const skin = ctx.createLinearGradient(cx - w * 0.16, 0, cx + w * 0.16, 0)
    skin.addColorStop(0, '#74776f')
    skin.addColorStop(1, '#3f423d')
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(cx, cy, w * 0.155, h * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()
    // Calot.
    ctx.fillStyle = '#35574f'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.17, w * 0.16, h * 0.2, 0, Math.PI, 0)
    ctx.fill()
    // Masque.
    ctx.fillStyle = '#6d8b90'
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.13, w * 0.145, h * 0.18, 0, 0, Math.PI)
    ctx.fill()
    ctx.fillRect(cx - w * 0.145, cy + h * 0.07, w * 0.29, h * 0.07)
    // Deux grands yeux noirs : ce sont eux qu'on regarde.
    ctx.filter = 'blur(1.2px)'
    ctx.fillStyle = '#010101'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * w * 0.066, cy - h * 0.025, w * 0.043, h * 0.085, side * 0.12, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

const ANCHOR = { w: 420, h: 480, cx: 210, cy: 110 } as const

/** Le présentateur, cuit une fois : une silhouette à contre-jour, le visage mangé par l'ombre. */
function bakeAnchor(): HTMLCanvasElement {
  const { w, h, cx, cy } = ANCHOR
  return bakeCanvas(w, h, (ctx) => {
    ctx.filter = 'blur(2.2px)'
    // Épaules et veste.
    ctx.fillStyle = '#0a0d13'
    ctx.beginPath()
    ctx.moveTo(cx - 170, h)
    ctx.bezierCurveTo(cx - 170, cy + 124, cx - 90, cy + 100, cx - 34, cy + 80)
    ctx.lineTo(cx + 34, cy + 80)
    ctx.bezierCurveTo(cx + 90, cy + 100, cx + 170, cy + 124, cx + 170, h)
    ctx.closePath()
    ctx.fill()
    // Chemise et cravate, seules à accrocher un peu de lumière.
    ctx.fillStyle = '#34373c'
    ctx.beginPath()
    ctx.moveTo(cx - 26, cy + 76)
    ctx.lineTo(cx, cy + 176)
    ctx.lineTo(cx + 26, cy + 76)
    ctx.fill()
    ctx.fillStyle = '#390b0e'
    ctx.beginPath()
    ctx.moveTo(cx - 7, cy + 84)
    ctx.lineTo(cx + 7, cy + 84)
    ctx.lineTo(cx + 12, cy + 150)
    ctx.lineTo(cx, cy + 174)
    ctx.lineTo(cx - 12, cy + 150)
    ctx.fill()
    // Cou.
    ctx.fillStyle = '#17130f'
    ctx.fillRect(cx - 22, cy + 44, 44, 44)
    // Visage : une joue éclairée, le reste perdu.
    const skin = ctx.createLinearGradient(cx - 56, 0, cx + 50, 0)
    skin.addColorStop(0, '#5f5048')
    skin.addColorStop(0.45, '#2c2522')
    skin.addColorStop(1, '#0d0b0a')
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(cx, cy, 54, 70, 0, 0, Math.PI * 2)
    ctx.fill()
    // Cheveux plaqués, qui suivent le crâne.
    ctx.fillStyle = '#070606'
    ctx.beginPath()
    ctx.ellipse(cx, cy - 10, 57, 68, 0, Math.PI, 0)
    ctx.quadraticCurveTo(cx + 40, cy - 44, cx - 8, cy - 40)
    ctx.quadraticCurveTo(cx - 44, cy - 38, cx - 57, cy - 10)
    ctx.fill()
    // Orbites : de l'ombre, pas des yeux.
    ctx.filter = 'blur(4px)'
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.beginPath()
    ctx.ellipse(cx - 21, cy - 6, 15, 10, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 21, cy - 6, 15, 10, 0, 0, Math.PI * 2)
    ctx.fill()
  })
}

let baked: { portrait: HTMLCanvasElement; anchor: HTMLCanvasElement } | null = null

function bakedArt() {
  baked ??= { portrait: bakePortrait(), anchor: bakeAnchor() }
  return baked
}

/** Le portrait sur le mur d'écrans : la transmission décroche par moments. */
function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const slot = Math.floor(t * 9)
  const shift = hash(slot) > 0.86 ? (hash(slot + 3) - 0.5) * 18 : 0
  ctx.drawImage(bakedArt().portrait, x + shift, y, w, h)
  if (shift) {
    ctx.fillStyle = 'rgba(190,210,215,0.2)'
    ctx.fillRect(x, y + hash(slot + 1) * h, w, 3 + hash(slot + 2) * 12)
  }
  ctx.restore()
}

/** Le présentateur, à contre-jour : seule sa bouche bouge. */
function drawAnchor(ctx: CanvasRenderingContext2D, t: number, speaking: boolean) {
  const left = NEWS_WIDTH * 0.3 - ANCHOR.cx + Math.sin(t * 0.8) * 3
  const top = NEWS_HEIGHT * 0.32 - ANCHOR.cy + Math.sin(t * 1.3) * 1.5
  ctx.drawImage(bakedArt().anchor, left, top)
  const open = speaking ? 2 + Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)) * 8 : 1.5
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(left + ANCHOR.cx - 14, top + ANCHOR.cy + 36, 28, open)
}

/** Une image du bulletin à l'instant `t` (s). */
export function drawNewsFrame(ctx: CanvasRenderingContext2D, t: number): void {
  const W = NEWS_WIDTH
  const H = NEWS_HEIGHT
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // Plateau : un mur bleu nuit et des bandes de lumière froide.
  const wall = ctx.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#0f1e2e')
  wall.addColorStop(1, '#060b12')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(100,140,170,0.13)'
  for (let i = 0; i < 7; i++) ctx.fillRect(40 + i * 150, 0, 26, H)

  // Écran du plateau : le portrait-robot.
  const px = W * 0.56
  const py = H * 0.1
  const pw = PORTRAIT.w
  const ph = PORTRAIT.h
  ctx.fillStyle = '#28333d'
  ctx.fillRect(px - 5, py - 5, pw + 10, ph + 10)
  drawPortrait(ctx, px, py, pw, ph, t)
  ctx.font = `30px ${HUD_FONT}`
  ctx.fillStyle = '#cfd6d6'
  ctx.fillText('PORTRAIT-ROBOT', px + 10, py + 30)
  ctx.fillStyle = '#b5242a'
  ctx.fillRect(px + pw - 138, py + ph - 42, 132, 34)
  ctx.fillStyle = '#ebe5d9'
  ctx.fillText('RECHERCHÉ', px + pw - 132, py + ph - 16)

  drawAnchor(ctx, t, newsLineAt(t) !== null)

  // Bandeaux.
  ctx.fillStyle = 'rgba(6,8,12,0.55)'
  ctx.fillRect(0, 0, W, 44)
  ctx.font = `32px ${HUD_FONT}`
  ctx.fillStyle = Math.sin(t * 5) > -0.3 ? '#d42b2f' : '#4a1416'
  ctx.fillText('●', 18, 32)
  ctx.fillStyle = '#ebe5d9'
  ctx.fillText('EN DIRECT  23:47', 44, 32)
  ctx.textAlign = 'right'
  ctx.fillText('TV-9 INFO', W - 18, 32)
  ctx.textAlign = 'left'

  const bandY = H * 0.74
  ctx.fillStyle = '#a81e23'
  ctx.fillRect(0, bandY, 190, 54)
  ctx.fillStyle = '#ebe5d9'
  ctx.font = `42px ${HUD_FONT}`
  ctx.fillText('FLASH INFO', 14, bandY + 40)
  ctx.fillStyle = 'rgba(226,221,208,0.93)'
  ctx.fillRect(190, bandY, W - 190, 54)
  ctx.fillStyle = '#12141a'
  ctx.fillText(headlineAt(t), 206, bandY + 40)

  ctx.fillStyle = '#0a0d13'
  ctx.fillRect(0, bandY + 54, W, 40)
  ctx.font = `30px ${HUD_FONT}`
  ctx.fillStyle = '#d9d3c4'
  const width = ctx.measureText(TICKER).width
  const scroll = (t * 110) % width
  ctx.fillText(TICKER + TICKER, -scroll, bandY + 84)

  // Sous-titres, posés sur l'image.
  const line = newsLineAt(t)
  if (line) {
    ctx.font = `30px ${HUD_FONT}`
    ctx.textAlign = 'center'
    const y = bandY - 18
    const box = ctx.measureText(line).width + 22
    ctx.fillStyle = 'rgba(0,0,0,0.78)'
    ctx.fillRect(W / 2 - box / 2, y - 26, box, 34)
    ctx.fillStyle = '#f1ecdf'
    ctx.fillText(line, W / 2, y)
    ctx.textAlign = 'left'
  }

  // La télé bave : balayage, bandes de suivi, un filet de parasites.
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1)
  const band = ((t * 0.17) % 1) * (H + 80) - 40
  ctx.fillStyle = 'rgba(190,205,215,0.05)'
  ctx.fillRect(0, band, W, 34)
  const slot = Math.floor(t * 12)
  if (hash(slot) > 0.8) {
    ctx.fillStyle = 'rgba(225,232,235,0.12)'
    ctx.fillRect(0, hash(slot + 0.5) * H, W, 2 + hash(slot + 0.25) * 9)
  }
}
