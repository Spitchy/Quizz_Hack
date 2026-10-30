import { createRandom, hashSeed, pick } from '../../maze/random'

// Six monstres réellement différents (silhouette, matières, couleurs, gestuelle,
// colère, démarche, attaque). Les dix entités d'une partie se les partagent,
// jamais deux fois le même à la suite. Pur : testable sans Three.js.

export type Archetype = 'tall' | 'mannequin' | 'crawler' | 'child' | 'crt' | 'cluster'

export const ARCHETYPES: readonly Archetype[] = ['tall', 'mannequin', 'crawler', 'child', 'crt', 'cluster']

export const ARCHETYPE_NAMES: Record<Archetype, string> = {
  tall: 'Le Long',
  mannequin: 'Le Mannequin',
  crawler: 'La Rampante',
  child: "L'Enfant",
  crt: "L'Employé",
  cluster: "L'Amas",
}

export interface Palette {
  /** Matière principale (peau, plastique, ciré, costume…). */
  body: string
  /** Matière secondaire (articulations, bottes, écran, chair interne…). */
  secondary: string
  /** Yeux / lueur au repos (jamais le rouge, réservé à la colère). */
  glow: string
}

const PALETTES: Record<Archetype, readonly Palette[]> = {
  tall: [
    { body: '#06070b', secondary: '#141018', glow: '#e8e4d8' },
    { body: '#0b0507', secondary: '#1d0d10', glow: '#f0e6c8' },
  ],
  mannequin: [
    { body: '#cdb8a2', secondary: '#9c8774', glow: '#2a2622' },
    { body: '#c9c4bd', secondary: '#8f8a84', glow: '#24242a' },
    { body: '#c99d97', secondary: '#9a6f69', glow: '#2b1d1b' },
  ],
  crawler: [
    { body: '#4c5a46', secondary: '#2b3326', glow: '#d6e36a' },
    { body: '#7d776b', secondary: '#4a463e', glow: '#e8d9a0' },
    { body: '#5a4a5e', secondary: '#33283a', glow: '#c9c2f0' },
  ],
  child: [
    { body: '#b8972e', secondary: '#2a2620', glow: '#f2efe4' },
    { body: '#2f5f63', secondary: '#1b2224', glow: '#f2efe4' },
    { body: '#6e2e5a', secondary: '#1f1a1f', glow: '#f2efe4' },
  ],
  crt: [
    { body: '#3a3d42', secondary: '#9bdc8a', glow: '#9bdc8a' },
    { body: '#4a3b2c', secondary: '#e3b55a', glow: '#e3b55a' },
    { body: '#22293a', secondary: '#8fc7e8', glow: '#8fc7e8' },
  ],
  cluster: [
    { body: '#4a1520', secondary: '#7a3340', glow: '#f2e8d0' },
    { body: '#3a1d3a', secondary: '#6b3a6b', glow: '#e8f0d0' },
    { body: '#5c4a22', secondary: '#8a7238', glow: '#f2f2e0' },
  ],
}

/** Hauteur du centre du panneau tenu par chaque monstre (m). */
export const SIGN_HEIGHT: Record<Archetype, number> = {
  tall: 1.42,
  mannequin: 1.36,
  crawler: 1.5,
  child: 1.72,
  crt: 1.38,
  cluster: 1.48,
}

export interface EntityLook {
  archetype: Archetype
  palette: Palette
  /** Décalage de phase : les entités ne bougent pas à l'unisson. */
  phase: number
  /** Petite variation de taille (0,94–1,06). */
  scale: number
  /** Suit le joueur du regard quand il passe. */
  watches: boolean
}

export function entityLook(seed: number, id: number): EntityLook {
  const random = createRandom(hashSeed(`${seed}:${id}`))
  // Rotation des archétypes avec un décalage propre à la partie : tous
  // représentés sur dix entités, jamais deux identiques de suite.
  const offset = hashSeed(String(seed)) % ARCHETYPES.length
  const archetype = ARCHETYPES[(id + offset) % ARCHETYPES.length]
  return {
    archetype,
    palette: pick(random, PALETTES[archetype]),
    phase: random() * Math.PI * 2,
    scale: 0.94 + random() * 0.12,
    watches: random() < 0.6,
  }
}
