import type { Random } from '../../maze/random'
import { alloc, bell, Biquad, brownNoise, decay, drift, loopable, normalize, pinkNoise, softClip, TAU, type Samples } from '../dsp'

// Couches continues : tout est une boucle sans raccord, calculée une fois.
// Les harmoniques tombent juste sur la durée de la boucle (cycles entiers).

/** La pièce : grondement grave, secteur 50 Hz, un peu d'air. */
export function roomTone(rate: number, random: Random): Samples {
  const seconds = 8
  const overlap = 1
  const out = alloc(seconds + overlap, rate)
  const brown = brownNoise(random)
  const low = new Biquad('lowpass', 170, 0.7, rate)
  const air = new Biquad('bandpass', 700, 0.5, rate)
  const wobble = drift(random, seconds + overlap, 1.3)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const hum = Math.sin(TAU * 50 * t) * 0.16 + Math.sin(TAU * 100 * t) * 0.07 + Math.sin(TAU * 150 * t) * 0.03
    out[i] = low.tick(brown()) * (0.85 + wobble(t) * 0.15) * 1.3 + hum + air.tick(random() * 2 - 1) * 0.05
  }
  return normalize(loopable(out, overlap, rate), 0.8)
}

/** Tube néon : harmoniques de 100 Hz écrêtées, plus le ballast qui crépite en rythme. */
export function neonBuzz(rate: number, random: Random): Samples {
  const seconds = 2
  const overlap = 0.25
  const out = alloc(seconds + overlap, rate)
  const hiss = new Biquad('bandpass', 2600, 0.9, rate)
  const phases = Array.from({ length: 22 }, () => random() * TAU)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    let tone = 0
    for (let k = 1; k <= 22; k++) tone += Math.sin(TAU * 100 * k * t + phases[k - 1]) / k ** 0.75
    const pulse = Math.max(0, Math.sin(TAU * 100 * t)) ** 6
    out[i] = softClip(tone * 0.5, 2.2) * 0.55 + hiss.tick(random() * 2 - 1) * pulse * 0.9
  }
  return normalize(loopable(out, overlap, rate))
}

/** Souffle de bande magnétique, avec un léger pleurage d'amplitude. */
export function tapeHiss(rate: number, random: Random): Samples {
  const seconds = 4
  const overlap = 0.4
  const out = alloc(seconds + overlap, rate)
  const high = new Biquad('highpass', 1400, 0.7, rate)
  const top = new Biquad('lowpass', 9000, 0.7, rate)
  const flutter = drift(random, seconds + overlap, 0.08)
  for (let i = 0; i < out.length; i++) {
    out[i] = top.tick(high.tick(random() * 2 - 1)) * (0.88 + flutter(i / rate) * 0.12)
  }
  return normalize(loopable(out, overlap, rate), 0.7)
}

/** Sifflement d'oreilles après les coups : deux sons purs qui battent, un peu de bruit. */
export function tinnitus(rate: number, random: Random): Samples {
  const seconds = 4
  const overlap = 0.5
  const out = alloc(seconds + overlap, rate)
  const band = new Biquad('bandpass', 3400, 4, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const beat = 0.75 + 0.25 * Math.sin(TAU * 1.75 * t)
    out[i] = (Math.sin(TAU * 3100 * t) + Math.sin(TAU * 3107 * t) * 0.6 + Math.sin(TAU * 4700 * t) * 0.25) * beat * 0.35 + band.tick(random() * 2 - 1) * 0.25
  }
  return normalize(loopable(out, overlap, rate), 0.8)
}

/** Respiration hachée, derrière un nez cassé : du bruit dans des voyelles. */
export function breath(rate: number, random: Random): Samples {
  const seconds = 7
  const out = alloc(seconds, rate)
  const f1 = new Biquad('bandpass', 620, 1.4, rate)
  const f2 = new Biquad('bandpass', 1500, 2, rate)
  const shake = drift(random, seconds, 0.07)
  // Inspirations brèves, expirations tremblées.
  const cycles = [
    [0.1, 0.55, 0.5],
    [0.8, 1.05, 0.9],
    [2.1, 0.45, 0.45],
    [2.7, 0.9, 1],
    [3.9, 0.6, 0.6],
    [4.65, 1.3, 0.85],
  ] as const
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    let amp = 0
    for (const [at, length, level] of cycles) amp += bell((t - at) / length) * level
    const white = random() * 2 - 1
    out[i] = (f1.tick(white) + f2.tick(white) * 0.6) * amp * (0.75 + shake(t) * 0.25)
  }
  return normalize(out, 0.8)
}

/** Une goutte de perfusion dans la chambre compte-gouttes. */
export function drip(rate: number): Samples {
  const seconds = 1.9
  const out = alloc(seconds, rate)
  const plop = (at: number, from: number, to: number, level: number) => {
    let phase = 0
    for (let i = Math.round(at * rate); i < Math.min(out.length, Math.round((at + 0.09) * rate)); i++) {
      const t = i / rate - at
      phase += (from + (to - from) * Math.min(1, t / 0.03)) / rate
      out[i] += Math.sin(TAU * phase) * decay(t, 0.018) * level
    }
  }
  plop(0.2, 620, 1500, 1)
  plop(0.262, 900, 1900, 0.3)
  return normalize(out, 0.8)
}

/** Parasites numériques : fragments à bas débit, entrecoupés de vide. */
export function glitchBed(rate: number, random: Random): Samples {
  const out = alloc(5, rate)
  let i = 0
  while (i < out.length) {
    const length = Math.round((0.02 + random() * 0.16) * rate)
    if (random() < 0.3) {
      i += length
      continue
    }
    const hold = 4 + Math.floor(random() * 40)
    const pitch = 60 + random() ** 2 * 3200
    const levels = 3 + Math.floor(random() * 5)
    const noisy = random() < 0.4
    let value = 0
    for (let k = 0; k < length && i + k < out.length; k++) {
      if (k % hold === 0) {
        const raw = noisy ? random() * 2 - 1 : Math.sign(Math.sin((TAU * pitch * k) / rate))
        value = Math.round(raw * levels) / levels
      }
      out[i + k] = value * 0.8
    }
    i += length
  }
  return normalize(out, 0.75)
}

/** Courbe des coupures numériques (-1 : coupé, 0 : laisse passer), en rafales. */
export function gateCurve(rate: number, random: Random): Samples {
  const out = alloc(9, rate)
  let i = 0
  while (i < out.length) {
    const burst = random() < 0.55
    const span = Math.round((burst ? 0.2 + random() * 0.5 : 0.25 + random() * 0.6) * rate)
    for (let k = 0; k < span && i + k < out.length; ) {
      const piece = Math.round((burst ? 0.012 + random() * 0.07 : 0.2) * rate)
      const closed = burst && random() < 0.55
      for (let j = 0; j < piece && i + k + j < out.length; j++) out[i + k + j] = closed ? -1 : 0
      k += piece
    }
    i += span
  }
  return out
}

/** Le vent dehors : bruit rose, rafales lentes qui balaient le filtre. */
export function wind(rate: number, random: Random): Samples {
  const seconds = 14
  const overlap = 2
  const total = seconds + overlap
  const out = alloc(total, rate)
  const pink = pinkNoise(random)
  const body = new Biquad('bandpass', 400, 0.7, rate)
  const whistle = new Biquad('bandpass', 900, 5, rate)
  const gust = drift(random, total, 2.4)
  const flutter = drift(random, total, 0.4)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const g = 0.6 + gust(t) * 0.4
    if (i % 128 === 0) {
      body.set(240 + g * 520, 0.7)
      whistle.set(700 + g * 500 + flutter(t) * 80, 6)
    }
    const n = pink()
    out[i] = (body.tick(n) * 1.1 + whistle.tick(n) * 0.2) * (0.45 + g * 0.6)
  }
  return normalize(loopable(out, overlap, rate), 0.8)
}

/** Herbe : myriade de frottements aigus, qui suivent les rafales. */
export function grass(rate: number, random: Random): Samples {
  const seconds = 11
  const overlap = 1.5
  const total = seconds + overlap
  const out = alloc(total, rate)
  const high = new Biquad('highpass', 2400, 0.7, rate)
  const top = new Biquad('lowpass', 9500, 0.7, rate)
  const gust = drift(random, total, 1.7)
  const grain = drift(random, total, 0.012)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const swell = 0.55 + gust(t) * 0.45
    const rustle = Math.max(0, grain(t) + swell * 0.5)
    out[i] = top.tick(high.tick(random() * 2 - 1)) * rustle * rustle * (0.3 + swell)
  }
  return normalize(loopable(out, overlap, rate), 0.8)
}
