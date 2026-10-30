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
  'anger-cluster': files('anger-cluster', 1),
}
