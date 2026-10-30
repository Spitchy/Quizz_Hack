import { BEAT_SECONDS, INJECT_SECONDS, WAKE_SECONDS } from '../app/sequence'
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
  duck?: 'laugh'
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
