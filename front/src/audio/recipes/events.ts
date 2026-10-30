import type { Random } from '../../maze/random'
import { addAt, alloc, bell, Biquad, decay, drift, fadeEdges, hitEnv, normalize, Resonator, renderVoice, softClip, TAU, type Samples } from '../dsp'

// Sons ponctuels : pas, verdicts, coups, salle du réveil, infection, sortie.

// --- Pas du joueur et du médecin -----------------------------------------------

export function stepCarpet(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.26, rate)
  const heel = new Biquad('lowpass', 300 + variant * 50, 0.8, rate)
  const scuff = new Biquad('bandpass', 1500 + variant * 280, 1.1, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (88 - 28 * Math.min(1, t * 30) + variant * 3) / rate
    const white = random() * 2 - 1
    out[i] =
      Math.sin(TAU * phase) * decay(t, 0.03) * 0.7 +
      heel.tick(white) * decay(t, 0.03) * 1.9 +
      scuff.tick(white) * bell((t - 0.012) / 0.12) * 0.16
  }
  return normalize(fadeEdges(out, rate, 0.001, 0.02))
}

/** Semelle dure sur du carrelage : talon, puis pointe. */
export function stepHard(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.22, rate)
  const click = new Biquad('bandpass', 2300 + variant * 350, 1.6, rate)
  const body = new Resonator(190 + variant * 22, 60, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const toe = t - 0.075
    const white = random() * 2 - 1
    const strike = decay(t, 0.006) + (toe > 0 ? decay(toe, 0.005) * 0.4 : 0)
    out[i] = click.tick(white) * strike * 1.8 + body.tick(i < 10 ? white * 3 : 0) * 1.1
  }
  return normalize(fadeEdges(out, rate, 0.0005, 0.02))
}

// --- Intro : le bulletin, la rue, la camionnette --------------------------------

/** Générique du flash : trois accords de cuivres métalliques, dans un petit poste. */
export function newsSting(rate: number): Samples {
  const seconds = 1.5
  const out = alloc(seconds, rate)
  const stabs = [
    { at: 0, notes: [196, 293.66, 392, 466.16], tau: 0.16 },
    { at: 0.22, notes: [196, 293.66, 392, 466.16], tau: 0.12 },
    { at: 0.44, notes: [233.08, 349.23, 466.16, 554.37], tau: 0.45 },
  ]
  const tone = new Biquad('bandpass', 1300, 0.7, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    let v = 0
    for (const { at, notes, tau } of stabs) {
      if (t < at) continue
      const local = t - at
      for (const f of notes) v += (((f * local) % 1) * 2 - 1) * hitEnv(local, 0.008, tau)
    }
    out[i] = softClip(tone.tick(v * 0.5), 1.4)
  }
  return normalize(fadeEdges(out, rate, 0.002, 0.1), 0.8)
}

/** Le bulletin ne se charge pas : un parasite de poste, très bref. */
export function newsStatic(rate: number, random: Random): Samples {
  const out = alloc(1, rate)
  const band = new Biquad('bandpass', 1900, 0.8, rate)
  for (let i = 0; i < out.length; i++) out[i] = band.tick(random() * 2 - 1) * bell(i / out.length)
  return normalize(out, 0.5)
}

/** Verrouillage du téléphone : deux clics minuscules. */
export function phoneLock(rate: number, random: Random): Samples {
  const out = alloc(0.14, rate)
  const click = new Biquad('bandpass', 3400, 2, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const second = t - 0.06
    out[i] = click.tick(random() * 2 - 1) * (decay(t, 0.0035) + (second > 0 ? decay(second, 0.003) * 0.6 : 0))
  }
  return normalize(out, 0.8)
}

/** Pneus qui mordent sur le bitume mouillé : un sifflement qui retombe, de l'eau projetée. */
export function tireScreech(rate: number, random: Random): Samples {
  const seconds = 1.7
  const out = alloc(seconds, rate)
  const squeal = new Biquad('bandpass', 1500, 9, rate)
  const spray = new Biquad('highpass', 1800, 0.7, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 32 === 0) squeal.set(1750 - 620 * (t / seconds) + Math.sin(t * 47) * 40, 9)
    const white = random() * 2 - 1
    out[i] = squeal.tick(white) * bell(t / seconds) ** 0.6 * 2.4 + spray.tick(white) * bell(t / seconds) * 0.28
  }
  return normalize(fadeEdges(out, rate, 0.02, 0.2), 0.85)
}

/** Porte coulissante : le rail qui roule, puis la butée. */
export function vanDoor(rate: number, random: Random): Samples {
  const seconds = 1.25
  const out = alloc(seconds, rate)
  const rail = new Biquad('bandpass', 620, 1.4, rate)
  const stop = new Resonator(96, 16, rate)
  const clang = new Resonator(780, 60, rate)
  const hitAt = 0.82
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const rolling = t < hitAt ? Math.min(1, t * 6) * (0.65 + 0.35 * Math.sin(t * 70)) : 0
    const after = t - hitAt
    const kick = after >= 0 && after < 0.002 ? 6 : 0
    out[i] = rail.tick(random() * 2 - 1) * rolling * 1.5 + stop.tick(kick) * 1.5 + clang.tick(kick) * 0.5
  }
  return normalize(fadeEdges(out, rate, 0.01, 0.1), 0.9)
}

/** Une masse fend l'air : batte ou jambe, le souffle monte puis s'éteint. */
export function batSwing(rate: number, random: Random): Samples {
  const seconds = 0.34
  const out = alloc(seconds, rate)
  const band = new Biquad('bandpass', 500, 1.1, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 16 === 0) band.set(420 + 2100 * (t / seconds) ** 2, 1.1)
    out[i] = band.tick(random() * 2 - 1) * (t / seconds) ** 2 * bell(t / seconds + 0.08)
  }
  return normalize(fadeEdges(out, rate, 0.004, 0.01), 0.85)
}

// --- Verdict d'une réponse -----------------------------------------------------

/** Mauvaise réponse : le choc. Grappe dissonante, chute dans le grave, éclats du panneau. */
export function stinger(rate: number, random: Random): Samples {
  const seconds = 1.9
  const out = alloc(seconds, rate)
  const chord = [196, 207.65, 277.18, 293.66, 415.3, 440, 587.33, 622.25]
  const phases = chord.map(() => random())
  const sweep = new Biquad('lowpass', 6000, 1.3, rate)
  const crash = new Biquad('highpass', 1200, 0.7, rate)
  let sub = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 32 === 0) sweep.set(380 + 6200 * decay(t, 0.22), 1.3)
    let saw = 0
    chord.forEach((f, k) => {
      phases[k] = (phases[k] + (f * (1 - t * 0.035)) / rate) % 1
      saw += phases[k] * 2 - 1
    })
    sub += (30 + 90 * decay(t, 0.14)) / rate
    const body = sweep.tick(saw * 0.28) * hitEnv(t, 0.004, 0.62)
    const boom = Math.sin(TAU * sub) * hitEnv(t, 0.002, 0.55) * 1.1
    out[i] = softClip(body + boom + crash.tick(random() * 2 - 1) * decay(t, 0.13) * 0.8, 1.5)
  }
  // Le panneau qui se brise : quelques éclats secs.
  for (let c = 0; c < 9; c++) {
    const at = 0.01 + random() ** 2 * 0.28
    const shard = new Resonator(1400 + random() * 3200, 500, rate)
    const piece = alloc(0.03, rate)
    for (let i = 0; i < piece.length; i++) piece[i] = shard.tick(i < 6 ? random() * 2 - 1 : 0) * 5
    addAt(out, piece, at, rate, 0.55)
  }
  return normalize(fadeEdges(out, rate, 0.0005, 0.08))
}

/** Bonne réponse : l'entité part en poussière, l'air se relâche, un accord s'ouvre. */
export function release(rate: number, random: Random): Samples {
  const seconds = 1.7
  const out = alloc(seconds, rate)
  const whoosh = new Biquad('bandpass', 700, 0.9, rate)
  const chord = [220, 329.63, 493.88, 659.25]
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 32 === 0) whoosh.set(620 + 3400 * Math.min(1, t / 1.1), 0.9)
    let tone = 0
    for (const f of chord) tone += Math.sin(TAU * f * t)
    out[i] = whoosh.tick(random() * 2 - 1) * bell(t / seconds) * 0.8 + tone * 0.05 * bell(t / seconds) ** 1.5
  }
  // La poussière : des centaines de grains de plus en plus aigus.
  for (let g = 0; g < 420; g++) {
    const k = random()
    const grain = alloc(0.009, rate)
    const pitch = 2200 + k * 6500 + random() * 1200
    for (let i = 0; i < grain.length; i++) grain[i] = Math.sin((TAU * pitch * i) / rate) * bell(i / grain.length)
    addAt(out, grain, k * seconds * 0.88, rate, 0.1 * (1 - k * 0.7) * (0.3 + random() * 0.7))
  }
  return normalize(fadeEdges(out, rate, 0.003, 0.08), 0.8)
}

// --- Danger ---------------------------------------------------------------------

/** Quatre battements, jamais tout à fait les mêmes : l'écart, la force, la hauteur. */
const HEARTBEATS = [
  { gap: 0.145, tu: 0.5, pitch: 1 },
  { gap: 0.16, tu: 0.44, pitch: 0.97 },
  { gap: 0.135, tu: 0.56, pitch: 1.03 },
  { gap: 0.172, tu: 0.47, pitch: 0.95 },
] as const

/**
 * Battement de cœur : tu-TUN. Un petit coup sec, plus aigu, qui lance le grand
 * coup grave, tout de suite après. Une pointe d'harmonique pour les petites enceintes.
 */
export function heartbeat(rate: number, _random: Random, variant: number): Samples {
  const { gap, tu, pitch } = HEARTBEATS[variant]
  const out = alloc(0.62, rate)
  const thump = (at: number, level: number, tau: number, from: number) => {
    let phase = 0
    for (let i = Math.round(at * rate); i < out.length; i++) {
      const t = i / rate - at
      phase += (from - 26 * Math.min(1, t * 22)) / rate
      out[i] += softClip(Math.sin(TAU * phase) * 1.7) * hitEnv(t, 0.006, tau) * level
    }
  }
  thump(0.01, tu, 0.03, 98 * pitch)
  thump(0.01 + gap, 1, 0.105, 70 * pitch)
  return normalize(fadeEdges(out, rate, 0.001, 0.02), 0.95)
}

// --- Défaite : coups et micro de surveillance -----------------------------------

export function hitFlesh(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.34, rate)
  const smack = new Biquad('bandpass', 760 + variant * 190, 1, rate)
  const wet = new Biquad('bandpass', 2100 + variant * 240, 1.4, rate)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (52 + 92 * decay(t, 0.022) + variant * 4) / rate
    const white = random() * 2 - 1
    out[i] = softClip(
      Math.sin(TAU * phase) * decay(t, 0.075) * 1.5 +
        smack.tick(white) * decay(t, 0.02) * 3.4 +
        wet.tick(white) * decay(t - 0.012, 0.045) * 0.8 +
        (i < 5 ? white * 1.4 : 0),
      1.6,
    )
  }
  return normalize(fadeEdges(out, rate, 0.0005, 0.02))
}

export function hitBone(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.28, rate)
  const body = new Resonator(390 + variant * 70, 110, rate)
  const clicks = 5 + variant
  for (let c = 0; c < clicks; c++) {
    const crack = new Resonator(1500 + random() * 2400, 420, rate)
    const at = c === 0 ? 0 : random() * 0.028
    const piece = alloc(0.02, rate)
    for (let i = 0; i < piece.length; i++) piece[i] = crack.tick(i < 4 ? random() * 2 - 1 : 0) * 8
    addAt(out, piece, at, rate, 1 - c * 0.1)
  }
  for (let i = 0; i < out.length; i++) out[i] += body.tick(i < 6 ? (random() * 2 - 1) * 5 : 0) * 1.4
  return normalize(fadeEdges(out, rate, 0.0002, 0.02))
}

export function splat(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.42, rate)
  const wet = new Biquad('bandpass', 1300, 2.4, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 32 === 0) wet.set(1300 - 900 * Math.min(1, t * 8) + variant * 60, 2.4)
    out[i] = wet.tick(random() * 2 - 1) * hitEnv(t, 0.002, 0.05) * 2.4
  }
  for (let d = 0; d < 11; d++) {
    const length = 0.008 + random() * 0.018
    const drop = alloc(length, rate)
    const f = 900 + random() * 1700
    for (let i = 0; i < drop.length; i++) drop[i] = Math.sin((TAU * f * i * (1 + i / drop.length / 2)) / rate) * (1 - i / drop.length)
    addAt(out, drop, 0.04 + random() * 0.32, rate, 0.16 + random() * 0.2)
  }
  return normalize(fadeEdges(out, rate, 0.0005, 0.02))
}

/** Le corps qui tombe : les genoux, puis tout le poids. */
export function bodyFall(rate: number, random: Random): Samples {
  const out = alloc(0.95, rate)
  const cloth = new Biquad('bandpass', 1100, 0.8, rate)
  const thump = (at: number, level: number, tau: number, f: number) => {
    let phase = 0
    for (let i = Math.round(at * rate); i < out.length; i++) {
      const t = i / rate - at
      phase += (f + 55 * decay(t, 0.03)) / rate
      out[i] += softClip(Math.sin(TAU * phase) * 1.6) * decay(t, tau) * level
    }
  }
  thump(0, 0.6, 0.06, 74)
  thump(0.11, 0.5, 0.05, 82)
  thump(0.32, 1, 0.14, 52)
  for (let i = 0; i < out.length; i++) out[i] += cloth.tick(random() * 2 - 1) * bell(i / rate / 0.5) * 0.14
  return normalize(fadeEdges(out, rate))
}

/** Le micro sature : claquements, crachotis, ronflette de masse. */
export function micCrackle(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.38 + variant * 0.05, rate)
  const band = new Biquad('bandpass', 2600, 0.8, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const spit = random() < 0.09 * decay(t, 0.09) ? (random() * 2 - 1) * 4 : 0
    const ground = Math.sign(Math.sin(TAU * 50 * t)) * 0.26 * decay(t, 0.07)
    out[i] = softClip(band.tick(spit + (random() * 2 - 1) * 0.5 * decay(t, 0.035)) * 3.2 + ground, 2.2)
  }
  return normalize(fadeEdges(out, rate, 0.0002, 0.02))
}

/** Les néons lâchent : le bourdonnement s'effondre, un relais claque. */
export function powerDown(rate: number, random: Random): Samples {
  const seconds = 1.35
  const out = alloc(seconds, rate)
  let phase = 0
  const relay = new Resonator(310, 90, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase += (100 * Math.exp(-t * 2.1) + 8) / rate
    let tone = 0
    for (let k = 1; k <= 12; k++) tone += Math.sin(TAU * phase * k) / k
    const hit = Math.abs(t - 0.86) < 0.0015 ? (random() * 2 - 1) * 6 : 0
    out[i] = softClip(tone * 0.7, 2) * Math.max(0, 1 - t / 0.95) ** 1.5 * 0.8 + relay.tick(hit) * 1.2
  }
  return normalize(fadeEdges(out, rate, 0.001, 0.05))
}

// --- Salle du réveil ------------------------------------------------------------

function excited(seconds: number, rate: number, random: Random, modes: readonly (readonly [number, number, number])[], pace: (k: number) => number, level: (k: number) => number): Samples {
  const out = alloc(seconds, rate)
  const bank = modes.map(([f, bw]) => new Resonator(f, bw, rate))
  let next = 0
  for (let i = 0; i < out.length; i++) {
    const k = i / out.length
    let pulse = 0
    if (i >= next) {
      pulse = (0.6 + random() * 0.4) * level(k)
      next = i + Math.round((rate / Math.max(1, pace(k))) * (0.75 + random() * 0.5))
    }
    let sum = 0
    bank.forEach((mode, m) => {
      sum += mode.tick(pulse) * modes[m][2]
    })
    out[i] = sum
  }
  return out
}

/** Cuir sous tension. */
export function leather(rate: number, random: Random, variant: number): Samples {
  const seconds = 0.55 + variant * 0.1
  const out = excited(
    seconds,
    rate,
    random,
    [
      [520 + variant * 60, 120, 1],
      [1250 + variant * 90, 220, 0.55],
      [2600, 400, 0.15],
    ],
    (k) => 22 + 44 * k,
    (k) => bell(k) ** 0.6,
  )
  // La boucle qui cliquette.
  if (variant % 2 === 0) {
    const tick = alloc(0.03, rate)
    const metal = new Resonator(3700, 300, rate)
    for (let i = 0; i < tick.length; i++) tick[i] = metal.tick(i < 4 ? random() * 2 - 1 : 0) * 3
    addAt(out, tick, seconds * 0.6, rate, 0.4)
  }
  return normalize(fadeEdges(out, rate, 0.005, 0.03))
}

export function doorLatch(rate: number, random: Random): Samples {
  const out = alloc(0.3, rate)
  const modes = [new Resonator(420, 40, rate), new Resonator(1150, 80, rate), new Resonator(2350, 140, rate)]
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const strike = t < 0.002 || Math.abs(t - 0.07) < 0.001 ? (random() * 2 - 1) * 4 : 0
    out[i] = modes[0].tick(strike) + modes[1].tick(strike) * 0.7 + modes[2].tick(strike) * 0.4
  }
  return normalize(fadeEdges(out, rate, 0.0002, 0.03))
}

/** Porte métallique : le gond qui crie en montant, et la masse de la porte. */
export function doorCreak(rate: number, random: Random): Samples {
  const seconds = 1.25
  const out = excited(
    seconds,
    rate,
    random,
    [
      [1080, 45, 1],
      [2420, 70, 0.7],
      [3920, 110, 0.3],
      [185, 40, 0.7],
    ],
    (k) => 34 + 66 * k ** 1.4,
    (k) => bell(Math.min(1, k * 0.85 + 0.08)) ** 0.5,
  )
  return normalize(fadeEdges(out, rate, 0.01, 0.1))
}

export function needle(rate: number, random: Random): Samples {
  const out = alloc(0.34, rate)
  const ting = new Resonator(6300, 180, rate)
  const ting2 = new Resonator(9100, 260, rate)
  const pop = new Biquad('bandpass', 950, 2, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const strike = i < 5 ? (random() * 2 - 1) * 3 : 0
    out[i] = ting.tick(strike) * 1.3 + ting2.tick(strike) * 0.8 + pop.tick(random() * 2 - 1) * decay(t - 0.02, 0.022) * 1.6
  }
  return normalize(fadeEdges(out, rate, 0.0002, 0.03))
}

/** Le piston : joint de caoutchouc qui couine, et le liquide qui passe. */
export function plunger(rate: number, random: Random): Samples {
  const seconds = 1.05
  const out = excited(
    seconds,
    rate,
    random,
    [
      [1650, 120, 1],
      [2900, 180, 0.4],
    ],
    (k) => 130 + 110 * k,
    (k) => 0.3 + bell(k) * 0.7,
  )
  const fluid = new Biquad('bandpass', 5200, 1.2, rate)
  for (let i = 0; i < out.length; i++) out[i] += fluid.tick(random() * 2 - 1) * 0.1 * bell((i / rate) / seconds)
  return normalize(fadeEdges(out, rate, 0.01, 0.05))
}

/** Le joueur retient son souffle d'un coup. */
export function gasp(rate: number, random: Random): Samples {
  const out = alloc(0.6, rate)
  const f1 = new Biquad('bandpass', 700, 2, rate)
  const f2 = new Biquad('bandpass', 1800, 2.6, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const white = random() * 2 - 1
    out[i] = (f1.tick(white) + f2.tick(white) * 0.7) * bell(Math.min(1, t / 0.55) ** 0.55)
  }
  return normalize(fadeEdges(out, rate, 0.005, 0.03))
}

/** Le dossier qu'on prend ou qu'on repose : du papier sec qui froisse. */
export function paper(rate: number, random: Random): Samples {
  const seconds = 0.42
  const out = alloc(seconds, rate)
  const body = new Biquad('bandpass', 3400, 0.7, rate)
  const crinkle = drift(random, seconds, 0.012)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const grain = Math.max(0, crinkle(t))
    out[i] = body.tick(random() * 2 - 1) * grain * grain * bell(t / seconds) ** 0.5
  }
  return normalize(fadeEdges(out, rate, 0.004, 0.03))
}

// --- Le rire du médecin (voix de synthèse, étouffée par le masque) --------------

interface Syllable {
  at: number
  length: number
  pitch: number
}

/** Rire : des « héh » aspirés, chacun sa petite chute de hauteur. */
function laughVoice(rate: number, random: Random, seconds: number, syllables: readonly Syllable[]): Samples {
  const current = (t: number) => syllables.find((s) => t >= s.at && t < s.at + s.length) ?? null
  const wobble = drift(random, seconds, 0.09)
  const voice = renderVoice(seconds, rate, random, {
    pitch: (t) => {
      const s = current(t)
      const k = s ? (t - s.at) / s.length : 0
      return (s?.pitch ?? 110) * (1.05 - k * 0.24) * (1 + wobble(t) * 0.035)
    },
    formants: () => [
      [510, 90, 1],
      [1420, 130, 0.7],
      [2420, 190, 0.3],
    ],
    voiced: (t) => {
      const s = current(t)
      if (!s) return 0
      const k = (t - s.at) / s.length
      return k < 0.18 ? 0 : bell((k - 0.18) / 0.82) ** 0.4
    },
    breath: (t) => {
      const s = current(t)
      if (!s) return 0.02
      const k = (t - s.at) / s.length
      return k < 0.2 ? 1 : 0.28
    },
  })
  const mask = new Biquad('lowpass', 2300, 0.8, rate)
  for (let i = 0; i < voice.length; i++) voice[i] = softClip(mask.tick(voice[i]) * 12, 1.3)
  return normalize(fadeEdges(voice, rate, 0.005, 0.05))
}

export function chuckle(rate: number, random: Random): Samples {
  return laughVoice(rate, random, 1.1, [
    { at: 0.03, length: 0.2, pitch: 96 },
    { at: 0.33, length: 0.18, pitch: 100 },
    { at: 0.6, length: 0.26, pitch: 92 },
  ])
}

export function laugh(rate: number, random: Random): Samples {
  const syllables: Syllable[] = []
  let at = 0.02
  // Le rire s'emballe, monte, puis il manque d'air.
  for (let i = 0; i < 17; i++) {
    const k = i / 16
    const length = 0.2 - 0.06 * Math.min(1, k * 1.6) + 0.08 * Math.max(0, k - 0.75) * 4
    syllables.push({ at, length, pitch: 112 + 66 * bell(Math.min(1, k * 1.05)) })
    at += length + 0.045 + 0.05 * (1 - k)
  }
  return laughVoice(rate, random, at + 0.15, syllables)
}

// --- Infection ------------------------------------------------------------------

export function glitch(rate: number, random: Random, variant: number): Samples {
  const out = alloc(0.16 + variant * 0.08, rate)
  let value = 0
  let hold = 3
  const levels = 2 + variant
  for (let i = 0; i < out.length; i++) {
    if (i % hold === 0) {
      value = Math.round((random() * 2 - 1) * levels) / levels
      if (random() < 0.02) hold = 2 + Math.floor(random() * 30)
    }
    const k = i / out.length
    out[i] = value * Math.sin(TAU * (80 + 3000 * k * k) * (i / rate)) * (1 - k * 0.5)
  }
  return normalize(fadeEdges(out, rate, 0.0005, 0.01), 0.8)
}

// --- Victoire -------------------------------------------------------------------

/** La lumière envahit : tout monte, jusqu'à la coupure. */
export function surge(rate: number, random: Random): Samples {
  const seconds = 2.6
  const out = alloc(seconds, rate)
  const air = new Biquad('highpass', 400, 0.7, rate)
  const notes = [110, 165, 220, 330, 440, 660]
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const k = t / seconds
    if (i % 64 === 0) air.set(300 + 5200 * k * k, 0.7)
    let tone = 0
    notes.forEach((f, n) => {
      tone += Math.sin(TAU * f * (1 + k * 0.012) * t + n) * (0.3 + k * (n / 6))
    })
    out[i] = (tone * 0.11 + air.tick(random() * 2 - 1) * 0.9) * k ** 2.4
  }
  return normalize(fadeEdges(out, rate, 0.2, 0.004), 0.85)
}

/** La porte blanche : un joint qui cède, l'air du dehors qui entre. */
export function doorWhite(rate: number, random: Random): Samples {
  const seconds = 1.5
  const out = alloc(seconds, rate)
  const rush = new Biquad('bandpass', 500, 0.6, rate)
  const seal = new Resonator(240, 70, rate)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    if (i % 64 === 0) rush.set(380 + 1800 * Math.min(1, t / 1.2), 0.6)
    const strike = t < 0.003 ? (random() * 2 - 1) * 3 : 0
    out[i] = seal.tick(strike) * 1.6 + rush.tick(random() * 2 - 1) * bell(t / seconds) ** 0.8 * 0.9
  }
  return normalize(fadeEdges(out, rate, 0.001, 0.08), 0.8)
}
