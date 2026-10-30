// Mise en forme du HUD style terminal.

const GLITCH_CHARS = '#%&@$!?/\\|<>*+=~^01'

/** Barre d'infection en blocs, ex. `█████░░░░░` pour 50 %. */
export function infectionBar(percent: number, cells = 10): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

/** Barre de signal sur 5, ex. `▮▮▮▯▯`. */
export function signalBar(strength: number): string {
  const s = Math.min(5, Math.max(0, Math.round(strength)))
  return '▮'.repeat(s) + '▯'.repeat(5 - s)
}

/** Remplace une part `amount` (0..1) des caractères visibles par des parasites. */
export function corrupt(text: string, amount: number, random: () => number = Math.random): string {
  if (amount <= 0) return text
  return [...text]
    .map((ch) => (ch !== ' ' && random() < amount ? GLITCH_CHARS[Math.floor(random() * GLITCH_CHARS.length)] : ch))
    .join('')
}

/** Nombre complété par des zéros, ex. `pad(42, 4)` → `0042`. */
export function pad(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, '0')
}
