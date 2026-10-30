import type { DefeatStage, VictoryStage } from '../app/sequence'
import type { Phase } from '../game/types'

// Mixage, en fonctions pures : quel « moment » du jeu on vit, quel niveau pour
// chaque couche, comment le danger (`toWorldState`) pilote le drone et le cœur.
// Toute la balance se règle ici, sans toucher au graphe audio.

/** Moments sonores : chacun correspond à une balance complète (`MIXES`). */
export type Moment =
  | 'silent'
  | 'corridor'
  | 'reading'
  /** Réponse envoyée : presque plus rien, pour que le verdict frappe. */
  | 'answering'
  | 'reacting'
  | 'freeze'
  | 'approach'
  | 'beat'
  | 'knockout'
  | 'wake'
  | 'inject'
  | 'infected'
  | 'over'
  | 'release'
  | 'whiteout'
  | 'room'
  | 'door'
  | 'through'
  | 'outside'

export function momentFor(phase: Phase, defeat: DefeatStage | null, victory: VictoryStage | null): Moment {
  if (defeat) return defeat
  if (victory) return victory === 'screen' ? 'outside' : victory
  switch (phase) {
    case 'exploring':
      return 'corridor'
    case 'question':
      return 'reading'
    case 'submitting':
      return 'answering'
    case 'feedback':
      return 'reacting'
    default:
      return 'silent'
  }
}

/** Couches pilotées d'un moment à l'autre (0..1, avant `LAYER_TRIM`). */
export type Layer =
  | 'roomTone'
  | 'neon'
  | 'drone'
  | 'heartbeat'
  | 'monsters'
  | 'haze'
  | 'tape'
  | 'tinnitus'
  | 'breath'
  | 'drip'
  | 'glitchBed'
  | 'wind'
  | 'grass'
  /** Fondu vers le micro de caméra de surveillance. */
  | 'cctv'
  /** Fondu vers le signal écrasé (paliers numériques). */
  | 'crush'
  /** Profondeur des coupures numériques. */
  | 'gate'

export const LAYERS: readonly Layer[] = [
  'roomTone',
  'neon',
  'drone',
  'heartbeat',
  'monsters',
  'haze',
  'tape',
  'tinnitus',
  'breath',
  'drip',
  'glitchBed',
  'wind',
  'grass',
  'cctv',
  'crush',
  'gate',
]

/** Niveau réel d'une couche à 1 : les sons sont normalisés, c'est ici qu'on les équilibre. */
export const LAYER_TRIM: Record<Layer, number> = {
  roomTone: 0.32,
  neon: 0.12,
  drone: 1,
  heartbeat: 1,
  monsters: 1,
  haze: 0.06,
  tape: 0.05,
  tinnitus: 0.07,
  breath: 0.16,
  drip: 0.22,
  glitchBed: 0.3,
  wind: 0.5,
  grass: 0.16,
  cctv: 1,
  crush: 1,
  gate: 1,
}

/** Une consigne différée à l'intérieur d'un moment. */
export interface Automation {
  /** Secondes depuis le début du moment. */
  at: number
  target: Layer | 'muffle'
  to: number
  /** Constante de temps du fondu (s) ; pour `muffle`, durée de la montée, régulière à l'oreille. */
  fade: number
}

export interface MomentMix {
  levels: Partial<Record<Layer, number>>
  /** Constante de temps du passage à ce moment (s). */
  fade: number
  /** Coupure sèche : tout se tait d'un coup, sans fondu. */
  cut?: boolean
  /** Coupure du filtre général (Hz) : les oreilles bouchées du réveil. */
  muffle?: number
  /** Réverbération de la pièce : `corridor` (labyrinthe) ou `tiles` (carrelage). */
  room?: 'corridor' | 'tiles'
  timeline?: readonly Automation[]
}

const OPEN_EARS = 18000

export const MIXES: Record<Moment, MomentMix> = {
  silent: { levels: {}, fade: 0.25 },
  corridor: {
    levels: { roomTone: 0.5, neon: 0.8, drone: 1, heartbeat: 1, monsters: 1, haze: 1 },
    fade: 0.9,
    room: 'corridor',
  },
  reading: {
    levels: { roomTone: 0.32, neon: 0.45, drone: 0.8, heartbeat: 1, monsters: 0.75, haze: 0.8 },
    fade: 0.7,
    room: 'corridor',
  },
  answering: {
    levels: { roomTone: 0.1, neon: 0.1, drone: 0.2, heartbeat: 0.5, monsters: 0.15 },
    fade: 0.09,
    room: 'corridor',
  },
  reacting: {
    levels: { roomTone: 0.4, neon: 0.6, drone: 1, heartbeat: 1, monsters: 1, haze: 1 },
    fade: 0.5,
    room: 'corridor',
  },
  // Les néons meurent : il ne reste que le cœur, dans un quasi-silence.
  freeze: { levels: { roomTone: 0.06, heartbeat: 1 }, fade: 0.3, room: 'corridor' },
  // Coupe sur la caméra : tout passe d'un coup par son mauvais micro.
  approach: {
    levels: { roomTone: 0.9, neon: 1, monsters: 1.3, tape: 1, cctv: 1 },
    fade: 0.015,
    room: 'corridor',
  },
  beat: {
    levels: { roomTone: 0.9, neon: 1, monsters: 0.9, tape: 1, cctv: 1 },
    fade: 0.03,
    room: 'corridor',
  },
  knockout: { levels: {}, fade: 0, cut: true },
  // Sifflement étouffé qui s'éclaircit, puis la perfusion et le cuir ; le souffle
  // se suspend juste avant la porte.
  wake: {
    levels: { roomTone: 0.3, neon: 0.5, tinnitus: 1, drip: 0.8 },
    fade: 0.02,
    muffle: 380,
    room: 'tiles',
    timeline: [
      { at: 0, target: 'muffle', to: OPEN_EARS, fade: 5.2 },
      { at: 0.1, target: 'tinnitus', to: 0, fade: 1.6 },
      { at: 1.6, target: 'breath', to: 0.9, fade: 0.7 },
      { at: 4.9, target: 'breath', to: 0.12, fade: 0.2 },
      { at: 4.9, target: 'drip', to: 0.25, fade: 0.25 },
    ],
  },
  inject: {
    levels: { roomTone: 0.3, neon: 0.5, breath: 0.15, drip: 0.5 },
    fade: 0.1,
    room: 'tiles',
    timeline: [
      { at: 1.2, target: 'breath', to: 0.8, fade: 0.5 },
      { at: 3.6, target: 'breath', to: 1, fade: 0.2 },
    ],
  },
  // Le son se disloque : paliers numériques, coupures, parasites.
  infected: {
    levels: { roomTone: 0.3, neon: 0.6, drone: 0.7, glitchBed: 0.8, crush: 0.75, gate: 0.9, drip: 0.25 },
    fade: 0.06,
    room: 'tiles',
  },
  over: {
    levels: { roomTone: 0.25, drone: 0.4, glitchBed: 0.22, crush: 0.3, gate: 0.45 },
    fade: 0.9,
    room: 'tiles',
  },
  release: { levels: { roomTone: 0.3, neon: 1, monsters: 0.3 }, fade: 0.5, room: 'corridor' },
  // Tout se coupe ; le silence tient le temps de l'éblouissement.
  whiteout: { levels: {}, fade: 0, cut: true },
  room: {
    levels: {},
    fade: 0.4,
    room: 'tiles',
    timeline: [{ at: 1.1, target: 'wind', to: 0.08, fade: 1.6 }],
  },
  door: { levels: { wind: 0.25 }, fade: 0.6, room: 'tiles' },
  through: { levels: { wind: 0.6, grass: 0.3 }, fade: 0.6 },
  outside: { levels: { wind: 0.85, grass: 0.9 }, fade: 1.2 },
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Niveau du drone : à peine là au début, écrasant à la dernière erreur. */
export function droneGain(danger: number): number {
  return 0.012 + 0.16 * clamp01(danger) ** 1.3
}

/** Le drone s'ouvre en aigus avec le danger. */
export function droneCutoff(danger: number): number {
  return 110 + 780 * clamp01(danger) ** 1.5
}

/** Battements du drone : les voix se désaccordent avec le danger (cents). */
export function droneDetune(danger: number): number {
  return 3 + 26 * clamp01(danger)
}

/** Cœur inaudible tant que tout va bien, puis de plus en plus présent. */
export function heartbeatGain(danger: number): number {
  const d = clamp01(danger)
  return d < 0.15 ? 0 : 0.2 + 0.62 * ((d - 0.15) / 0.85)
}

export function heartbeatBpm(danger: number): number {
  return 62 + 76 * clamp01(danger)
}

/** Le bruit de fond monte passé le premier tiers de l'infection. */
export function hazeGain(danger: number): number {
  const d = clamp01(danger)
  return d < 0.3 ? 0 : (d - 0.3) / 0.7
}

/** Volume de l'interface (0..1) vers un gain : l'oreille entend en logarithme. */
export function volumeGain(volume: number, muted: boolean): number {
  return muted ? 0 : clamp01(volume) ** 2
}

/** Présence d'une lampe (0..1, voire plus en surtension) vers le gain de son bourdonnement. */
export function neonBuzzGain(intensity: number): number {
  if (intensity <= 0) return 0
  // Sous le niveau normal, le ballast décroche : le son coupe plus vite que la lumière.
  return intensity >= 0.9 ? Math.min(1.4, intensity) : intensity * intensity
}

/** Baisse temporaire des autres bus pour laisser passer un son fort. */
export interface Duck {
  ambience: number
  voices: number
  effects: number
  hold: number
  release: number
}

export const DUCKS = {
  stinger: { ambience: 0.3, voices: 0.45, effects: 1, hold: 0.55, release: 1.1 },
  release: { ambience: 0.55, voices: 0.5, effects: 1, hold: 0.4, release: 0.9 },
  hit: { ambience: 0.6, voices: 0.7, effects: 1, hold: 0.06, release: 0.35 },
  laugh: { ambience: 0.5, voices: 1, effects: 0.8, hold: 1.2, release: 1 },
} as const satisfies Record<string, Duck>
