import { renderQueue, renderSound } from './recipes'

// Calcule tous les sons générés en code, hors du fil principal : le jeu ne se
// fige jamais pendant ce temps. Chaque son part dès qu'il est prêt.

for (const { name, variant } of renderQueue()) {
  const sound = renderSound(name, variant)
  ;(self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(sound, [sound.samples.buffer])
}
