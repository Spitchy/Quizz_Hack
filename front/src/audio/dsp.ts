import type { Random } from '../maze/random'

// Boîte à outils de synthèse hors ligne : on calcule des échantillons bruts
// (mono, flottants), qui deviennent ensuite des `AudioBuffer`. Pur, sans Web
// Audio : testable et utilisable dans un worker.

export type Samples = Float32Array

export const TAU = Math.PI * 2

export const alloc = (seconds: number, rate: number): Samples => new Float32Array(Math.round(seconds * rate))

/** Enveloppe exponentielle : 1 à `t = 0`, puis décroissance. */
export const decay = (t: number, tau: number) => (t < 0 ? 0 : Math.exp(-t / tau))

/** Attaque linéaire, puis décroissance exponentielle. */
export const hitEnv = (t: number, attack: number, tau: number) =>
  t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / tau)

/** Monte puis descend en cloche sur `[0, 1]`. */
export const bell = (k: number) => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k) ** 2)

export const softClip = (x: number, drive = 1) => Math.tanh(x * drive)

export type FilterKind = 'lowpass' | 'highpass' | 'bandpass'

/** Filtre biquadratique (formules RBJ), réglable en cours de route. */
export class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  private readonly kind: FilterKind
  private readonly rate: number

  constructor(kind: FilterKind, frequency: number, q: number, rate: number) {
    this.kind = kind
    this.rate = rate
    this.set(frequency, q)
  }

  set(frequency: number, q: number): void {
    const w = (TAU * Math.min(frequency, this.rate * 0.45)) / this.rate
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    if (this.kind === 'lowpass') {
      this.b1 = (1 - cos) / a0
      this.b0 = this.b1 / 2
      this.b2 = this.b0
    } else if (this.kind === 'highpass') {
      this.b1 = -(1 + cos) / a0
      this.b0 = -this.b1 / 2
      this.b2 = this.b0
    } else {
      this.b0 = alpha / a0
      this.b1 = 0
      this.b2 = -this.b0
    }
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
  }

  tick(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/** Résonateur à deux pôles : ce qui « chante » quand on l'excite (formants, plastique, métal). */
export class Resonator {
  private a1 = 0
  private a2 = 0
  private g = 0
  private y1 = 0
  private y2 = 0
  private readonly rate: number

  constructor(frequency: number, bandwidth: number, rate: number) {
    this.rate = rate
    this.set(frequency, bandwidth)
  }

  set(frequency: number, bandwidth: number): void {
    const r = Math.exp((-Math.PI * bandwidth) / this.rate)
    this.a1 = 2 * r * Math.cos((TAU * Math.min(frequency, this.rate * 0.45)) / this.rate)
    this.a2 = -r * r
    this.g = 1 - r
  }

  tick(x: number): number {
    const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/** Bruit rose (filtre de Kellet), par générateur. */
export function pinkNoise(random: Random): () => number {
  let b0 = 0
  let b1 = 0
  let b2 = 0
  return () => {
    const white = random() * 2 - 1
    b0 = 0.99765 * b0 + white * 0.099046
    b1 = 0.963 * b1 + white * 0.2965164
    b2 = 0.57 * b2 + white * 1.0526913
    return (b0 + b1 + b2 + white * 0.1848) * 0.2
  }
}

/** Bruit brun : les grondements. */
export function brownNoise(random: Random): () => number {
  let last = 0
  return () => {
    last = (last + (random() * 2 - 1) * 0.02) / 1.02
    return last * 3.5
  }
}

/** Valeur aléatoire qui glisse : `lookup(t)` entre -1 et 1, nouvelle cible toutes les `period` s. */
export function drift(random: Random, seconds: number, period: number): (t: number) => number {
  const points = Float32Array.from({ length: Math.ceil(seconds / period) + 2 }, () => random() * 2 - 1)
  return (t) => {
    const k = t / period
    const i = Math.min(points.length - 2, Math.floor(k))
    const f = k - i
    const s = f * f * (3 - 2 * f)
    return points[i] + (points[i + 1] - points[i]) * s
  }
}

/** Ajoute `src` dans `dst` à l'instant `at` (s). */
export function addAt(dst: Samples, src: Samples, at: number, rate: number, gain = 1): void {
  const start = Math.round(at * rate)
  const end = Math.min(dst.length, start + src.length)
  for (let i = Math.max(0, start); i < end; i++) dst[i] += src[i - start] * gain
}

/** Ramène le pic à `peak`. */
export function normalize(samples: Samples, peak = 0.9): Samples {
  let max = 0
  for (const s of samples) max = Math.max(max, Math.abs(s))
  if (max > 1e-9) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max
  return samples
}

/** Adoucit les bords pour éviter tout clic. */
export function fadeEdges(samples: Samples, rate: number, fadeIn = 0.002, fadeOut = 0.01): Samples {
  const a = Math.min(samples.length, Math.round(fadeIn * rate))
  const b = Math.min(samples.length, Math.round(fadeOut * rate))
  for (let i = 0; i < a; i++) samples[i] *= i / a
  for (let i = 0; i < b; i++) samples[samples.length - 1 - i] *= i / b
  return samples
}

/**
 * Boucle sans raccord : le rendu fait `seconds + overlap` ; sa fin se fond dans
 * le début, à puissance constante.
 */
export function loopable(samples: Samples, overlap: number, rate: number): Samples {
  const x = Math.round(overlap * rate)
  const length = samples.length - x
  const out = samples.slice(0, length)
  for (let i = 0; i < x; i++) {
    const k = i / x
    out[i] = samples[i] * Math.sqrt(k) + samples[length + i] * Math.sqrt(1 - k)
  }
  return out
}

export interface VoiceSpec {
  /** Fondamentale (Hz) à l'instant `t`. */
  pitch: (t: number) => number
  /** Formants `[Hz, largeur de bande, gain]`, pouvant varier au cours du temps. */
  formants: (t: number) => readonly (readonly [number, number, number])[]
  /** Voisement (0..1). */
  voiced: (t: number) => number
  /** Souffle (0..1). */
  breath: (t: number) => number
}

/** Voix de synthèse : impulsions de glotte et souffle, passés dans des formants. */
export function renderVoice(seconds: number, rate: number, random: Random, spec: VoiceSpec): Samples {
  const out = alloc(seconds, rate)
  const count = spec.formants(0).length
  const bank = Array.from({ length: count }, () => new Resonator(500, 100, rate))
  const gains = new Float32Array(count)
  let phase = 0
  let previous = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 64 === 0) {
      spec.formants(t).forEach(([f, bw, g], k) => {
        bank[k].set(f, bw)
        gains[k] = g
      })
    }
    phase += spec.pitch(t) / rate
    if (phase >= 1) phase -= 1
    // Impulsion de glotte : s'ouvre lentement, se ferme d'un coup.
    const glottis = phase < 0.62 ? Math.sin((Math.PI * phase) / 0.62) ** 2 : 0
    const pulse = glottis - previous
    previous = glottis
    const source = pulse * 6 * spec.voiced(t) + (random() * 2 - 1) * 0.14 * spec.breath(t)
    let sum = 0
    for (let k = 0; k < count; k++) sum += bank[k].tick(source) * gains[k]
    out[i] = sum
  }
  return out
}
