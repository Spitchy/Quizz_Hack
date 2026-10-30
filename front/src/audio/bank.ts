import type { RenderedSound, SoundName } from './recipes'
import { SAMPLE_FILES } from './samples'

// La banque de sons : les tampons prêts à jouer. Les sons générés arrivent du
// worker au fil de l'eau ; un son pas encore prêt est simplement ignoré, le jeu
// n'attend jamais. Rien ici n'importe Three.js : ce module sert dès l'écran-titre.

const buffers = new Map<SoundName, (AudioBuffer | undefined)[]>()
const waiting = new Map<SoundName, (() => void)[]>()
const lastPlayed = new Map<SoundName, number>()
const sampled = new Set<SoundName>()
const recordingListeners = new Map<SoundName, ((buffer: AudioBuffer) => void)[]>()
let started = false

function store(sound: RenderedSound) {
  const buffer = new AudioBuffer({ length: sound.samples.length, sampleRate: sound.rate, numberOfChannels: 1 })
  buffer.copyToChannel(sound.samples as Float32Array<ArrayBuffer>, 0)
  // L'enregistrement est déjà là : le son généré ne sert plus.
  if (sampled.has(sound.name)) return
  const list = buffers.get(sound.name) ?? []
  list[sound.variant] = buffer
  buffers.set(sound.name, list)
  waiting.get(sound.name)?.forEach((callback) => callback())
  waiting.delete(sound.name)
}

/** Lance le calcul des sons, une seule fois, le plus tôt possible. */
export function preloadSounds(): void {
  if (started || typeof Worker === 'undefined' || typeof AudioBuffer === 'undefined') return
  started = true
  const worker = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RenderedSound>) => store(event.data)
  worker.onerror = () => worker.terminate()
}

let samplesRequested = false

/**
 * Charge les enregistrements, un par un, sans jamais bloquer : le décodage se
 * fait hors du fil principal. Nécessite le contexte audio (donc le clic).
 */
export function loadSamples(ctx: BaseAudioContext): void {
  if (samplesRequested) return
  samplesRequested = true
  void (async () => {
    for (const [name, files] of Object.entries(SAMPLE_FILES) as [SoundName, readonly string[]][]) {
      const decoded: AudioBuffer[] = []
      for (const file of files) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`)
          if (response.ok) decoded.push(await ctx.decodeAudioData(await response.arrayBuffer()))
        } catch {
          // Fichier absent ou illisible : on garde le son généré.
        }
      }
      if (decoded.length) {
        buffers.set(name, decoded)
        sampled.add(name)
        recordingListeners.get(name)?.forEach((callback) => callback(decoded[0]))
      }
    }
  })()
}

/** Une variante du son, jamais deux fois la même d'affilée. `null` s'il n'est pas encore prêt. */
export function pickBuffer(name: SoundName): AudioBuffer | null {
  const list = buffers.get(name)?.filter((b): b is AudioBuffer => !!b)
  if (!list?.length) return null
  if (list.length === 1) return list[0]
  const previous = lastPlayed.get(name) ?? -1
  const index = (previous + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length
  lastPlayed.set(name, index)
  return list[index]
}

/** Appelle `callback` dès que le son est là (tout de suite s'il l'est déjà). */
export function whenReady(name: SoundName, callback: () => void): void {
  if (buffers.get(name)?.some(Boolean)) {
    callback()
    return
  }
  waiting.set(name, [...(waiting.get(name) ?? []), callback])
}

/** Appelle `callback` quand l'enregistrement remplace le son généré (pour une boucle déjà lancée). */
export function whenRecorded(name: SoundName, callback: (buffer: AudioBuffer) => void): void {
  recordingListeners.set(name, [...(recordingListeners.get(name) ?? []), callback])
}

/** État de la banque, pour les outils de test. */
export const bankStatus = () => ({ ready: buffers.size, recordings: [...sampled] })
