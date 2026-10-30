import { createRandom, hashSeed } from '../maze/random'

// Le journal posé à côté de la radio. Dessiné sur un canvas : le même dessin sert
// de texture sur la table et de page lue en gros plan. Aucun import de Three.js.

export const PAPER_WIDTH = 1000
export const PAPER_HEIGHT = 1360
const INK = '#17130d'
const TITLE_FONT = '"Pirata One", serif'
const BODY_FONT = '"Special Elite", "Courier Prime", monospace'

export const NEWSPAPER = {
  masthead: "L'ÉCHO DES COULOIRS",
  edition: 'ÉDITION SPÉCIALE  ·  NIVEAU 0  ·  DERNIER NUMÉRO',
  headline: 'UN VIRUS CHANGE LES HOMMES EN MONSTRES',
  deck: 'Les disparus du niveau 0 reviennent. Ils ne sont plus humains.',
  caption: 'Dernière image de la caméra 04, couloir B-17.',
  columns: [
    "Depuis trois semaines, les équipes de nuit ne répondent plus. Selon un document retrouvé dans les bureaux, tout commence par une simple piqûre : le sujet oublie son nom, puis sa forme.",
    "Les témoins décrivent un homme beaucoup trop grand, un mannequin qui change de place dès qu'on détourne les yeux, un enfant en ciré qui chantonne, un employé à tête d'écran, une chose qui rampe, et un amas de chair qui parle à plusieurs voix.",
    "Tous tiennent un panneau. Tous posent une question. Une mauvaise réponse, et ils ne vous laissent plus partir.",
  ],
  warning: "SI VOUS ENTENDEZ CETTE RADIO, NE VOUS ARRÊTEZ PAS. ET SURTOUT, NE LAISSEZ PERSONNE VOUS SOIGNER.",
} as const

/** Coupe un texte en lignes qui tiennent dans `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Dessine les lignes, renvoie le `y` sous le dernier. */
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): number {
  for (const line of wrap(ctx, text, width)) {
    ctx.fillText(line, x, y)
    y += height
  }
  return y
}

function rule(ctx: CanvasRenderingContext2D, y: number, thick: number) {
  ctx.fillRect(50, y, PAPER_WIDTH - 100, thick)
}

/** Photo de surveillance, mal imprimée : six silhouettes dans un couloir. */
function drawPhoto(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const fade = ctx.createRadialGradient(x + w / 2, y + h * 0.35, 20, x + w / 2, y + h * 0.4, w * 0.62)
  fade.addColorStop(0, '#8d8672')
  fade.addColorStop(1, '#14120d')
  ctx.fillStyle = fade
  ctx.fillRect(x, y, w, h)
  // Le néon, et les fuyantes du couloir.
  ctx.fillStyle = '#d8cfb6'
  ctx.fillRect(x + w * 0.42, y + 10, w * 0.16, 7)
  ctx.strokeStyle = '#0c0a07'
  ctx.lineWidth = 3
  for (const [a, b] of [
    [0, 0.36],
    [1, 0.64],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x + w * a, y)
    ctx.lineTo(x + w * b, y + h * 0.32)
    ctx.moveTo(x + w * a, y + h)
    ctx.lineTo(x + w * b, y + h * 0.68)
    ctx.stroke()
  }
  ctx.fillStyle = '#060504'
  const ground = y + h * 0.93
  const body = (cx: number, width: number, height: number, head: number) => {
    ctx.fillRect(cx - width / 2, ground - height, width, height)
    ctx.beginPath()
    ctx.ellipse(cx, ground - height - head * 0.7, head * 0.8, head, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // Le Long, le Mannequin, l'Enfant.
  body(x + w * 0.17, 22, h * 0.72, 15)
  body(x + w * 0.33, 40, h * 0.42, 19)
  body(x + w * 0.5, 30, h * 0.2, 17)
  // L'Employé, à tête carrée.
  ctx.fillRect(x + w * 0.655, ground - h * 0.42, 44, h * 0.42)
  ctx.fillRect(x + w * 0.655 - 9, ground - h * 0.42 - 54, 62, 52)
  // La Rampante, au ras du sol.
  ctx.beginPath()
  ctx.ellipse(x + w * 0.8, ground - 16, 58, 15, 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x + w * 0.8 - 58, ground - 9, 116, 9)
  // L'Amas.
  for (const [dx, dy, r] of [
    [0, 0, 44],
    [30, -32, 29],
    [-31, -18, 30],
    [8, -54, 22],
  ]) {
    ctx.beginPath()
    ctx.arc(x + w * 0.92 + dx, ground - 34 + dy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Trame d'imprimerie et grain : reproductibles.
  const random = createRandom(hashSeed('photo'))
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(225,215,190,0.1)'
    ctx.fillRect(x + random() * w, y + random() * h, 2, 2)
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.strokeRect(x, y, w, h)
}

/** Dessine toute la page sur un canvas de `PAPER_WIDTH` × `PAPER_HEIGHT` (mise à l'échelle par l'appelant). */
export function drawNewspaper(ctx: CanvasRenderingContext2D, scale = 1): void {
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = '#c8bb98'
  ctx.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT)

  // Papier jauni, auréoles, une tache de sang séché.
  const random = createRandom(hashSeed('journal'))
  for (let i = 0; i < 26; i++) {
    const x = random() * PAPER_WIDTH
    const y = random() * PAPER_HEIGHT
    const r = 40 + random() * 170
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(92,70,32,0.16)')
    g.addColorStop(1, 'rgba(92,70,32,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = `92px ${TITLE_FONT}`
  ctx.fillText(NEWSPAPER.masthead, PAPER_WIDTH / 2, 38)
  rule(ctx, 142, 5)
  ctx.font = `25px ${BODY_FONT}`
  ctx.fillText(NEWSPAPER.edition, PAPER_WIDTH / 2, 156)
  rule(ctx, 192, 2)

  ctx.font = `76px ${BODY_FONT}`
  let y = paragraph(ctx, NEWSPAPER.headline, PAPER_WIDTH / 2, 212, PAPER_WIDTH - 90, 80)
  ctx.font = `31px ${BODY_FONT}`
  y = paragraph(ctx, NEWSPAPER.deck, PAPER_WIDTH / 2, y + 10, PAPER_WIDTH - 110, 37) + 10

  drawPhoto(ctx, 50, y, PAPER_WIDTH - 100, 330)
  ctx.fillStyle = INK
  y += 340
  ctx.font = `22px ${BODY_FONT}`
  ctx.fillText(NEWSPAPER.caption, PAPER_WIDTH / 2, y)
  y += 40

  ctx.textAlign = 'left'
  ctx.font = `25px ${BODY_FONT}`
  const gap = 34
  const columnWidth = (PAPER_WIDTH - 100 - gap) / 2
  let left = y
  left = paragraph(ctx, NEWSPAPER.columns[0], 50, left, columnWidth, 31) + 12
  paragraph(ctx, NEWSPAPER.columns[2], 50, left, columnWidth, 31)
  paragraph(ctx, NEWSPAPER.columns[1], 50 + columnWidth + gap, y, columnWidth, 31)

  rule(ctx, PAPER_HEIGHT - 128, 3)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5a0a07'
  ctx.font = `28px ${BODY_FONT}`
  paragraph(ctx, NEWSPAPER.warning, PAPER_WIDTH / 2, PAPER_HEIGHT - 112, PAPER_WIDTH - 110, 36)

  // Une main ensanglantée a tenu ce journal.
  const stain = ctx.createRadialGradient(860, 1050, 0, 860, 1050, 120)
  stain.addColorStop(0, 'rgba(78,6,4,0.62)')
  stain.addColorStop(0.6, 'rgba(78,6,4,0.34)')
  stain.addColorStop(1, 'rgba(78,6,4,0)')
  ctx.fillStyle = stain
  ctx.fillRect(740, 930, 240, 240)
  ctx.restore()
}
