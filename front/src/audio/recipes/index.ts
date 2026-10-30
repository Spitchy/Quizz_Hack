import { createRandom, hashSeed, type Random } from '../../maze/random'
import type { Samples } from '../dsp'
import * as ambience from './ambience'
import * as events from './events'
import * as monsters from './monsters'

// Le catalogue des sons générés en code. Chaque entrée : sa fréquence
// d'échantillonnage (au plus juste, pour la mémoire), le nombre de variantes,
// sa recette. Le rendu est déterministe : le même son d'une partie à l'autre.

interface Recipe {
  rate: number
  variants: number
  render: (rate: number, random: Random, variant: number) => Samples
}

const HI = 32000
const MID = 24000
const LOW = 16000

const recipe = (rate: number, render: Recipe['render'], variants = 1): Recipe => ({ rate, render, variants })

/** Dans l'ordre de priorité : ce qui sert en premier est calculé en premier. */
export const RECIPES = {
  'room-tone': recipe(LOW, ambience.roomTone),
  'neon-buzz': recipe(MID, ambience.neonBuzz),
  'step-carpet': recipe(MID, events.stepCarpet, 4),
  heartbeat: recipe(LOW, events.heartbeat),
  'bed-crt': recipe(HI, monsters.bedCrt),
  'bed-mannequin': recipe(HI, monsters.bedMannequin),
  'bed-cluster': recipe(MID, monsters.bedCluster),
  'bed-crawler': recipe(HI, monsters.bedCrawler),
  'bed-child': recipe(MID, monsters.bedChild),
  'bed-tall': recipe(LOW, monsters.bedTall),
  stinger: recipe(HI, events.stinger),
  release: recipe(HI, events.release),
  'anger-crt': recipe(HI, monsters.angerCrt),
  'anger-mannequin': recipe(HI, monsters.angerMannequin),
  'anger-cluster': recipe(MID, monsters.angerCluster),
  'anger-crawler': recipe(HI, monsters.angerCrawler),
  'anger-child': recipe(HI, monsters.angerChild),
  'anger-tall': recipe(MID, monsters.angerTall),
  'power-down': recipe(MID, events.powerDown),
  'tape-hiss': recipe(HI, ambience.tapeHiss),
  'step-hard': recipe(HI, events.stepHard, 3),
  'step-heavy': recipe(LOW, monsters.stepHeavy, 2),
  'step-plastic': recipe(MID, monsters.stepPlastic, 3),
  'step-wet': recipe(MID, monsters.stepWet, 3),
  'step-skitter': recipe(HI, monsters.stepSkitter, 2),
  'step-small': recipe(MID, monsters.stepSmall, 2),
  'hit-flesh': recipe(HI, events.hitFlesh, 4),
  'hit-bone': recipe(HI, events.hitBone, 3),
  splat: recipe(MID, events.splat, 3),
  'body-fall': recipe(MID, events.bodyFall),
  'mic-crackle': recipe(HI, events.micCrackle, 3),
  tinnitus: recipe(HI, ambience.tinnitus),
  breath: recipe(MID, ambience.breath),
  drip: recipe(MID, ambience.drip),
  leather: recipe(MID, events.leather, 4),
  'door-latch': recipe(HI, events.doorLatch),
  'door-creak': recipe(HI, events.doorCreak),
  needle: recipe(HI, events.needle),
  plunger: recipe(HI, events.plunger),
  gasp: recipe(MID, events.gasp),
  chuckle: recipe(MID, events.chuckle),
  laugh: recipe(MID, events.laugh),
  'glitch-bed': recipe(HI, ambience.glitchBed),
  'gate-curve': recipe(8000, ambience.gateCurve),
  glitch: recipe(HI, events.glitch, 4),
  surge: recipe(HI, events.surge),
  'door-white': recipe(MID, events.doorWhite),
  wind: recipe(MID, ambience.wind),
  grass: recipe(HI, ambience.grass),
} satisfies Record<string, Recipe>

export type SoundName = keyof typeof RECIPES

export const SOUND_NAMES = Object.keys(RECIPES) as SoundName[]

export interface RenderedSound {
  name: SoundName
  variant: number
  rate: number
  samples: Samples
}

/** Calcule une variante d'un son. */
export function renderSound(name: SoundName, variant: number): RenderedSound {
  const { rate, render } = RECIPES[name]
  return { name, variant, rate, samples: render(rate, createRandom(hashSeed(`${name}:${variant}`)), variant) }
}

/** Tous les sons à calculer, dans l'ordre de priorité. */
export function renderQueue(): { name: SoundName; variant: number }[] {
  return SOUND_NAMES.flatMap((name) => Array.from({ length: RECIPES[name].variants }, (_, variant) => ({ name, variant })))
}
