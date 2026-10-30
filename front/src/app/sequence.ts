import { useCallback, useEffect, useState } from 'react'

// Mise en scène des fins de partie : des étapes datées, déclenchées par
// `gameStatus` du serveur. Uniquement visuel, dans l'onglet.

export type Timeline<S extends string> = readonly (readonly [S, number])[]

/**
 * Défaite : le joueur se fige, les lumières meurent (première personne). Coupe
 * sur la caméra de surveillance du couloir : les entités qu'il a fâchées
 * arrivent, l'entourent et le rouent de coups jusqu'à ce qu'il s'effondre dans
 * son sang. Noir. Réveil sanglé sur une chaise ; le médecin entre par la
 * porte, l'injecte. GAME OVER.
 */
export type DefeatStage = 'freeze' | 'approach' | 'beat' | 'knockout' | 'wake' | 'inject' | 'infected' | 'over'
export const DEFEAT_TIMELINE: Timeline<DefeatStage> = [
  ['freeze', 0],
  ['approach', 1600],
  ['beat', 7800],
  ['knockout', 13800],
  ['wake', 15200],
  ['inject', 20800],
  ['infected', 27600],
  ['over', 30200],
]
/** Durées (s) de la marche des entités, du passage à tabac, du réveil et de l'injection. */
export const APPROACH_SECONDS = (7800 - 1600) / 1000
export const BEAT_SECONDS = (13800 - 7800) / 1000
export const WAKE_SECONDS = (20800 - 15200) / 1000
export const INJECT_SECONDS = (27600 - 20800) / 1000
/** Étapes filmées par la caméra de surveillance (troisième personne). */
export const CCTV_STAGES: readonly DefeatStage[] = ['approach', 'beat']

/**
 * Victoire : la dernière entité se désintègre, la lumière envahit le
 * labyrinthe, éblouissement. Pièce blanche, le joueur marche jusqu'à la porte ;
 * elle s'ouvre sur la lumière, il la traverse, écran final.
 */
export type VictoryStage = 'release' | 'whiteout' | 'room' | 'door' | 'through' | 'screen'
export const VICTORY_TIMELINE: Timeline<VictoryStage> = [
  ['release', 0],
  ['whiteout', 2600],
  ['room', 4100],
]
/** Après l'arrivée à la porte : ouverture, traversée, écran final (ms). */
export const DOOR_TIMELINE: Timeline<VictoryStage> = [
  ['door', 0],
  ['through', 1300],
  ['screen', 3100],
]

/** Étape en cours `elapsed` ms après le début de la séquence. */
export function stageAt<S extends string>(timeline: Timeline<S>, elapsed: number): S {
  let current = timeline[0][0]
  for (const [stage, at] of timeline) if (elapsed >= at) current = stage
  return current
}

export interface Hit {
  /** Index de l'entité qui frappe (dans l'ordre des assaillants). */
  attacker: number
  /** Instant du coup (s) depuis le début du passage à tabac. */
  at: number
}

/** Écart entre deux arrivées (s) : elles se jettent sur lui l'une après l'autre. */
const ARRIVAL_SPACING = 0.5
/** La dernière arrive au plus tard à ce moment du passage à tabac. */
const LAST_ARRIVAL = 2.6
/** Du dernier coup au noir (s) : la coupure tombe en plein passage à tabac. */
const CUT_AFTER_LAST_HIT = 0.35

/** Instant où l'assaillant de rang `rank` (la plus proche d'abord) arrive, depuis le début du passage à tabac. */
export function arrivalAt(rank: number): number {
  return Math.min(LAST_ARRIVAL, rank * ARRIVAL_SPACING)
}

/** Variation de rythme, reproductible : elles ne frappent pas comme un métronome. */
function jitter(n: number): number {
  const s = Math.sin(n * 91.73 + 4.1) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Coups du passage à tabac. Chacune frappe dès son arrivée et ne s'arrête plus,
 * à son propre rythme, jusqu'à la coupure : personne n'attend son tour en le
 * regardant. Le rythme s'adapte au nombre d'assaillants, pour rester lisible.
 */
export function beatSchedule(attackers: number, duration = BEAT_SECONDS): Hit[] {
  if (attackers <= 0) return []
  const end = duration - CUT_AFTER_LAST_HIT
  const interval = Math.max(0.72, attackers * 0.24)
  const hits: Hit[] = []
  for (let attacker = 0; attacker < attackers; attacker++) {
    let at = arrivalAt(attacker) + 0.08
    for (let n = 0; at <= end; n++) {
      hits.push({ attacker, at })
      at += interval * (0.86 + 0.28 * jitter(attacker * 13 + n))
    }
  }
  return hits.sort((a, b) => a.at - b.at)
}

/**
 * Le corps cède sous les coups (0..1, d'après la part des coups reçus) :
 * debout, puis à genoux, puis à terre.
 */
export function collapseAt(hitsTaken: number, totalHits: number): { kneel: number; fall: number } {
  if (totalHits <= 0) return { kneel: 0, fall: 0 }
  const k = hitsTaken / totalHits
  const smooth = (a: number, b: number) => {
    const x = Math.min(1, Math.max(0, (k - a) / (b - a)))
    return x * x * (3 - 2 * x)
  }
  return { kneel: smooth(0.3, 0.6), fall: smooth(0.6, 0.85) }
}

/**
 * Rejoue la séquence depuis le début à chaque nouvelle `runKey` (`null` = inactive).
 * Les étapes ne reviennent jamais en arrière ; `skip` saute à la dernière.
 */
export function useTimeline<S extends string>(timeline: Timeline<S>, runKey: string | null) {
  const [state, setState] = useState<{ key: string; index: number } | null>(null)
  useEffect(() => {
    if (runKey === null) return
    const timers = timeline.map(([, at], index) =>
      setTimeout(
        () => setState((prev) => (prev?.key === runKey && prev.index >= index ? prev : { key: runKey, index })),
        at,
      ),
    )
    return () => timers.forEach(clearTimeout)
  }, [timeline, runKey])
  const skip = useCallback(() => {
    if (runKey !== null) setState({ key: runKey, index: timeline.length - 1 })
  }, [runKey, timeline])
  /** Outil de test : rejouer une étape précise (les minuteries déjà passées ne reviennent pas). */
  const jump = useCallback(
    (stage: S) => {
      const index = timeline.findIndex(([s]) => s === stage)
      if (runKey !== null && index >= 0) setState({ key: runKey, index })
    },
    [runKey, timeline],
  )
  const index = runKey !== null && state?.key === runKey ? state.index : 0
  return { stage: runKey === null ? null : timeline[index][0], skip, jump }
}
