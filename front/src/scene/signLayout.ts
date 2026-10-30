import type { Question } from '../api/client'

// Mise en page du texte du panneau, indépendante du canvas : la mesure est injectée.

export type Measure = (text: string, fontSize: number) => number

export function wrapText(text: string, maxWidth: number, fontSize: number, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate, fontSize) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

export interface SignLine {
  text: string
  /** Haut de la ligne, en pixels du canvas. */
  y: number
  fontSize: number
  kind: 'question' | 'choice'
  /** Index du choix pour les lignes de type `choice`. */
  choice?: number
}

export interface ChoiceBand {
  choice: number
  top: number
  bottom: number
}

export interface SignLayout {
  lines: SignLine[]
  /** Zone verticale de chaque choix, pour le survol / clic. */
  choiceBands: ChoiceBand[]
  fontSize: number
}

export interface SignBox {
  width: number
  height: number
  padding: number
}

const MIN_FONT = 12

/** Plus grande taille de police (≤ `maxFont`) pour laquelle question + choix tiennent. */
export function layoutSign(question: Question, box: SignBox, measure: Measure, maxFont = 64): SignLayout {
  for (let size = maxFont; size > MIN_FONT; size -= 2) {
    const layout = tryLayout(question, box, size, measure)
    if (layout.bottom <= box.height - box.padding) return layout
  }
  return tryLayout(question, box, MIN_FONT, measure)
}

function tryLayout(question: Question, box: SignBox, size: number, measure: Measure): SignLayout & { bottom: number } {
  const inner = box.width - box.padding * 2
  const choiceSize = Math.round(size * 0.78)
  const lineHeight = (s: number) => s * 1.22
  const lines: SignLine[] = []
  const choiceBands: ChoiceBand[] = []
  let y = box.padding

  for (const text of wrapText(question.text, inner, size, measure)) {
    lines.push({ text, y, fontSize: size, kind: 'question' })
    y += lineHeight(size)
  }
  y += size * 0.5

  question.choices.forEach((choice, index) => {
    const top = y
    for (const text of wrapText(`${index + 1}. ${choice}`, inner, choiceSize, measure)) {
      lines.push({ text, y, fontSize: choiceSize, kind: 'choice', choice: index })
      y += lineHeight(choiceSize)
    }
    choiceBands.push({ choice: index, top, bottom: y })
    y += choiceSize * 0.3
  })

  return { lines, choiceBands, fontSize: size, bottom: y }
}

/** Choix situé à la hauteur `y` (pixels du canvas), ou `null`. */
export function choiceAt(layout: SignLayout, y: number): number | null {
  return layout.choiceBands.find((band) => y >= band.top && y < band.bottom)?.choice ?? null
}
