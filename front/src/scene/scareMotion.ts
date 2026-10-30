import { SCARE_TIMELINE, stageStart, type ScareStage } from '../app/sequence'

// Le dossier refermé, en fonctions pures : quelle lampe meurt quand, combien de
// lumière reste, où regarde le joueur, où se tient le médecin, où tombe la lampe
// torche. La scène ne fait que lire. Une fois le noir tombé, tout est écrit ici.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const ease = (k: number) => {
  const x = clamp01(k)
  return x * x * (3 - 2 * x)
}

const duration = (stage: ScareStage, next: ScareStage) => stageStart(SCARE_TIMELINE, next) - stageStart(SCARE_TIMELINE, stage)

/** Durée de chaque étape (s). */
export const SCARE_SECONDS = {
  dim: duration('dim', 'dark'),
  dark: duration('dark', 'torch'),
  torch: duration('torch', 'jump'),
  jump: duration('jump', 'kick'),
  kick: duration('kick', 'drop'),
  drop: duration('drop', 'pick'),
  pick: duration('pick', 'search'),
  search: duration('search', 'restore'),
  restore: duration('restore', 'done'),
} as const

/** Dans `torch` : la lampe s'allume (s). */
export const TORCH_ON = 0.3
/** Dans `torch` : pendant qu'il regarde à gauche, le médecin s'est placé dans le noir, droit devant (s). */
export const DOCTOR_WAITS = 3.3
/** Dans `torch` : le faisceau revient au centre et le trouve (s). */
export const GLIMPSE = 4.25
/** Dans `jump` : le noir d'un instant, puis il est là (s). */
export const JUMP_AT = 0.24
/** Dans `kick` : la semelle arrive sur sa poitrine, la lampe lui échappe (s). */
export const KICK_IMPACT = 0.2
/** Dans `drop` : il n'est déjà plus là, personne ne l'a vu partir (s). */
export const DOCTOR_LEAVES = 0.45
/** Dans `pick` : la main referme la lampe (s). */
export const PICK_GRAB = 0.62

// --- Les lampes ----------------------------------------------------------------

/** Les dernières lampes s'éteignent une à une ; les plus lointaines partent d'abord, en vrac. */
const LAST_LAMPS = 9
const FAR_WAVE = 1.1
const LAST_LAMP_AT = SCARE_SECONDS.dim - 1.1
/** Une lampe grésille avant de mourir (s). */
const STUTTER = 0.5

/**
 * Quand meurt chaque lampe (s depuis le début), d'après sa distance au joueur au
 * moment où il referme le dossier. La plus proche meurt la dernière.
 */
export function lampDeaths(distances: readonly number[]): number[] {
  const order = distances.map((_, i) => i).sort((a, b) => distances[b] - distances[a])
  const deaths = new Array<number>(distances.length)
  const far = Math.max(0, order.length - LAST_LAMPS)
  order.forEach((lamp, rank) => {
    if (rank < far) {
      deaths[lamp] = 0.3 + (rank / Math.max(1, far)) * FAR_WAVE
    } else {
      const k = (rank - far + 1) / Math.max(1, order.length - far)
      deaths[lamp] = lerp(FAR_WAVE + 0.5, LAST_LAMP_AT, k)
    }
  })
  return deaths
}

/** Tube qui cherche à tenir : allumé, éteint, sans rien de doux. */
function stutter(since: number, index: number): number {
  return Math.sin(since * 53 + index * 2.7) + Math.sin(since * 21 + index) > 0 ? 1 : 0.1
}

const RETURN_RANGE = 24

/** Elle se rallume, du joueur vers le fond du couloir (s depuis le début du retour). */
function lampReturn(distance: number): number {
  return clamp01(distance / RETURN_RANGE) * (SCARE_SECONDS.restore * 0.6) + 0.15
}

/** Part de lumière (0..1) laissée à une lampe. `death` : son heure, en `dim`. */
export function scareLampLevel(stage: ScareStage | null, since: number, death: number, distance: number, index: number): number {
  if (stage === null || stage === 'done') return 1
  if (stage === 'dim') {
    if (since >= death) return 0
    return since >= death - STUTTER ? stutter(since, index) : 1
  }
  if (stage === 'restore') {
    const back = lampReturn(distance)
    if (since < back) return 0
    return since < back + STUTTER ? stutter(since, index) : 1
  }
  return 0
}

/** Noir total : plus aucune lueur, ni cadran, ni yeux d'entité, ni couleur de brouillard. */
export function isPitchBlack(stage: ScareStage | null): boolean {
  return stage !== null && stage !== 'dim' && stage !== 'restore' && stage !== 'done'
}

/** Il garde la main pendant que les lampes meurent. Une fois le noir tombé, la scène est écrite. */
export function canWalk(stage: ScareStage | null): boolean {
  return stage === null || stage === 'dim' || stage === 'done'
}

/** Le dossier a disparu : dans le noir, jamais sous ses yeux. */
export function fileVanished(stage: ScareStage | null): boolean {
  return stage !== 'dim'
}

/** Le halo qui le suit (0..1) : il meurt le dernier, et ne revient qu'avec les lampes. */
export function scareHalo(stage: ScareStage, since: number): number {
  if (stage === 'dim') {
    const left = SCARE_SECONDS.dim - since
    if (left <= 0.15) return 0
    return left < 0.9 ? stutter(since, 40) : 1
  }
  if (stage === 'restore') return since < 0.15 ? 0 : since < 0.7 ? stutter(since, 40) : 1
  return stage === 'done' ? 1 : 0
}

// --- La lampe torche -----------------------------------------------------------

/** La lampe (0..1) : elle s'allume mal, vacille quand il le voit, tombe sans s'éteindre. */
export function torchLevel(stage: ScareStage | null, since: number): number {
  switch (stage) {
    case 'torch': {
      if (since < TORCH_ON) return 0
      if (since < TORCH_ON + 0.28) return stutter(since, 7)
      if (since >= SCARE_SECONDS.torch - 0.55) return stutter(since * 1.3, 11)
      // Un faux contact, une fois : juste assez pour se méfier.
      return since > 2.55 && since < 2.72 ? 0.25 : 1
    }
    case 'jump':
      return since < JUMP_AT ? 0 : 1
    case 'kick':
      return 0.9 + 0.1 * stutter(since, 3)
    case 'drop':
      // Le choc au sol : elle hésite, puis tient.
      return since < 0.5 ? stutter(since * 0.6, 5) * 0.85 : 0.85
    case 'pick':
    case 'search':
      return 0.9
    case 'restore':
      return since < 0.75 ? 0.9 * (1 - ease(since / 0.75)) : 0
    default:
      return 0
  }
}

export type TorchHold = 'none' | 'held' | 'free'

/** La lampe est-elle dans sa main, ou par terre ? */
export function torchHold(stage: ScareStage | null, since: number): TorchHold {
  switch (stage) {
    case 'torch':
    case 'jump':
    case 'search':
    case 'restore':
      return 'held'
    case 'kick':
      return since < KICK_IMPACT ? 'held' : 'free'
    case 'drop':
      return 'free'
    case 'pick':
      return since < PICK_GRAB ? 'free' : 'held'
    default:
      return 'none'
  }
}

/** Le bras (0 : baissé hors de l'image, 1 : levé). Au sol, c'est le geste vers la lampe qui compte. */
export function torchRaise(stage: ScareStage | null, since: number): number {
  switch (stage) {
    case 'torch':
      return ease(since / 0.55)
    case 'jump':
    case 'search':
      return 1
    case 'kick':
      // La lampe part, la main reste ouverte, puis retombe.
      return since < KICK_IMPACT ? 1 : 1 - ease((since - KICK_IMPACT) / 0.3)
    case 'pick':
      return 1
    case 'restore':
      return 1 - ease((since - 0.45) / 0.7)
    default:
      return 0
  }
}

/** La main vers la lampe au sol (0 : hors de l'image, 1 : dessus), puis remontée (2 : levée). */
export function pickReach(stage: ScareStage | null, since: number): number {
  if (stage !== 'pick') return stage === 'search' || stage === 'restore' ? 2 : 0
  if (since < PICK_GRAB) return ease(since / PICK_GRAB)
  return 1 + ease((since - PICK_GRAB) / (SCARE_SECONDS.pick - PICK_GRAB))
}

/** Là où elle finit, dans le repère du couloir : devant lui, un peu à droite (m). */
export const TORCH_REST = { forward: 0.52, right: 0.22 } as const

export interface TorchFall {
  /** De sa main (0) à son point de chute (1). */
  along: number
  /** Hauteur (m), une fois au sol : 0,06. */
  height: number
  /** Cap du faisceau par rapport au couloir (rad, 0 : droit devant, négatif : à droite). */
  heading: number
  /** Le faisceau bascule pendant la chute (rad). */
  tumble: number
}

const FALL_TIME = 0.42
/** Elle s'arrête en éclairant le mur, jamais le fond du couloir : il ne reste rien à voir. */
const REST_HEADING = -1.42
/** Couchée, la tête de la lampe penche : sa lumière fait une flaque sur la moquette, qu'il voit (rad). */
const REST_TILT = 0.2

/** La lampe qui tombe, `t` secondes après lui avoir échappé : elle rebondit, roule, s'arrête. */
export function torchFall(t: number, handHeight: number): TorchFall {
  const k = clamp01(t / FALL_TIME)
  const rest = 0.06
  let height = lerp(handHeight, rest, k * k)
  const after = t - FALL_TIME
  if (after > 0 && after < 0.26) height = rest + Math.sin((after / 0.26) * Math.PI) * 0.09
  return {
    along: ease(t / 0.9),
    height,
    // Elle tourne sur elle-même et balaie tout le couloir, de moins en moins vite.
    heading: REST_HEADING - 9.5 * Math.exp(-t * 2.3),
    tumble: after < 0 ? Math.sin(t * 19) * 0.9 : REST_TILT,
  }
}

/** Où le faisceau accroche quelqu'un (0..1), d'après le cosinus de l'angle avec l'axe de la lampe. */
export function caughtByBeam(cosAngle: number): number {
  return clamp01((cosAngle - 0.88) / 0.08)
}

// --- Son regard ----------------------------------------------------------------

/** Autant vers la droite que vers la gauche (rad). */
const SWEEP = 1.15

function keys(t: number, frames: readonly (readonly [number, number])[]): number {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    const [t0, v0] = frames[i - 1]
    if (t < t1) return lerp(v0, v1, ease((t - t0) / (t1 - t0)))
  }
  return frames[frames.length - 1][1]
}

export interface ScareLook {
  /** Écart de lacet par rapport au couloir (négatif : à droite). */
  yaw: number
  pitch: number
  /** Il se baisse (m). */
  crouch: number
}

/** Vers la lampe, au sol : ni trop loin, ni dans ses pieds. */
const TOWARD_TORCH = -Math.atan2(TORCH_REST.right, TORCH_REST.forward)

/** Où il regarde, une fois le noir tombé. Tout est écrit : il ne touche plus à rien. */
export function scareLook(stage: ScareStage, since: number): ScareLook {
  switch (stage) {
    case 'torch':
      return {
        yaw: keys(since, [
          [0.8, 0],
          [1.65, -SWEEP],
          [2.25, -SWEEP],
          [3.3, SWEEP],
          [3.65, SWEEP],
          [GLIMPSE, 0],
        ]),
        pitch: keys(since, [
          [0, -0.05],
          [1.65, -0.02],
          [2.25, 0.02],
          [3.3, -0.05],
          [GLIMPSE, 0],
        ]),
        crouch: 0,
      }
    case 'jump':
      // Il lui tombe dessus : la tête part en arrière, le regard reste planté dans le sien.
      return { yaw: 0, pitch: since < JUMP_AT ? 0.02 : lerp(0.02, 0.1, ease((since - JUMP_AT) / 0.25)), crouch: 0 }
    case 'kick':
      return { yaw: 0, pitch: lerp(0.1, 0.02, ease(since / 0.35)), crouch: 0 }
    case 'drop':
      // Sonné ; il cherche la lumière, et la trouve par terre.
      return { yaw: keys(since, [[0.55, 0], [1.2, TOWARD_TORCH]]), pitch: keys(since, [[0.55, 0], [1.3, -0.9]]), crouch: 0 }
    case 'pick':
      return {
        yaw: keys(since, [[PICK_GRAB, TOWARD_TORCH], [SCARE_SECONDS.pick, 0]]),
        pitch: keys(since, [[0, -0.9], [PICK_GRAB, -0.82], [SCARE_SECONDS.pick, 0]]),
        crouch: keys(since, [[0, 0], [PICK_GRAB, 1.02], [SCARE_SECONDS.pick, 0]]),
      }
    case 'search':
      // Il braque le couloir : personne. À droite, à gauche : personne.
      return {
        yaw: keys(since, [[0.7, 0], [1.25, -0.5], [1.6, -0.5], [2.1, 0.5], [2.4, 0.5], [SCARE_SECONDS.search, 0]]),
        pitch: 0,
        crouch: 0,
      }
    default:
      return { yaw: 0, pitch: 0, crouch: 0 }
  }
}

// --- Le médecin ----------------------------------------------------------------

/** Le visage arrive tout près, jamais dans l'objectif (m). */
export const DOCTOR_CLOSEST = 1.22

/** Distance du médecin au joueur (m), le long d'un couloir de `reach` mètres. Null : il n'est pas là. */
export function doctorDistance(stage: ScareStage, since: number, reach: number): number | null {
  const thrown = Math.max(reach, 2.4) - 0.3
  switch (stage) {
    case 'torch':
      // Dans le noir, immobile : il n'y a que la lampe pour le montrer.
      return since >= DOCTOR_WAITS ? Math.max(3, Math.min(reach, 6.2)) : null
    case 'jump':
      if (since < JUMP_AT) return null
      return lerp(1.55, DOCTOR_CLOSEST, ease((since - JUMP_AT) / 0.22))
    case 'kick':
      if (since < KICK_IMPACT) return DOCTOR_CLOSEST
      // Projeté en arrière, de plus en plus lentement.
      return DOCTOR_CLOSEST + (thrown - DOCTOR_CLOSEST) * (1 - Math.exp(-(since - KICK_IMPACT) * 3.2))
    case 'drop':
      return since < DOCTOR_LEAVES ? thrown : null
    default:
      return null
  }
}

/** Il tombe sur lui : la hauteur de son saut (m). */
export function doctorLeap(stage: ScareStage, since: number): number {
  if (stage !== 'jump' || since < JUMP_AT) return 0
  const k = (since - JUMP_AT) / 0.26
  return k >= 1 ? 0 : 0.34 * (1 - k) * (1 - k)
}

/** La main s'approche de l'œil, lentement, le temps qu'il comprenne (0..1). */
export function needleCreep(stage: ScareStage, since: number): number {
  if (stage === 'kick') return 1
  if (stage !== 'jump' || since < JUMP_AT) return 0
  return ease((since - JUMP_AT) / (SCARE_SECONDS.jump - JUMP_AT))
}

/** Le pied (0..1) : la jambe monte, se détend, retombe. Le sommet tombe sur l'impact. */
export function kickReach(since: number): number {
  if (since < 0 || since > 0.62) return 0
  if (since < KICK_IMPACT) return ease(since / KICK_IMPACT)
  return 1 - ease((since - KICK_IMPACT) / (0.62 - KICK_IMPACT))
}
