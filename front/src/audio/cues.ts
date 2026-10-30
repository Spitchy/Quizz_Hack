import { BEAT_SECONDS, INJECT_SECONDS, WAKE_SECONDS } from '../app/sequence'
import { GLIMPSE, JUMP_AT, KICK_IMPACT, PICK_GRAB, TORCH_ON } from '../scene/scareMotion'
import { ARM_TARGET, DOOR, INJECT } from '../scene/wakeStage'
import type { Moment } from './mix'
import type { SoundName } from './recipes'

// Les sons datés de la mise en scène, relatifs au début de chaque moment.
// Chaque date vient de la scène (`INJECT`) : changer le jeu de scène recale le son.

export type CuePoint = readonly [number, number, number]

export interface Cue {
  /** Secondes depuis le début du moment. */
  at: number
  sound: SoundName
  gain?: number
  rate?: number
  /** Position dans le monde ; sans elle, le son est « dans la tête ». */
  where?: CuePoint
  duck?: 'laugh' | 'stinger' | 'hit'
  /** Passe par le bulletin (plein écran, puis haut-parleur du téléphone). */
  tv?: boolean
  /** Dans la tête, mais résonne dans le couloir. */
  wet?: boolean
}

const DOOR_POINT: CuePoint = [DOOR.hingeX + DOOR.width / 2, 1.2, DOOR.z]
const ARM_POINT: CuePoint = [ARM_TARGET.x, ARM_TARGET.y, ARM_TARGET.z]
/** Sa tête quand il recule en riant (voir `Doctor`). */
const DOCTOR_POINT: CuePoint = [1.1, 1.8, 0.5]
/** Sangles : à la droite et à la gauche du corps, tout près des oreilles. */
const STRAP_RIGHT: CuePoint = [0.32, 0.8, 1.45]
const STRAP_LEFT: CuePoint = [-0.32, 0.8, 1.45]

export const CUES: Partial<Record<Moment, readonly Cue[]>> = {
  freeze: [
    { at: 0, sound: 'power-down', gain: 0.75 },
    { at: 0.4, sound: 'gasp', gain: 0.32 },
  ],
  // Il reprend ses esprits : il tire sur ses sangles (mêmes dates que `WakeCamera`).
  wake: [
    { at: 2.0, sound: 'leather', gain: 0.45, where: STRAP_LEFT },
    { at: 3.2, sound: 'leather', gain: 0.55, where: STRAP_RIGHT },
    { at: 4.2, sound: 'leather', gain: 0.9, where: STRAP_RIGHT },
    { at: 4.5, sound: 'leather', gain: 1, where: STRAP_LEFT },
    { at: 4.72, sound: 'leather', gain: 0.8, where: STRAP_RIGHT },
  ],
  inject: [
    { at: 0, sound: 'door-latch', gain: 0.8, where: DOOR_POINT },
    // Ralenti : c'est une lourde porte métallique, pas une porte d'auberge.
    { at: 0.06, sound: 'door-creak', gain: 0.9, rate: 0.82, where: DOOR_POINT },
    { at: INJECT.arrive - 0.1, sound: 'leather', gain: 0.9, where: STRAP_RIGHT },
    { at: INJECT.stab - 0.3, sound: 'gasp', gain: 0.55 },
    { at: INJECT.stab - 0.03, sound: 'needle', gain: 1, where: ARM_POINT },
    { at: INJECT.stab, sound: 'leather', gain: 1, where: STRAP_RIGHT },
    { at: INJECT.stab + 0.06, sound: 'plunger', gain: 0.75, where: ARM_POINT },
    { at: INJECT.lookBack + 0.15, sound: 'chuckle', gain: 0.8, where: DOCTOR_POINT, duck: 'laugh' },
  ],
  infected: [
    { at: 0, sound: 'laugh', gain: 1, where: DOCTOR_POINT, duck: 'laugh' },
    { at: 0.05, sound: 'glitch', gain: 0.55 },
    { at: 0.5, sound: 'glitch', gain: 0.45 },
    { at: 0.92, sound: 'glitch', gain: 0.6 },
    { at: 1.4, sound: 'glitch', gain: 0.5 },
    { at: 1.75, sound: 'glitch', gain: 0.65 },
    { at: 2.2, sound: 'glitch', gain: 0.6 },
  ],
  release: [{ at: 0, sound: 'surge', gain: 0.8 }],
  door: [{ at: 0, sound: 'door-white', gain: 0.9 }],

  // --- Intro : mêmes dates que `introMotion`. ---
  introNews: [
    { at: 0, sound: 'news-sting', gain: 0.5 },
    { at: 0, sound: 'news-broadcast', tv: true },
  ],
  introPocket: [
    { at: 0, sound: 'phone-lock', gain: 0.8 },
    { at: 0.55, sound: 'leather', gain: 0.35 },
    { at: 1.05, sound: 'leather', gain: 0.25, rate: 0.85 },
  ],
  introVan: [{ at: 2.45, sound: 'tire-screech', gain: 0.5 }],
  introDoor: [
    { at: 0.3, sound: 'van-door', gain: 0.85 },
    { at: 0.5, sound: 'gasp', gain: 0.6 },
    { at: 1.25, sound: 'step-hard', gain: 0.5, rate: 0.85 },
    { at: 1.55, sound: 'step-hard', gain: 0.55, rate: 0.8 },
  ],
  introRun: [0.05, 0.36, 0.68, 0.98, 1.3, 1.6, 1.92, 2.22, 2.54, 2.84].map((at, i) => ({
    at,
    sound: 'step-hard' as const,
    gain: 0.62,
    rate: i % 2 ? 0.86 : 0.92,
  })),
  introSwing: [
    { at: 0, sound: 'gasp', gain: 0.8 },
    { at: 0.22, sound: 'bat-swing', gain: 1 },
  ],
  introBlack: [
    { at: 0, sound: 'hit-bone', gain: 1 },
    { at: 0, sound: 'hit-flesh', gain: 1, rate: 0.75 },
    { at: 0.62, sound: 'body-fall', gain: 0.55 },
    { at: 1.65, sound: 'van-door', gain: 0.28, rate: 1.25 },
  ],

  // --- Le dossier refermé : mêmes dates que `scareMotion`. ---
  scareDim: [
    { at: 0.2, sound: 'power-down', gain: 0.45 },
    // Une touche de piano, très loin, puis une autre : quelque chose ne va pas.
    { at: 3.4, sound: 'piano-cluster', gain: 0.16, rate: 1.5, wet: true },
    { at: 6.1, sound: 'piano-cluster', gain: 0.26, rate: 1.26, wet: true },
  ],
  scareDark: [
    { at: 0, sound: 'piano-cluster', gain: 0.62, wet: true },
    { at: 0.6, sound: 'gasp', gain: 0.32 },
  ],
  scareTorch: [
    { at: TORCH_ON - 0.04, sound: 'phone-lock', gain: 0.9, rate: 0.55 },
    // Les cordes montent pendant qu'il regarde, et se coupent net.
    { at: 0.6, sound: 'violin-tension', gain: 0.62, wet: true },
    { at: 2.5, sound: 'piano-cluster', gain: 0.24, rate: 1.9, wet: true },
    { at: GLIMPSE - 0.1, sound: 'piano-cluster', gain: 0.34, rate: 1.42, wet: true },
  ],
  scareJump: [
    { at: JUMP_AT, sound: 'violin-screech', gain: 1, wet: true, duck: 'stinger' },
    { at: JUMP_AT, sound: 'piano-cluster', gain: 1, rate: 0.72, wet: true },
    { at: JUMP_AT, sound: 'stinger', gain: 0.9 },
    { at: JUMP_AT + 0.08, sound: 'gasp', gain: 0.9 },
    { at: JUMP_AT + 0.16, sound: 'body-fall', gain: 0.7, rate: 1.2 },
  ],
  scareKick: [
    { at: 0, sound: 'bat-swing', gain: 0.8, rate: 1.3 },
    { at: KICK_IMPACT, sound: 'hit-flesh', gain: 1, rate: 0.72, duck: 'hit' },
    { at: KICK_IMPACT, sound: 'hit-bone', gain: 0.8 },
    { at: KICK_IMPACT + 0.1, sound: 'piano-cluster', gain: 0.5, rate: 0.6, wet: true },
    { at: KICK_IMPACT + 0.4, sound: 'torch-clatter', gain: 0.85, wet: true },
    { at: KICK_IMPACT + 0.55, sound: 'body-fall', gain: 0.5, wet: true },
  ],
  // La lampe lui échappe : elle tombe, rebondit, roule sur la moquette.
  scareDrop: [
    { at: 0.3, sound: 'piano-cluster', gain: 0.2, rate: 1.7, wet: true },
    // Il rit quelque part dans le noir, sans se presser.
    { at: 1.1, sound: 'chuckle', gain: 0.32, rate: 0.82, wet: true },
  ],
  scarePick: [
    { at: 0.15, sound: 'leather', gain: 0.4, rate: 0.85 },
    { at: PICK_GRAB, sound: 'torch-clatter', gain: 0.22, rate: 1.5 },
  ],
  scareRestore: [{ at: 0.1, sound: 'breaker', gain: 0.5, rate: 0.9 }],
}

/** Durée de chaque étape de la mise en scène : aucun son ne doit la déborder par erreur. */
export const MOMENT_SECONDS: Partial<Record<Moment, number>> = {
  beat: BEAT_SECONDS,
  wake: WAKE_SECONDS,
  inject: INJECT_SECONDS,
}

/** À quels coups (index) le corps cède : les genoux à 30 %, le corps à 60 % (voir `collapseAt`). */
export function collapseSounds(hit: number, total: number): { knees: boolean; fall: boolean } {
  const crossed = (ratio: number) => hit / total < ratio && (hit + 1) / total >= ratio
  return { knees: crossed(0.3), fall: crossed(0.6) }
}

/** Le coup qui casse un os : un sur trois, et les derniers, à terre. */
export const isBoneHit = (hit: number, total: number) => hit % 3 === 2 || hit >= total - 2
