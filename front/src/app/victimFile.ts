import { createRandom, hashSeed } from '../maze/random'

// Le dossier oublié à côté de la radio : les sujets du médecin, une fiche par
// page. Dessiné sur un canvas : la couverture sert aussi de texture sur la table.
// Aucun import de Three.js.

export const FILE_WIDTH = 1000
export const FILE_HEIGHT = 1360

const INK = '#1a1610'
const RED = '#8f1414'
const TITLE_FONT = '"Pirata One", serif'
const TYPE_FONT = '"Special Elite", "Courier Prime", monospace'

export interface VictimSheet {
  name: string
  number: string
  role: string
  /** Ce qu'il n'a pas su expliquer. */
  failed: string
  note: string
  status: string
}

export const VICTIMS: readonly VictimSheet[] = [
  {
    name: 'MESSAOUDI ISHAK',
    number: '001',
    role: 'Développeur front-end',
    failed: "Le rendu d'un composant. A répondu : « ça marche sur ma machine ».",
    note: "A pleuré quand on lui a retiré son assistant. N'a plus reconnu son propre code.",
    status: 'INOCULÉ',
  },
  {
    name: 'BOUCLON MATHIAS',
    number: '002',
    role: 'Développeur back-end',
    failed: "Une fermeture (closure). Une transaction. Puis son propre nom d'utilisateur.",
    note: 'A demandé à recopier la réponse. Commence à ne plus répondre à son nom.',
    status: 'INOCULÉ',
  },
  {
    name: 'RÉMI',
    number: '003',
    role: 'Nom de famille oublié. Par lui aussi.',
    failed: 'Sortir de Vim. Il y est encore.',
    note: 'Il parle en commentaires générés. Les yeux changent de couleur la nuit.',
    status: 'INOCULÉ',
  },
  {
    name: 'INCONNU',
    number: '004',
    role: 'Badge illisible',
    failed: "La différence entre une pile et un tas. N'a pas tenu trois questions.",
    note: 'Marche seul dans les couloirs. Tient un panneau. Pose des questions.',
    status: 'PERDU',
  },
  {
    name: 'INCONNU',
    number: '005',
    role: 'Aucun effet personnel',
    failed: "Ce qu'est un pointeur. A désigné la porte.",
    note: 'Sa forme ne tient plus. Ne pas ouvrir la pièce B-17.',
    status: 'PERDU',
  },
  {
    name: 'INCONNU',
    number: '006',
    role: 'Fiche arrachée',
    failed: '',
    note: "Il ne reste de lui qu'une chose qui rampe.",
    status: 'PERDU',
  },
]

export type FilePage = { kind: 'cover' } | { kind: 'victim'; sheet: VictimSheet } | { kind: 'next'; name: string }

/** Les pages du dossier. La dernière est préparée pour le joueur. */
export function filePages(pseudo: string | null | undefined): FilePage[] {
  const name = pseudo?.trim().toUpperCase() || 'VOUS'
  return [{ kind: 'cover' }, ...VICTIMS.map((sheet) => ({ kind: 'victim' as const, sheet })), { kind: 'next', name }]
}

/** Tourner la page : on s'arrête à la couverture et à la dernière fiche. */
export function turnPage(page: number, count: number, direction: -1 | 1): number {
  return Math.min(count - 1, Math.max(0, page + direction))
}

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

function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): number {
  for (const line of wrap(ctx, text, width)) {
    ctx.fillText(line, x, y)
    y += height
  }
  return y
}

/** Papier jauni, taché, qui a pris l'humidité. */
function drawPaper(ctx: CanvasRenderingContext2D, seed: string, base: string) {
  const random = createRandom(hashSeed(seed))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, FILE_WIDTH, FILE_HEIGHT)
  for (let i = 0; i < 26; i++) {
    const x = random() * FILE_WIDTH
    const y = random() * FILE_HEIGHT
    const r = 50 + random() * 170
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(84,62,24,${0.05 + random() * 0.09})`)
    g.addColorStop(1, 'rgba(84,62,24,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // Bords sombres et plis.
  const edge = ctx.createRadialGradient(FILE_WIDTH / 2, FILE_HEIGHT / 2, FILE_HEIGHT * 0.35, FILE_WIDTH / 2, FILE_HEIGHT / 2, FILE_HEIGHT * 0.78)
  edge.addColorStop(0, 'rgba(40,26,10,0)')
  edge.addColorStop(1, 'rgba(40,26,10,0.42)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, FILE_WIDTH, FILE_HEIGHT)
  ctx.fillStyle = 'rgba(50,34,12,0.1)'
  ctx.fillRect(0, FILE_HEIGHT * 0.5, FILE_WIDTH, 2)
  return random
}

/** Tampon de travers, encrage inégal. */
function stamp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, angle: number, color = RED) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.font = `${size}px ${TYPE_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + size * 0.8
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = size * 0.09
  ctx.globalAlpha = 0.78
  ctx.strokeRect(-w / 2, -size * 0.78, w, size * 1.56)
  ctx.fillText(text, 0, size * 0.04)
  ctx.restore()
}

function bloodSmear(ctx: CanvasRenderingContext2D, random: () => number, x: number, y: number, amount: number) {
  ctx.fillStyle = 'rgba(92,10,10,0.72)'
  for (let i = 0; i < amount; i++) {
    const a = random() * Math.PI * 2
    const d = random() ** 2 * 60
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + random() * 11, 2 + random() * 8, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Photo d'identité agrafée : une silhouette floue. La fiche de `gone` n'a plus de visage. */
function drawIdPhoto(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number, faceless: boolean) {
  const random = createRandom(hashSeed(seed))
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(-0.025 + random() * 0.05)
  ctx.translate(-w / 2, -h / 2)
  ctx.fillStyle = '#e4dcc6'
  ctx.fillRect(-10, -10, w + 20, h + 34)
  const wall = ctx.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, '#6d6b62')
  wall.addColorStop(1, '#2e2c28')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  const cx = w / 2 + (random() - 0.5) * 12
  ctx.filter = 'blur(2px)'
  ctx.fillStyle = '#1b1a18'
  ctx.beginPath()
  ctx.ellipse(cx, h * 1.06, w * 0.46, h * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = faceless ? '#16120f' : '#8c7f6f'
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.42, w * (0.19 + random() * 0.03), h * (0.24 + random() * 0.03), 0, 0, Math.PI * 2)
  ctx.fill()
  if (!faceless) {
    // Des yeux noirs, déjà trop grands.
    ctx.fillStyle = '#080706'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * w * 0.08, h * 0.39, w * 0.042, h * 0.036, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillRect(cx - w * 0.06, h * 0.53, w * 0.12, 3)
  }
  ctx.filter = 'none'
  ctx.restore()
  // Agrafe.
  ctx.fillStyle = '#6f6f6c'
  ctx.fillRect(w * 0.42, -14, w * 0.16, 4)
  ctx.restore()
}

function drawVictim(ctx: CanvasRenderingContext2D, sheet: VictimSheet) {
  const random = drawPaper(ctx, `fiche-${sheet.number}`, '#d8ccac')
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = INK

  ctx.font = `34px ${TYPE_FONT}`
  ctx.fillText('PROTOCOLE I.A.  ·  FICHE DE SUJET', 70, 92)
  ctx.textAlign = 'right'
  ctx.fillText(`N° ${sheet.number}`, FILE_WIDTH - 70, 92)
  ctx.textAlign = 'left'
  ctx.fillRect(70, 110, FILE_WIDTH - 140, 3)

  const faceless = sheet.status === 'PERDU'
  drawIdPhoto(ctx, sheet.number, 70, 150, 300, 380, faceless)

  const left = 420
  const labels: [string, string][] = [
    ['NOM', sheet.name],
    ['FONCTION', sheet.role],
  ]
  let y = 180
  for (const [label, value] of labels) {
    ctx.font = `26px ${TYPE_FONT}`
    ctx.fillStyle = '#5b5138'
    ctx.fillText(label, left, y)
    y += 46
    ctx.font = label === 'NOM' ? `52px ${TYPE_FONT}` : `33px ${TYPE_FONT}`
    ctx.fillStyle = INK
    y = paragraph(ctx, value, left, y, FILE_WIDTH - left - 60, label === 'NOM' ? 58 : 42) + 30
  }

  ctx.fillRect(70, 600, FILE_WIDTH - 140, 2)
  y = 660
  ctx.font = `28px ${TYPE_FONT}`
  ctx.fillStyle = '#5b5138'
  ctx.fillText("A ÉCHOUÉ SUR", 70, y)
  y += 52
  ctx.font = `36px ${TYPE_FONT}`
  ctx.fillStyle = INK
  if (sheet.failed) {
    y = paragraph(ctx, sheet.failed, 70, y, FILE_WIDTH - 140, 50) + 38
  } else {
    // Le bas de la page manque : déchirée.
    ctx.fillStyle = 'rgba(26,22,16,0.92)'
    ctx.fillRect(70, y - 34, 610, 40)
    y += 66
  }
  ctx.font = `28px ${TYPE_FONT}`
  ctx.fillStyle = '#5b5138'
  ctx.fillText('OBSERVATIONS', 70, y)
  y += 52
  ctx.font = `34px ${TYPE_FONT}`
  ctx.fillStyle = INK
  paragraph(ctx, sheet.note, 70, y, FILE_WIDTH - 140, 48)

  stamp(ctx, sheet.status, 690, 1160, 84, -0.14)
  ctx.font = `26px ${TYPE_FONT}`
  ctx.fillStyle = INK
  ctx.fillText('Le médecin,', 70, 1240)
  ctx.fillText('« Ils ne savent plus rien. Je leur rends service. »', 70, 1276)
  bloodSmear(ctx, random, 60 + random() * 880, 980 + random() * 300, 14 + Math.floor(random() * 26))
}

/** Dernière page : une fiche déjà remplie à son nom. */
function drawNext(ctx: CanvasRenderingContext2D, name: string) {
  const random = drawPaper(ctx, 'fiche-suivante', '#d3c6a4')
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = `34px ${TYPE_FONT}`
  ctx.fillText('PROTOCOLE I.A.  ·  FICHE DE SUJET', 70, 92)
  ctx.textAlign = 'right'
  ctx.fillText('N° 007', FILE_WIDTH - 70, 92)
  ctx.textAlign = 'left'
  ctx.fillRect(70, 110, FILE_WIDTH - 140, 3)
  ctx.font = `28px ${TYPE_FONT}`
  ctx.fillStyle = '#5b5138'
  ctx.fillText('PROCHAIN SUJET', 70, 300)
  ctx.font = `${name.length > 14 ? 62 : 92}px ${TYPE_FONT}`
  ctx.fillStyle = INK
  paragraph(ctx, name, 70, 410, FILE_WIDTH - 140, 100)
  ctx.font = `34px ${TYPE_FONT}`
  paragraph(ctx, 'Enlevé sous la pluie, sur une simple coupure de courant, comme les autres.', 70, 620, FILE_WIDTH - 140, 50)
  paragraph(ctx, "Test en cours. S'il échoue : injection immédiate.", 70, 760, FILE_WIDTH - 140, 50)
  ctx.font = `62px ${TITLE_FONT}`
  ctx.fillStyle = RED
  ctx.textAlign = 'center'
  paragraph(ctx, 'NE TE RETOURNE PAS.', FILE_WIDTH / 2, 1040, FILE_WIDTH - 120, 74)
  bloodSmear(ctx, random, 780, 1180, 44)
  bloodSmear(ctx, random, 170, 1250, 22)
  ctx.textAlign = 'left'
}

function drawCover(ctx: CanvasRenderingContext2D) {
  const random = drawPaper(ctx, 'couverture', '#b39a68')
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = `38px ${TYPE_FONT}`
  ctx.fillText('SERVICE DES ÉVALUATIONS', FILE_WIDTH / 2, 170)
  ctx.fillRect(170, 196, FILE_WIDTH - 340, 3)
  ctx.font = `124px ${TITLE_FONT}`
  ctx.fillText('SUJETS', FILE_WIDTH / 2, 430)
  ctx.font = `44px ${TYPE_FONT}`
  ctx.fillText('Développeurs. Niveau 0.', FILE_WIDTH / 2, 520)
  ctx.font = `34px ${TYPE_FONT}`
  ctx.fillText('Six fiches. Une en attente.', FILE_WIDTH / 2, 580)
  stamp(ctx, 'CONFIDENTIEL', FILE_WIDTH / 2, 800, 82, -0.09)
  ctx.font = `30px ${TYPE_FONT}`
  ctx.fillStyle = INK
  ctx.fillText('Ne pas laisser sans surveillance.', FILE_WIDTH / 2, 1150)
  bloodSmear(ctx, random, 840, 1240, 30)
  ctx.textAlign = 'left'
}

/** Dessine une page sur un canvas de `FILE_WIDTH` × `FILE_HEIGHT`, mis à l'échelle. */
export function drawFilePage(ctx: CanvasRenderingContext2D, page: FilePage, scale = 1): void {
  ctx.save()
  ctx.scale(scale, scale)
  if (page.kind === 'cover') drawCover(ctx)
  else if (page.kind === 'victim') drawVictim(ctx, page.sheet)
  else drawNext(ctx, page.name)
  ctx.restore()
}
