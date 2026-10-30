import type { SoundName } from './recipes'

// Enregistrements de `public/audio/` (voir `CREDITS.md`) : ils remplacent la
// version générée en code dès qu'ils sont décodés. Si un fichier manque ou que
// le navigateur ne sait pas le lire, le son généré reste : le jeu ne se tait pas.

const files = (name: string, count: number) => Array.from({ length: count }, (_, i) => `${name}-${i + 1}.wav`)

export const SAMPLE_FILES: Partial<Record<SoundName, readonly string[]>> = {
  'step-carpet': files('step-carpet', 4),
  'step-hard': files('step-hard', 4),
  'hit-flesh': files('hit-flesh', 6),
  'hit-bone': files('hit-bone', 4),
  splat: files('splat', 3),
  leather: files('leather', 4),
  'door-latch': files('door-latch', 1),
  'door-creak': files('door-creak', 1),
  stinger: files('stinger', 3),
  breath: files('breath', 1),
  'scream-child': files('scream-child', 2),
  'scream-crawler': files('scream-crawler', 2),
  'scream-mannequin': files('scream-mannequin', 2),
  'scream-cluster': files('scream-cluster', 2),
  'scream-tall': files('scream-tall', 2),
  'anger-tall': files('anger-tall', 2),
  'anger-mannequin': files('anger-mannequin', 2),
  'anger-crawler': files('anger-crawler', 2),
  'anger-child': files('anger-child', 2),
  'anger-crt': files('anger-crt', 2),
  'anger-cluster': files('anger-cluster', 2),
}

/** La bande-son : lue en continu par un élément audio, jamais décodée d'un bloc. */
export const SOUNDTRACK = 'japanese-sandman-1920.mp3'
