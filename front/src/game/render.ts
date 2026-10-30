import type { EntityState } from '../api/client'
import type { GameSnapshot, Phase } from './types'

// Traduction de l'état serveur (`visualFeedback`) et de la phase en états de
// rendu, consommés tels quels par la scène 3D et le HUD. Pur, sans React ni Three.

export type EntityMood = 'calm' | 'angry' | 'smiling' | 'gone'

export interface EntityRender {
  mood: EntityMood
  visible: boolean
  /** Noir total : seul le sourire de l'entité est rendu. */
  smileOnly: boolean
}

export interface SignRender {
  broken: boolean
  /** Le texte de la question est lisible sur le panneau. */
  showQuestion: boolean
}

export interface EntitySlotRender {
  entity: EntityRender
  sign: SignRender
  /** Le joueur lit ce panneau en ce moment. */
  engaged: boolean
  /** Entité déjà interrogée : on ne peut plus l'aborder. */
  resolved: boolean
}

export interface WorldRenderState {
  lightsOff: boolean
  /** 0..1 — tremblement de caméra déclenché par l'événement courant. */
  shake: number
  /** 0..1 — part des erreurs autorisées déjà commises ; pilote la dégradation de l'image. */
  danger: number
}

export type Screen = 'title' | 'loading' | 'explore' | 'question' | 'victory' | 'defeat' | 'error'

export interface HudState {
  visible: boolean
  score: number
  scoreMax: number
  errors: number
  maxErrors: number
  /** 0..100, arrondi — affiché comme « INFECTION: 48% ». */
  infectionPercent: number
  /** Entités déjà interrogées. */
  found: number
  totalIntersections: number
  level: number
}

const ENTITY_BY_STATE: Record<EntityState, EntityRender> = {
  CALM: { mood: 'calm', visible: true, smileOnly: false },
  ANGRY: { mood: 'angry', visible: true, smileOnly: false },
  SMILING_IN_DARK: { mood: 'smiling', visible: true, smileOnly: true },
  VANISHED: { mood: 'gone', visible: false, smileOnly: false },
}

/** Entité pas encore abordée, ou dont la réaction n'est pas encore venue. */
const AWAITING: EntityRender = ENTITY_BY_STATE.CALM
const GONE: EntityRender = ENTITY_BY_STATE.VANISHED
const SMILING: EntityRender = ENTITY_BY_STATE.SMILING_IN_DARK

/** Entités qui se ruent sur le joueur à la défaite : celles qu'il a fâchées, plus la dernière. */
export function upsetEntities(snapshot: GameSnapshot): number[] {
  if (snapshot.phase !== 'gameOver') return []
  const upset = snapshot.encounters.filter((e) => !e.isCorrect).map((e) => e.entity)
  if (snapshot.engagedEntity !== null && !upset.includes(snapshot.engagedEntity)) upset.push(snapshot.engagedEntity)
  return upset
}

const SCREEN_BY_PHASE: Record<Phase, Screen> = {
  idle: 'title',
  starting: 'loading',
  exploring: 'explore',
  question: 'question',
  submitting: 'question',
  feedback: 'question',
  victory: 'victory',
  gameOver: 'defeat',
  error: 'error',
}

const HUD_PHASES: readonly Phase[] = ['exploring', 'question', 'submitting', 'feedback']
/** Phases où l'entité abordée réagit (état visuel du serveur). */
const REACTION_PHASES: readonly Phase[] = ['feedback', 'victory', 'gameOver']

export function toScreen(snapshot: GameSnapshot): Screen {
  return SCREEN_BY_PHASE[snapshot.phase]
}

export function dangerLevel({ errors, maxErrors }: GameSnapshot): number {
  if (maxErrors <= 0) return 0
  return Math.min(1, Math.max(0, errors / maxErrors))
}

export function toWorldState(snapshot: GameSnapshot): WorldRenderState {
  const engaged = snapshot.engagedEntity === null ? null : toEntityState(snapshot, snapshot.engagedEntity)
  return {
    lightsOff: snapshot.visualFeedback.lightsOff,
    shake: snapshot.phase === 'feedback' && engaged?.sign.broken ? 1 : 0,
    danger: dangerLevel(snapshot),
  }
}

export function toEntityState(snapshot: GameSnapshot, entity: number): EntitySlotRender {
  const { phase, visualFeedback } = snapshot

  if (snapshot.engagedEntity === entity) {
    // Réaction en cours : l'état visuel du serveur s'applique à cette entité.
    if (REACTION_PHASES.includes(phase)) {
      return {
        entity: { ...ENTITY_BY_STATE[visualFeedback.entityState] },
        sign: { broken: visualFeedback.signBroken, showQuestion: !visualFeedback.signBroken },
        engaged: true,
        resolved: true,
      }
    }
    return { entity: { ...AWAITING }, sign: { broken: false, showQuestion: true }, engaged: true, resolved: false }
  }

  const encounter = snapshot.encounters.find((e) => e.entity === entity)
  // Défaite : toutes les entités qu'on a fâchées reviennent, sourire dans le noir.
  if (encounter && !encounter.isCorrect && phase === 'gameOver') {
    return { entity: { ...SMILING }, sign: { broken: true, showQuestion: false }, engaged: false, resolved: true }
  }
  if (encounter) {
    // Une entité franchie (bonne réponse) se retire dans le noir. Une entité
    // trompée garde sa réaction (colère, panneau brisé) et reste là, à attendre.
    const frozen = encounter.visualFeedback
    if (encounter.isCorrect || !frozen) {
      return { entity: { ...GONE }, sign: { broken: false, showQuestion: false }, engaged: false, resolved: true }
    }
    return {
      entity: { ...ENTITY_BY_STATE[frozen.entityState] },
      sign: { broken: frozen.signBroken, showQuestion: false },
      engaged: false,
      resolved: true,
    }
  }

  return { entity: { ...AWAITING }, sign: { broken: false, showQuestion: false }, engaged: false, resolved: false }
}

export function toHudState(snapshot: GameSnapshot): HudState {
  return {
    visible: HUD_PHASES.includes(snapshot.phase),
    score: snapshot.score,
    scoreMax: snapshot.scoreMax,
    errors: snapshot.errors,
    maxErrors: snapshot.maxErrors,
    infectionPercent: Math.round(dangerLevel(snapshot) * 100),
    found: snapshot.intersectionIndex,
    totalIntersections: snapshot.totalIntersections,
    level: snapshot.currentLevel,
  }
}
