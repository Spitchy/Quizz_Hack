import { INTRO_TIMELINE, stageStart, type IntroStage } from '../../app/sequence'

// L'intro, en fonctions pures du temps : où est la tête, le téléphone, la
// camionnette, l'homme à la batte. Tout est continu : le recul depuis le plein
// écran est un seul mouvement. Les sons datés (`cues.ts`) suivent ces mêmes dates.

export const T = {
  pull: stageStart(INTRO_TIMELINE, 'pull'),
  watch: stageStart(INTRO_TIMELINE, 'watch'),
  pocket: stageStart(INTRO_TIMELINE, 'pocket'),
  look: stageStart(INTRO_TIMELINE, 'look'),
  van: stageStart(INTRO_TIMELINE, 'van'),
  door: stageStart(INTRO_TIMELINE, 'door'),
  run: stageStart(INTRO_TIMELINE, 'run'),
  swing: stageStart(INTRO_TIMELINE, 'swing'),
  black: stageStart(INTRO_TIMELINE, 'black'),
  done: stageStart(INTRO_TIMELINE, 'done'),
} as const

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const ease = (k: number) => {
  const x = clamp01(k)
  return x * x * (3 - 2 * x)
}
const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 3

/** Temps de l'intro (s) d'après l'étape en cours : il ne dépasse jamais l'étape suivante. */
export function introTime(stage: IntroStage, since: number): number {
  const index = INTRO_TIMELINE.findIndex(([s]) => s === stage)
  const start = INTRO_TIMELINE[index][1] / 1000
  const next = INTRO_TIMELINE[index + 1]
  return next ? Math.min(start + since, next[1] / 1000) : start
}

// --- Le téléphone --------------------------------------------------------------

/** L'écran : 16/9, tenu à l'horizontale. */
export const SCREEN = { width: 0.13, height: 0.0731 } as const

/** Distance à laquelle l'écran remplit toute l'image, quelle qu'en soit la largeur. */
export function fillDistance(aspect: number, fovDeg: number): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360)
  return Math.min(SCREEN.height / 2 / tan, SCREEN.width / 2 / (tan * aspect)) * 0.97
}

const HELD = { y: -0.15, z: -0.33, rx: -0.4 } as const
const POCKET = { x: 0.34, y: -1.05, z: 0.04, rx: -1.3, rz: -1.45 } as const

export interface PhonePose {
  x: number
  y: number
  z: number
  rx: number
  rz: number
  /** L'écran vit encore. */
  screenOn: boolean
  /** Dans le champ ou tout près : au-delà, ni téléphone ni mains. */
  present: boolean
  /** La main gauche a lâché (0..1). */
  leftRelease: number
  /** Le téléphone éclaire ses mains. */
  glow: number
}

/** Le téléphone, dans le repère de la tête. */
export function phonePose(t: number, fill: number): PhonePose {
  const pull = ease((t - T.pull) / (T.watch - T.pull))
  const pocket = (t - T.pocket) / (T.look - T.pocket)
  const away = ease(pocket * 1.05 - 0.05)
  // Le recul est régulier à l'œil : une distance qui double prend le même temps.
  const z = -Math.exp(lerp(Math.log(fill), Math.log(-HELD.z), pull))
  const hold = pull * (1 - away)
  return {
    x: POCKET.x * away + Math.sin(t * 0.7) * 0.004 * hold,
    y: lerp(HELD.y * pull * pull, POCKET.y, away) + Math.sin(t * 1.1) * 0.003 * hold,
    z: lerp(z, POCKET.z, away),
    rx: lerp(HELD.rx * pull, POCKET.rx, away) + Math.sin(t * 0.9 + 1) * 0.012 * hold,
    rz: POCKET.rz * away + Math.sin(t * 0.6 + 2) * 0.01 * hold,
    screenOn: t < T.pocket,
    present: t < T.look,
    leftRelease: ease(pocket * 2.2),
    glow: t < T.pocket ? pull : 0,
  }
}

// --- La camionnette ------------------------------------------------------------

/** Vitesse avant de freiner (m/s), durée du trajet et du freinage (s). */
const VAN_SPEED = 28
const VAN_TRIP = 3.2
const VAN_BRAKING = 0.75
/** Elle roule en +x, sur la voie du trottoir. */
export const VAN_LANE_Z = -3.4
const VAN_START = -(VAN_SPEED * (VAN_TRIP - VAN_BRAKING) + (VAN_SPEED * VAN_BRAKING) / 2)

/** Position de la camionnette : elle arrive vite, freine, s'arrête devant lui en x = 0. */
export function vanX(t: number): number {
  const k = t - T.van
  if (k <= 0) return VAN_START
  if (k >= VAN_TRIP) return 0
  const left = VAN_TRIP - k
  if (left <= VAN_BRAKING) return (-(VAN_SPEED / (2 * VAN_BRAKING)) * left * left)
  return VAN_START + VAN_SPEED * k
}

/** Elle plonge sur ses amortisseurs au freinage, puis se redresse. */
export function vanDip(t: number): number {
  const k = t - (T.van + VAN_TRIP - VAN_BRAKING)
  if (k < 0) return 0
  return k < VAN_BRAKING ? -0.035 * ease(k / VAN_BRAKING) : -0.035 * Math.exp(-(k - VAN_BRAKING) * 5) * Math.cos((k - VAN_BRAKING) * 11)
}

/** La porte coulissante (0..1) : même date que le son `van-door`. */
export function doorOpen(t: number): number {
  return ease((t - (T.door + 0.3)) / 0.82)
}

/** Les phares s'allument avec le trajet, au loin dans le brouillard. */
export const vanLights = (t: number) => (t < T.van ? 0 : 1)

// --- Le joueur -----------------------------------------------------------------

export interface HeadPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
}

const RUN_SPEED = 4.6
const RUN_START = T.run + 0.15
const EYE = 1.72

const playerX = (t: number) => Math.max(0, t - RUN_START) * RUN_SPEED
const playerZ = (t: number) => 0.55 * ease((t - (T.door + 0.8)) / 1)

/** Interpole des clés (temps, valeur) en douceur. */
function keys(t: number, frames: readonly (readonly [number, number])[]): number {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    const [t0, v0] = frames[i - 1]
    if (t < t1) return lerp(v0, v1, ease((t - t0) / (t1 - t0)))
  }
  return frames[frames.length - 1][1]
}

/** Tourné vers la camionnette, à l'arrivée elle est droit devant. */
const yawToVan = (t: number) => Math.atan2(-vanX(t), -VAN_LANE_Z)

/** La tête au fil de l'intro. */
export function headPose(t: number): HeadPose {
  // Lacet : la rue, puis la camionnette qu'il suit des yeux, puis sa fuite, puis derrière lui.
  const turnToVan = ease((t - (T.van + 0.25)) / 1.3)
  let yaw = turnToVan * yawToVan(t)
  yaw += ease((t - T.run) / 0.38) * (-Math.PI / 2 - yaw)
  // Il jette un œil par-dessus l'épaule, et voit la batte.
  yaw += ease((t - T.swing) / 0.24) * 2.95

  const pitch = keys(t, [
    [T.pocket, -0.12],
    [T.pocket + 1.1, -0.3],
    [T.look + 0.3, -0.26],
    [T.look + 2.3, 0.52],
    [T.van + 0.25, 0.52],
    [T.van + 1.4, 0.02],
    [T.run, -0.02],
    [T.run + 0.4, -0.08],
    [T.swing, -0.06],
    [T.swing + 0.24, 0.1],
  ])

  // Il court : la tête saute à chaque foulée.
  const running = ease((t - T.run) / 0.3)
  const stride = (t - T.run) * 10.2
  const sway = Math.sin(t * 0.6) * 0.006
  const bob = Math.abs(Math.sin(stride)) * 0.075 * running
  // Il a peur : la tête tremble dès la porte ouverte.
  const fear = ease((t - T.door) / 1.2)
  const shiver = Math.sin(t * 31) * 0.0028 * fear * (1 - running)

  return {
    x: playerX(t) + Math.sin(stride / 2) * 0.05 * running,
    y: EYE + sway + bob - 0.04 * running,
    z: playerZ(t),
    yaw: yaw + Math.sin(t * 0.37) * 0.012 + shiver,
    pitch: pitch + Math.cos(stride) * 0.018 * running + Math.sin(t * 0.5) * 0.008,
    roll: Math.sin(stride / 2) * 0.03 * running + Math.sin(t * 0.3) * 0.006,
  }
}

// --- L'homme à la batte --------------------------------------------------------

export interface ChaserPose {
  visible: boolean
  x: number
  z: number
  /** Vitesse de la foulée (0 : immobile). */
  stride: number
  /** La batte : tenue basse (0), levée (1). */
  raise: number
  /** Le coup (0..1) : à 1, la batte arrive sur le visage. */
  strike: number
}

const CHASE_GAP = 1.02

/** Il sort de la camionnette, marche sur lui, le rattrape. */
export function chaserPose(t: number): ChaserPose {
  const out = T.door + 0.7
  const stepped = T.door + 1.25
  const caught = playerX(T.swing) - CHASE_GAP
  if (t < out) return { visible: false, x: -0.35, z: VAN_LANE_Z + 0.2, stride: 0, raise: 0, strike: 0 }
  if (t < T.run) {
    const k = ease((t - out) / (T.run - out))
    const stepping = t < stepped ? 0 : 0.6
    return { visible: true, x: lerp(-0.35, -0.15, k), z: lerp(VAN_LANE_Z + 0.2, -1.1, k), stride: stepping, raise: 0.2 * k, strike: 0 }
  }
  if (t < T.swing) {
    const k = (t - T.run) / (T.swing - T.run)
    return { visible: true, x: lerp(-0.15, caught, k ** 1.15), z: lerp(-1.1, playerZ(t), easeOut(k)), stride: 1.6, raise: lerp(0.2, 0.6, k), strike: 0 }
  }
  return {
    visible: true,
    x: playerX(t) - CHASE_GAP,
    z: playerZ(t),
    stride: 1.1,
    raise: lerp(0.6, 1, easeOut((t - T.swing) / 0.2)),
    strike: clamp01((t - (T.swing + 0.22)) / (T.black - T.swing - 0.22)) ** 1.6,
  }
}

/** Un deuxième homme reste à la porte, éclairé de dos par le plafonnier. */
export const accompliceOut = (t: number) => t >= T.door + 0.95
