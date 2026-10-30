// Résolution adaptative : la densité de pixels descend par paliers quand les
// images tardent, et remonte prudemment quand elles sont rapides. Pur, testable.

export const DPR_MIN = 0.75
export const DPR_MAX = 1.5
export const DPR_STEP = 0.25
/** Médiane au-delà de laquelle on baisse la résolution (≈ 48 i/s). */
export const SLOW_MS = 21
/** Médiane en deçà de laquelle on peut la remonter (≈ 55 i/s : écrans 60 Hz compris). */
export const FAST_MS = 18
/** Fenêtres rapides consécutives avant de remonter d'un palier. */
const CALM_WINDOWS = 3
/** Une remontée ratée allonge l'attente avant la suivante (en fenêtres). */
const MAX_PENALTY = 32

export interface DprState {
  dpr: number
  /** Fenêtres rapides consécutives. */
  calm: number
  /** Fenêtres restantes avant d'oser remonter. */
  holdOff: number
  /** Attente imposée à la prochaine baisse ; double à chaque baisse. */
  penalty: number
}

/** Plafond : jamais plus que l'écran (sans descendre sous 1), ni plus de 1,5. */
export function maxDpr(devicePixelRatio: number): number {
  return Math.min(DPR_MAX, Math.max(1, devicePixelRatio || 1))
}

/** Plafond de cet écran. */
export const DPR_CEILING = maxDpr(typeof window === 'undefined' ? 1 : window.devicePixelRatio)

export function initialDpr(max: number): DprState {
  return { dpr: max, calm: 0, holdOff: 0, penalty: 2 }
}

/** Médiane des durées d'image (ms) : un à-coup isolé ne fait pas baisser la résolution. */
export function median(samples: readonly number[]): number {
  if (!samples.length) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Palier suivant après une fenêtre de mesure de médiane `frameMs`. */
export function adaptDpr(state: DprState, frameMs: number, max: number): DprState {
  if (frameMs > SLOW_MS && state.dpr > DPR_MIN) {
    const penalty = Math.min(MAX_PENALTY, state.penalty * 2)
    return { dpr: Math.max(DPR_MIN, state.dpr - DPR_STEP), calm: 0, holdOff: state.penalty, penalty }
  }
  const holdOff = Math.max(0, state.holdOff - 1)
  const calm = frameMs < FAST_MS ? state.calm + 1 : 0
  if (calm >= CALM_WINDOWS && holdOff === 0 && state.dpr < max) {
    return { ...state, dpr: Math.min(max, state.dpr + DPR_STEP), calm: 0, holdOff: 0 }
  }
  return { ...state, calm, holdOff }
}
