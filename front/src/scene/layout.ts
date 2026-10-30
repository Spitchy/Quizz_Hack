// Dimensions et palette communes à la scène. La disposition du labyrinthe
// elle-même vient de `src/maze/generate.ts`.

export const CORRIDOR_HEIGHT = 2.7
export const EYE_HEIGHT = 1.6

export const PALETTE = {
  void: '#0a0a0c',
  wall: '#c9b458',
  wallDim: '#8a7a3a',
  carpet: '#5b5130',
  ceiling: '#b7ab7a',
  halo: '#fff4d6',
  danger: '#ff2d2d',
  text: '#e8e4d8',
  entity: '#05060a',
  paper: '#d8cfa8',
  ink: '#1a1712',
} as const
