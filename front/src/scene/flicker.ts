// Néon qui grésille : multiplicateur d'intensité déterministe (même temps → même valeur).

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const SLOT = 0.06

/**
 * Intensité relative (0..1) d'un néon à l'instant `time` (s).
 * Les coupures deviennent plus fréquentes quand `danger` (0..1) monte.
 */
export function neonFlicker(time: number, danger: number, seed = 0): number {
  const slot = Math.floor(time / SLOT) + seed * 1000
  const dropoutChance = 0.025 + Math.min(1, Math.max(0, danger)) * 0.2
  if (hash(slot) < dropoutChance) return 0.12 + hash(slot + 0.5) * 0.35
  // Bourdonnement léger permanent.
  return 0.92 + hash(slot + 0.25) * 0.08
}

/**
 * Intensité d'un néon du labyrinthe : défaillant (coupures très fréquentes,
 * intensité réduite), éteint dans le noir, plein feu quand `surge` monte (0..1).
 * La lumière et son bourdonnement lisent cette même valeur.
 */
export function neonIntensity(light: { broken: boolean }, index: number, time: number, danger: number, dark: boolean, surge = 0): number {
  const flicker = light.broken ? neonFlicker(time, 1, index) * 0.55 : neonFlicker(time, danger, index)
  return dark ? 0 : flicker + (1 + surge * 3 - flicker) * surge
}
