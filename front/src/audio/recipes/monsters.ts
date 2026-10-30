import type { Random } from '../../maze/random'
import {
  addAt,
  alloc,
  bell,
  Biquad,
  brownNoise,
  decay,
  drift,
  fadeEdges,
  hitEnv,
  loopable,
  normalize,
  Resonator,
  renderVoice,
  softClip,
  TAU,
  type Samples,
} from '../dsp'

// Une signature par monstre : une présence en boucle, un cri, un pas.

// --- Briques ------------------------------------------------------------------

/** Frottement « colle-glisse » : des impulsions qui excitent une matière résonnante. */
function stickSlip(
  seconds: number,
  rate: number,
  random: Random,
  modes: readonly (readonly [number, number, number])[],
  pulsesPerSecond: (k: number) => number,
  level: (k: number) => number,
): Samples {
  const out = alloc(seconds, rate)
  const bank = modes.map(([f, bw]) => new Resonator(f, bw, rate))
  let next = 0
  for (let i = 0; i < out.length; i++) {
    const k = i / out.length
    let pulse = 0
    if (i >= next) {
      pulse = (0.5 + random() * 0.5) * level(k)
      next = i + Math.round((rate / Math.max(1, pulsesPerSecond(k))) * (0.65 + random() * 0.7))
    }
    let sum = 0
    bank.forEach((mode, m) => {
      sum += mode.tick(pulse) * modes[m][2]
    })
    out[i] = sum
  }
  return out
}

/** Une bulle : sinus qui remonte très vite et meurt aussitôt (le son des liquides). */
function bubble(rate: number, from: number, to: number, length: number): Samples {
  const out = alloc(length, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const k = i / out.length
    phase += (from + (to - from) * k) / rate
    out[i] = Math.sin(TAU * phase) * bell(k * 0.5 + 0.18) * (1 - k)
  }
  return out
}

const PLASTIC = [
  [880, 90, 1],
  [2260, 150, 0.7],
  [4150, 240, 0.35],
] as const

const CHITIN = [
  [1250, 160, 0.6],
  [3300, 320, 1],
  [6100, 500, 0.5],
] as const

// --- L'Employé (CrtSuit) : neige cathodique ------------------------------------

export function bedCrt(rate: number, random: Random): Samples {
  const seconds = 6
  const overlap = 0.3
  const out = alloc(seconds + overlap, rate)
  const band = new Biquad('bandpass', 3800, 0.6, rate)
  const low = new Biquad('bandpass', 700, 1, rate)
  let level = 0.6
  let until = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    // La neige saute de niveau par à-coups, comme un mauvais signal.
    if (i >= until) {
      level = 0.25 + random() ** 2 * 0.95
      until = i + Math.round((0.04 + random() * 0.32) * rate)
    }
    const white = random() * 2 - 1
    const tick = random() < 0.0008 ? (random() * 2 - 1) * 3 : 0
    const hum = Math.sin(TAU * 50 * t) * 0.1 + Math.sin(TAU * 150 * t) * 0.05
    out[i] = band.tick(white) * level * 1.1 + low.tick(white) * level * 0.25 + hum + Math.sin(TAU * 15625 * t) * 0.012 + tick
  }
  return normalize(loopable(out, overlap, rate), 0.8)
}

export function angerCrt(rate: number, random: Random): Samples {
  const seconds = 1.1
  const out = alloc(seconds, rate)
  const band = new Biquad('bandpass', 2600, 0.7, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (900 + 2300 * Math.min(1, t * 2.4)) / rate
    const chop = Math.sin(TAU * 31 * t) > -0.2 ? 1 : 0.15
    const whine = Math.sign(Math.sin(TAU * phase)) * 0.3
    out[i] = softClip((band.tick(random() * 2 - 1) * 2.2 + whine) * chop * decay(t, 0.42), 1.8)
  }
  return normalize(fadeEdges(out, rate))
}

// --- Le Mannequin : plastique qui grince ---------------------------------------

function creak(rate: number, random: Random, seconds: number): Samples {
  return stickSlip(seconds, rate, random, PLASTIC, (k) => 16 + 70 * bell(k), (k) => bell(k) ** 0.7)
}

export function bedMannequin(rate: number, random: Random): Samples {
  const out = alloc(9, rate)
  // Rares : on l'entend bouger quand on ne le regarde pas.
  addAt(out, creak(rate, random, 0.9), 0.8, rate, 0.9)
  addAt(out, creak(rate, random, 0.45), 2.1, rate, 0.45)
  addAt(out, creak(rate, random, 1.3), 4.6, rate, 1)
  addAt(out, creak(rate, random, 0.35), 7.4, rate, 0.55)
  return normalize(fadeEdges(out, rate, 0.01, 0.1), 0.85)
}

export function angerMannequin(rate: number, random: Random): Samples {
  const out = alloc(1.1, rate)
  const crack = stickSlip(0.09, rate, random, PLASTIC, () => 900, (k) => 1 - k)
  addAt(out, crack, 0, rate, 4)
  addAt(out, creak(rate, random, 0.8), 0.08, rate, 1.5)
  addAt(out, crack, 0.72, rate, 2)
  return normalize(fadeEdges(out, rate))
}

// --- L'Amas (FleshCluster) : chair humide --------------------------------------

/** Un clapotis : bruit dans un filtre résonnant qui balaie, plus des bulles. */
function squelch(rate: number, random: Random, seconds: number, from: number, to: number): Samples {
  const out = alloc(seconds, rate)
  const wet = new Biquad('bandpass', from, 5, rate)
  for (let i = 0; i < out.length; i++) {
    const k = i / out.length
    if (i % 32 === 0) wet.set(from + (to - from) * k, 5)
    out[i] = wet.tick(random() * 2 - 1) * bell(k) * 2.2
  }
  const bubbles = Math.round(seconds * 26)
  for (let b = 0; b < bubbles; b++) {
    const length = 0.012 + random() * 0.035
    addAt(out, bubble(rate, 180 + random() * 500, 500 + random() * 1100, length), random() * (seconds - length), rate, 0.25 + random() * 0.35)
  }
  return out
}

export function bedCluster(rate: number, random: Random): Samples {
  const seconds = 8
  const overlap = 0.4
  const out = alloc(seconds + overlap, rate)
  // Le battement sourd de la masse.
  const brown = brownNoise(random)
  const body = new Biquad('lowpass', 95, 1.2, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    out[i] = body.tick(brown()) * (0.5 + 0.5 * Math.sin((TAU * t) / 2) ** 2) * 1.4
  }
  addAt(out, squelch(rate, random, 0.8, 300, 1100), 0.5, rate, 0.8)
  addAt(out, squelch(rate, random, 0.5, 900, 280), 2.2, rate, 0.55)
  addAt(out, squelch(rate, random, 1.1, 240, 800), 3.5, rate, 0.9)
  addAt(out, squelch(rate, random, 0.4, 700, 300), 5.7, rate, 0.5)
  addAt(out, squelch(rate, random, 0.7, 350, 950), 6.6, rate, 0.7)
  return normalize(loopable(out, overlap, rate), 0.8)
}

export function angerCluster(rate: number, random: Random): Samples {
  const out = alloc(1.3, rate)
  addAt(out, squelch(rate, random, 0.5, 1400, 220), 0, rate, 1.6)
  addAt(out, squelch(rate, random, 0.8, 200, 620), 0.32, rate, 1.2)
  // Gargouillis grave, comme une gorge pleine.
  const gurgle = renderVoice(1, rate, random, {
    pitch: (t) => 44 + 14 * Math.sin(TAU * 7 * t),
    formants: () => [
      [260, 90, 1],
      [640, 160, 0.5],
    ],
    voiced: (t) => bell(t),
    breath: () => 0.3,
  })
  addAt(out, gurgle, 0.18, rate, 2.2)
  return normalize(fadeEdges(out, rate))
}

// --- La Rampante (Crawler) : grouillement --------------------------------------

function skitter(rate: number, random: Random, seconds: number, pace: number): Samples {
  return stickSlip(seconds, rate, random, CHITIN, () => pace, (k) => 0.4 + bell(k) * 0.6)
}

export function bedCrawler(rate: number, random: Random): Samples {
  const out = alloc(7, rate)
  addAt(out, skitter(rate, random, 0.55, 34), 0.4, rate, 0.9)
  addAt(out, skitter(rate, random, 0.3, 42), 1.25, rate, 0.6)
  addAt(out, skitter(rate, random, 0.9, 30), 2.8, rate, 1)
  addAt(out, skitter(rate, random, 0.25, 46), 4.2, rate, 0.5)
  addAt(out, skitter(rate, random, 0.6, 38), 5.5, rate, 0.8)
  return normalize(fadeEdges(out, rate, 0.01, 0.1), 0.85)
}

export function angerCrawler(rate: number, random: Random): Samples {
  const seconds = 1.05
  const out = alloc(seconds, rate)
  const shriek = new Biquad('bandpass', 3000, 2.5, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    // Stridulation : un aigu haché à 60 Hz qui se tord.
    phase += (2400 + 900 * Math.sin(TAU * 11 * t) + 700 * t) / rate
    const chop = Math.sin(TAU * 58 * t) > 0 ? 1 : 0.1
    out[i] = (Math.sin(TAU * phase) * 0.8 + shriek.tick(random() * 2 - 1) * 1.2) * chop * hitEnv(t, 0.02, 0.32)
  }
  addAt(out, skitter(rate, random, 0.5, 60), 0.35, rate, 0.8)
  return normalize(fadeEdges(out, rate))
}

// --- L'Enfant (RaincoatChild) : un air fredonné, puis le cri -------------------

const noteHz = (semitones: number) => 349.23 * 2 ** (semitones / 12)

/** « Au clair de la lune » en mineur, chantonné bouche fermée (domaine public). */
const LULLABY: readonly (readonly [number, number])[] = [
  [0, 0.6],
  [0, 0.6],
  [0, 0.6],
  [2, 0.6],
  [3, 1.15],
  [2, 1.15],
  [0, 0.6],
  [3, 0.6],
  [2, 0.6],
  [2, 0.6],
  [0, 1.7],
]

export function bedChild(rate: number, random: Random): Samples {
  const seconds = 12
  const notes: { at: number; length: number; hz: number }[] = []
  let at = 0.5
  // Le ton baisse doucement : personne ne le tient juste.
  LULLABY.forEach(([semi, length], i) => {
    notes.push({ at, length, hz: noteHz(semi - i * 0.035) })
    at += length
  })
  const noteAt = (t: number) => notes.find((n) => t >= n.at && t < n.at + n.length) ?? null
  const wobble = drift(random, seconds, 0.45)
  const hum = renderVoice(seconds, rate, random, {
    pitch: (t) => {
      const note = noteAt(t) ?? notes[notes.length - 1]
      return note.hz * (1 + Math.sin(TAU * 5.1 * t) * 0.009 + wobble(t) * 0.012)
    },
    // Bouche fermée : un formant nasal bas, très peu d'aigus.
    formants: () => [
      [290, 70, 1],
      [1050, 180, 0.12],
      [2600, 260, 0.05],
    ],
    voiced: (t) => {
      const note = noteAt(t)
      return note ? bell(Math.min(1, ((t - note.at) / note.length) * 0.92 + 0.04)) ** 0.35 : 0
    },
    breath: (t) => (noteAt(t) ? 0.05 : 0),
  })
  return normalize(fadeEdges(hum, rate, 0.05, 0.05), 0.85)
}

export function angerChild(rate: number, random: Random): Samples {
  const seconds = 1.6
  const wobble = drift(random, seconds, 0.05)
  const scream = renderVoice(seconds, rate, random, {
    pitch: (t) => (620 + 620 * Math.min(1, t * 3.2) - 240 * Math.max(0, t - 1.05)) * (1 + wobble(t) * 0.05),
    // « Aaah » ouvert, poussé jusqu'à la casse.
    formants: () => [
      [1050, 130, 1],
      [1750, 170, 0.8],
      [3400, 260, 0.5],
      [4700, 320, 0.25],
    ],
    voiced: (t) => hitEnv(t, 0.03, 0.9) * (1 - Math.max(0, (t - 1.25) / 0.35)),
    breath: (t) => 0.5 * hitEnv(t, 0.02, 0.8),
  })
  for (let i = 0; i < scream.length; i++) scream[i] = softClip(scream[i] * 7, 1.6)
  return normalize(fadeEdges(scream, rate, 0.004, 0.05))
}

// --- Le Long (TallMan) : une présence, plus sentie qu'entendue -----------------

export function bedTall(rate: number, random: Random): Samples {
  const seconds = 10
  const overlap = 1
  const out = alloc(seconds + overlap, rate)
  const brown = brownNoise(random)
  const chest = new Biquad('bandpass', 150, 2.2, rate)
  const throat = new Biquad('bandpass', 310, 3, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    // Une respiration immense, une toutes les cinq secondes. Le grave est
    // écrêté pour rester audible sur de petites enceintes.
    const lungs = Math.sin((TAU * t) / 5) ** 2
    const sub = Math.sin(TAU * 36 * t) * 0.8 + Math.sin(TAU * 54 * t) * 0.5
    const n = brown()
    out[i] = softClip(sub * (0.55 + lungs * 0.45), 1.8) * 0.9 + chest.tick(n) * lungs * 3.4 + throat.tick(n) * lungs * 1.6
  }
  return normalize(loopable(out, overlap, rate), 0.85)
}

export function angerTall(rate: number, random: Random): Samples {
  const seconds = 1.9
  const groan = renderVoice(seconds, rate, random, {
    pitch: (t) => 58 - 16 * (t / seconds),
    formants: (t) => [
      [260 + 90 * Math.min(1, t), 80, 1],
      [640 + 120 * Math.min(1, t), 120, 0.65],
      [1500, 200, 0.2],
    ],
    voiced: (t) => bell(t / seconds) ** 0.5,
    breath: (t) => 0.35 * bell(t / seconds),
  })
  for (let i = 0; i < groan.length; i++) groan[i] = softClip(groan[i] * 7, 1.4)
  return normalize(fadeEdges(groan, rate, 0.02, 0.1))
}

// --- Pas des monstres (défaite) ------------------------------------------------

export function stepHeavy(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.5, rate)
  const low = new Biquad('lowpass', 420, 0.8, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (62 + 30 * decay(t, 0.03) + variant * 3) / rate
    out[i] = Math.sin(TAU * phase) * decay(t, 0.12) + low.tick(random() * 2 - 1) * decay(t, 0.035) * 1.4
  }
  return normalize(fadeEdges(out, rate))
}

export function stepPlastic(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.16, rate)
  const modes = PLASTIC.map(([f, bw]) => new Resonator(f * (0.8 + variant * 0.05), bw * 1.6, rate))
  for (let i = 0; i < out.length; i++) {
    const hit = i < 12 ? (random() * 2 - 1) * 2 : 0
    out[i] = modes[0].tick(hit) + modes[1].tick(hit) * 0.7 + modes[2].tick(hit) * 0.3
  }
  return normalize(fadeEdges(out, rate, 0.0005))
}

export function stepWet(rate: number, random: Random, variant: number): Samples {
  return normalize(fadeEdges(squelch(rate, random, 0.26, 950 - variant * 90, 220), rate))
}

export function stepSkitter(rate: number, random: Random): Samples {
  return normalize(fadeEdges(skitter(rate, random, 0.17, 52), rate))
}

export function stepSmall(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.2, rate)
  const low = new Biquad('lowpass', 500, 0.8, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (1300 + variant * 140 + 700 * t) / rate
    // Botte de caoutchouc : sourde, avec un petit couinement.
    out[i] = low.tick(random() * 2 - 1) * decay(t, 0.03) * 1.2 + Math.sin(TAU * phase) * 0.08 * bell(t / 0.12)
  }
  return normalize(fadeEdges(out, rate))
}
