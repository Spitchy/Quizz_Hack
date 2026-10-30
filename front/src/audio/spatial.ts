import { isFloor, tileAt, type Maze } from '../maze/generate'
import type { Vec2 } from '../maze/physics'
import type { Archetype } from '../scene/entities/archetypes'
import type { SoundName } from './recipes'

// Son dans l'espace, en fonctions pures : ce que les murs étouffent, quelles
// sources méritent une voix (le nombre de voix est fixe), et la signature de
// chaque monstre.

const SAMPLE_STEP = 0.25

/** Épaisseur de mur (m) traversée entre deux points : 0 quand ils se voient. */
export function wallDepth(maze: Maze, a: Vec2, b: Vec2): number {
  const distance = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.ceil(distance / SAMPLE_STEP)
  let inside = 0
  for (let i = 1; i < steps; i++) {
    const t = tileAt(a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps)
    if (!isFloor(maze, t.x, t.y)) inside++
  }
  return steps > 0 ? (inside / steps) * distance : 0
}

export interface Occlusion {
  /** Coupure du passe-bas (Hz). */
  cutoff: number
  gain: number
}

/** À vue, le son est entier ; derrière un mur, il ne reste que le grave. */
export function occlusionFor(depth: number): Occlusion {
  if (depth <= 0) return { cutoff: 16000, gain: 1 }
  return {
    cutoff: Math.max(240, 1100 / (1 + depth * 0.55)),
    gain: Math.max(0.28, 0.82 / (1 + depth * 0.22)),
  }
}

/** Indices des `max` positions les plus proches à moins de `range` m, de la plus proche à la plus lointaine. */
export function nearest(positions: readonly Vec2[], from: Vec2, max: number, range: number): number[] {
  const within: { i: number; d: number }[] = []
  positions.forEach((p, i) => {
    const d = (p.x - from.x) ** 2 + (p.z - from.z) ** 2
    if (d <= range * range) within.push({ i, d })
  })
  return within
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((v) => v.i)
}

export type VoiceMood = 'calm' | 'angry' | 'menace'

export interface VoiceProfile {
  /** Présence en boucle autour du monstre. */
  bed: SoundName
  gain: number
  /** Distance (m) où le son commence à décroître. */
  ref: number
  /** Cri ou réaction à une mauvaise réponse. */
  anger: SoundName
  /** Bruit d'un pas pendant la marche de la défaite. */
  step: SoundName
  height: number
}

export const VOICES: Record<Archetype, VoiceProfile> = {
  crt: { bed: 'bed-crt', gain: 0.62, ref: 1.5, anger: 'anger-crt', step: 'step-hard', height: 1.7 },
  mannequin: { bed: 'bed-mannequin', gain: 0.85, ref: 1.6, anger: 'anger-mannequin', step: 'step-plastic', height: 1.4 },
  cluster: { bed: 'bed-cluster', gain: 0.8, ref: 1.8, anger: 'anger-cluster', step: 'step-wet', height: 0.9 },
  crawler: { bed: 'bed-crawler', gain: 0.75, ref: 1.6, anger: 'anger-crawler', step: 'step-skitter', height: 0.4 },
  child: { bed: 'bed-child', gain: 0.52, ref: 1.4, anger: 'anger-child', step: 'step-small', height: 1.1 },
  tall: { bed: 'bed-tall', gain: 1, ref: 3, anger: 'anger-tall', step: 'step-heavy', height: 2.4 },
}

/** Niveau de la présence selon l'humeur : elle enfle avec la colère. */
export function moodGain(mood: VoiceMood): number {
  return mood === 'calm' ? 0.62 : mood === 'angry' ? 0.85 : 1
}

/** La voix traîne et descend quand le monstre est fâché (l'enfant qui chantonne faux). */
export function moodRate(mood: VoiceMood): number {
  return mood === 'calm' ? 1 : mood === 'angry' ? 0.92 : 0.84
}
