import { bankStatus, loadSamples, pickBuffer, whenReady, whenRecorded } from './bank'
import {
  droneCutoff,
  droneDetune,
  droneGain,
  DUCKS,
  breathGain,
  breathRate,
  heartbeatInterval,
  hazeGain,
  heartbeatGain,
  LAYER_TRIM,
  LAYERS,
  MIXES,
  mixFor,
  musicSpeed,
  volumeGain,
  type Layer,
  type Moment,
} from './mix'
import type { SoundName } from './recipes'
import { SOUNDTRACK } from './samples'
import { loadSettings, localStore, saveSettings, type SoundSettings } from './settings'

// Le moteur audio : un graphe unique, créé au clic sur [ ENTRER ] (les navigateurs
// l'exigent) et jamais reconstruit. Trois bus (ambiance, effets, voix) avec leur
// baisse temporaire, puis la chaîne qui donne son caractère à chaque moment :
//
//   bus ─ somme ─┬─ sec ───────────────┐
//                └─ micro de caméra ───┤  (bande étroite, saturation, pleurage)
//   souffle, crachotis ────────────────┤
//                                      └ étouffement ─ écrasement ─ coupures ─ scène ─ volume ─ limiteur
//
// Aucun nœud n'est créé par image : les couches tournent en boucle, leurs gains
// suivent des consignes ; les sons ponctuels créent un seul nœud-source chacun.

type Bus = 'ambience' | 'effects' | 'voices'

interface Graph {
  ctx: AudioContext
  buses: Record<Bus, GainNode>
  ducks: Record<Bus, GainNode>
  /** Départ vers la réverbération : les sources dans l'espace y passent. */
  roomSend: Record<'corridor' | 'tiles', GainNode>
  /** Entrée du bus des sources spatiales (voix et effets), et du groupe des néons. */
  neon: GainNode
  monsters: GainNode
  spatialEffects: GainNode
  sum: GainNode
  /** Les crachotis du micro : passent après la chaîne de la caméra. */
  mic: GainNode
  muffle: BiquadFilterNode
  scene: GainNode
  user: GainNode
  analyser: AnalyserNode | null
  layers: Record<Layer, AudioParam>
  /** Part du signal qui contourne le micro de caméra et l'écrasement. */
  cctvDry: AudioParam
  crushDry: AudioParam
  droneFilter: BiquadFilterNode
  droneLevel: GainNode
  droneVoices: OscillatorNode[]
  heartLevel: GainNode
  hazeLevel: GainNode
  breathLevel: GainNode
  breathing: { source: AudioBufferSourceNode | null }
  /** Le vieux disque, lu en continu : jamais décodé d'un bloc. */
  song: HTMLAudioElement
  /** Sortie de la radio, à brancher sur sa voix dans le monde. */
  radio: GainNode
  /** Entrée du bulletin de l'intro. */
  tvInput: GainNode
  /** Sons ponctuels en cours ou programmés : coupés nets au changement de moment. */
  active: Set<AudioBufferSourceNode>
}

let graph: Graph | null = null
let settings = loadSettings(localStore())
const settingsListeners = new Set<() => void>()
let moment: Moment = 'silent'
let danger = 0
let openedAt = 0
let abrupt = false
let running = false
let hushed = false

/** Journal des sons joués, pour vérifier la synchronisation (outils de test). */
const history: { sound: string; at: number; moment: Moment }[] = []

function glide(param: AudioParam, to: number, fade: number, at: number): void {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at)
  else param.cancelScheduledValues(at)
  if (fade <= 0) param.setValueAtTime(to, at)
  else param.setTargetAtTime(to, at, fade)
}

/** Une boucle permanente, branchée sur `output` dès que son tampon est calculé. */
function startLoop(ctx: AudioContext, name: SoundName, output: AudioNode): void {
  whenReady(name, () => {
    const buffer = pickBuffer(name)
    if (!buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(output)
    source.start(0, Math.random() * buffer.duration)
  })
}

/** Courbe de saturation d'un micro bon marché : douce, puis écrêtée et asymétrique. */
function micCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive + 0.08) * 0.85
  }
  return curve
}

/** Courbe en escalier : quelques paliers d'amplitude, le son d'un convertisseur 3 bits. */
function stairCurve(steps: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2048)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.round(x * steps) / steps
  }
  return curve
}

/** Réponse d'une pièce : quelques premières réflexions, puis une queue. */
function roomImpulse(ctx: AudioContext, seconds: number, brightness: number, reflections: readonly number[]): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.round(seconds * rate)
  const buffer = ctx.createBuffer(2, length, rate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let i = 0; i < length; i++) {
      const t = i / rate
      const white = Math.random() * 2 - 1
      low += (white - low) * brightness
      data[i] = low * Math.exp((-t * 5.5) / seconds) * Math.min(1, t / 0.012)
    }
    for (const at of reflections) {
      const offset = at * (channel ? 1.07 : 0.95)
      data[Math.round(offset * rate)] += 0.5 * Math.exp((-offset * 5.5) / seconds)
    }
  }
  return buffer
}

function buildGraph(ctx: AudioContext): Graph {
  const gain = (value: number, ...outputs: AudioNode[]) => {
    const node = ctx.createGain()
    node.gain.value = value
    outputs.forEach((o) => node.connect(o))
    return node
  }

  // --- Sortie ---
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -5
  limiter.knee.value = 4
  limiter.ratio.value = 14
  limiter.attack.value = 0.002
  limiter.release.value = 0.14
  let analyser: AnalyserNode | null = null
  if (import.meta.env.DEV) {
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    limiter.connect(analyser)
  }
  limiter.connect(ctx.destination)
  const user = gain(volumeGain(settings.volume, settings.muted), limiter)
  const scene = gain(1, user)

  // --- Coupures numériques : une courbe en boucle qui attaque le gain. ---
  const gate = gain(1, scene)
  const gateDepth = gain(0)
  gateDepth.connect(gate.gain)
  startLoop(ctx, 'gate-curve', gateDepth)

  // --- Écrasement : paliers d'amplitude, en fondu. ---
  const crushIn = gain(1)
  const crushDry = gain(1, gate)
  const crushWet = gain(0, gate)
  const stairs = ctx.createWaveShaper()
  stairs.curve = stairCurve(8)
  crushIn.connect(crushDry)
  crushIn.connect(stairs)
  stairs.connect(crushWet)

  // --- Étouffement : les oreilles bouchées du réveil. ---
  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = 18000
  muffle.Q.value = 0.5
  muffle.connect(crushIn)

  // --- Micro de la caméra de surveillance. ---
  const sum = gain(1)
  const cctvDry = gain(1, muffle)
  const cctvWet = gain(0, muffle)
  sum.connect(cctvDry)
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 520
  high.Q.value = 0.9
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 3100
  low.Q.value = 1.1
  const nasal = ctx.createBiquadFilter()
  nasal.type = 'peaking'
  nasal.frequency.value = 1700
  nasal.gain.value = 9
  nasal.Q.value = 1.4
  const drive = gain(1.7)
  const clip = ctx.createWaveShaper()
  clip.curve = micCurve(2.4)
  clip.oversample = '2x'
  // Pleurage de la bande : le temps lui-même ondule.
  const wow = ctx.createDelay(0.05)
  wow.delayTime.value = 0.012
  const wowDepth = gain(0.0014)
  const wowRate = ctx.createOscillator()
  wowRate.frequency.value = 0.9
  wowRate.connect(wowDepth)
  wowDepth.connect(wow.delayTime)
  wowRate.start()
  // Second filtre passe-bas : le micro n'a vraiment plus d'aigus.
  const low2 = ctx.createBiquadFilter()
  low2.type = 'lowpass'
  low2.frequency.value = 3600
  sum.connect(high)
  high.connect(low)
  low.connect(nasal)
  nasal.connect(drive)
  drive.connect(clip)
  clip.connect(wow)
  wow.connect(low2)
  low2.connect(cctvWet)
  const mic = gain(0.9, cctvWet)

  // --- Bus et baisses temporaires. ---
  const ducks = { ambience: gain(1, sum), effects: gain(1, sum), voices: gain(1, sum) }
  const buses = { ambience: gain(1, ducks.ambience), effects: gain(1, ducks.effects), voices: gain(1, ducks.voices) }

  // --- Réverbération : le couloir feutré, la pièce carrelée. ---
  const reverbFor = (seconds: number, brightness: number, reflections: readonly number[]) => {
    const convolver = ctx.createConvolver()
    convolver.buffer = roomImpulse(ctx, seconds, brightness, reflections)
    convolver.connect(sum)
    return gain(0, convolver)
  }
  const roomSend = {
    corridor: reverbFor(0.9, 0.22, [0.009, 0.021, 0.034]),
    tiles: reverbFor(1.15, 0.65, [0.006, 0.013, 0.019, 0.031, 0.044]),
  }
  const reverbBus = gain(1, roomSend.corridor, roomSend.tiles)
  const spatialEffects = gain(1, buses.effects, reverbBus)
  const monsters = gain(0, buses.voices, reverbBus)
  const neon = gain(0, buses.ambience)

  // --- Couches continues générées en code. ---
  const loopLayer = (name: SoundName, output: AudioNode) => {
    const level = gain(0, output)
    startLoop(ctx, name, level)
    return level
  }
  const roomTone = loopLayer('room-tone', buses.ambience)
  const hazeLevel = gain(0, buses.ambience)
  const haze = loopLayer('tape-hiss', hazeLevel)
  const tape = loopLayer('tape-hiss', cctvWet)
  const tinnitus = loopLayer('tinnitus', buses.effects)
  // Respiration : le niveau suit le moment et le danger ; la vitesse, le danger et la course.
  const breathLevel = gain(0, buses.effects)
  const breath = gain(0, breathLevel)
  const breathing: { source: AudioBufferSourceNode | null } = { source: null }
  const startBreathing = (buffer: AudioBuffer | null) => {
    if (!buffer) return
    breathing.source?.stop()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = breathRate(danger, running)
    source.connect(breath)
    source.start()
    breathing.source = source
  }
  whenReady('breath', () => startBreathing(pickBuffer('breath')))
  whenRecorded('breath', startBreathing)
  const dripPan = ctx.createStereoPanner()
  dripPan.pan.value = -0.55
  dripPan.connect(buses.effects)
  dripPan.connect(reverbBus)
  const drip = loopLayer('drip', dripPan)
  const glitchBed = loopLayer('glitch-bed', buses.ambience)
  const wind = loopLayer('wind', buses.ambience)
  const grass = loopLayer('grass', buses.ambience)
  const rain = loopLayer('rain', buses.ambience)
  const van = loopLayer('van-idle', buses.ambience)

  // --- Le bulletin : plein écran, ou sorti du haut-parleur du téléphone. ---
  const tvDry = gain(0, buses.voices)
  const tvSmall = gain(0, buses.voices)
  const speakerLow = ctx.createBiquadFilter()
  speakerLow.type = 'highpass'
  speakerLow.frequency.value = 780
  speakerLow.Q.value = 1.1
  const speakerHigh = ctx.createBiquadFilter()
  speakerHigh.type = 'lowpass'
  speakerHigh.frequency.value = 3900
  speakerHigh.Q.value = 1.1
  speakerLow.connect(speakerHigh)
  speakerHigh.connect(tvSmall)
  const tvInput = gain(1, tvDry, speakerLow)

  // --- Le vieux disque : un pavillon de gramophone, de l'usure, et un plateau qui ondule. ---
  const music = gain(0, buses.ambience)
  // La radio n'a pas de sortie ici : la scène la branche sur sa voix dans le monde.
  const radio = gain(0)
  const record = gain(1, music, radio)
  startLoop(ctx, 'old-noise', gain(0.45, record))
  const song = new Audio(`${import.meta.env.BASE_URL}audio/${SOUNDTRACK}`)
  song.loop = true
  song.preload = 'auto'
  // Pas de correction de hauteur : ralentir un disque le fait aussi descendre.
  song.preservesPitch = false
  song.playbackRate = musicSpeed('silent').rate
  const horn = ctx.createBiquadFilter()
  horn.type = 'highpass'
  horn.frequency.value = 280
  horn.Q.value = 1
  const mouth = ctx.createBiquadFilter()
  mouth.type = 'lowpass'
  mouth.frequency.value = 2800
  mouth.Q.value = 1.2
  const worn = ctx.createWaveShaper()
  worn.curve = micCurve(1.4)
  const warble = ctx.createDelay(0.05)
  warble.delayTime.value = 0.014
  const warbleDepth = gain(0.0022)
  const warbleRate = ctx.createOscillator()
  warbleRate.frequency.value = 0.55
  warbleRate.connect(warbleDepth)
  warbleDepth.connect(warble.delayTime)
  warbleRate.start()
  ctx.createMediaElementSource(song).connect(horn)
  horn.connect(mouth)
  mouth.connect(worn)
  worn.connect(warble)
  warble.connect(record)
  void song.play().catch(() => {
    // Lecture refusée : le jeu continue sans la musique.
  })

  // --- Drone : trois oscillateurs qui se désaccordent avec le danger. ---
  const droneFilter = ctx.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.value = 110
  droneFilter.Q.value = 2
  const droneMix = gain(0, buses.ambience)
  const droneLevel = gain(0, droneMix)
  droneFilter.connect(droneLevel)
  const droneVoices = [
    { hz: 41.2, type: 'sawtooth' },
    { hz: 41.2, type: 'sawtooth' },
    { hz: 61.74, type: 'triangle' },
    { hz: 87.31, type: 'sawtooth' },
  ].map(({ hz, type }) => {
    const osc = ctx.createOscillator()
    osc.type = type as OscillatorType
    osc.frequency.value = hz
    osc.connect(droneFilter)
    osc.start()
    return osc
  })
  // Le filtre respire lentement.
  const filterDrift = ctx.createOscillator()
  filterDrift.frequency.value = 0.11
  const filterDepth = gain(26)
  filterDrift.connect(filterDepth)
  filterDepth.connect(droneFilter.frequency)
  filterDrift.start()

  // --- Cœur : gain de moment, gain de danger. ---
  const heartMix = gain(0, buses.effects)
  const heartLevel = gain(0, heartMix)

  const layers: Record<Layer, AudioParam> = {
    roomTone: roomTone.gain,
    neon: neon.gain,
    drone: droneMix.gain,
    heartbeat: heartMix.gain,
    monsters: monsters.gain,
    haze: haze.gain,
    tape: tape.gain,
    tinnitus: tinnitus.gain,
    breath: breath.gain,
    drip: drip.gain,
    glitchBed: glitchBed.gain,
    wind: wind.gain,
    grass: grass.gain,
    radio: radio.gain,
    music: music.gain,
    cctv: cctvWet.gain,
    crush: crushWet.gain,
    gate: gateDepth.gain,
    rain: rain.gain,
    van: van.gain,
    tv: tvDry.gain,
    tvSmall: tvSmall.gain,
  }

  return {
    tvInput,
    ctx,
    buses,
    ducks,
    roomSend,
    neon,
    monsters,
    spatialEffects,
    sum,
    mic,
    muffle,
    scene,
    user,
    analyser,
    layers,
    cctvDry: cctvDry.gain,
    crushDry: crushDry.gain,
    droneFilter,
    droneLevel,
    droneVoices,
    heartLevel,
    hazeLevel,
    breathLevel,
    breathing,
    song,
    radio,
    active: new Set(),
  }
}

let speedTimer = 0

/** Fait glisser la vitesse du disque : un élément audio n'a pas de rampe automatique. */
function glideMusic(g: Graph, next: Moment, immediately: boolean): void {
  window.clearInterval(speedTimer)
  const { rate, glide: seconds } = musicSpeed(next)
  if (immediately || seconds <= 0) {
    g.song.playbackRate = rate
    return
  }
  const from = g.song.playbackRate
  const startedAt = performance.now()
  speedTimer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - startedAt) / (seconds * 1000))
    g.song.playbackRate = from + (rate - from) * k
    if (k >= 1) window.clearInterval(speedTimer)
  }, 50)
}

/** Applique la balance d'un moment. */
function applyMoment(g: Graph, next: Moment): void {
  const mix = mixFor(next, hushed)
  const now = g.ctx.currentTime
  // Après un passage forcé, rien ne traîne de la scène qu'on a quittée.
  const abruptMove = abrupt
  const fade = abrupt ? Math.min(mix.fade, 0.04) : mix.fade
  abrupt = false

  // Coupure sèche : la scène se ferme d'abord, tout le reste suit dans le silence.
  if (mix.cut) {
    glide(g.scene.gain, 0, 0.002, now)
    stopAll(g, now + 0.012)
  } else {
    glide(g.scene.gain, 1, 0.002, now)
  }

  for (const layer of LAYERS) {
    const target = (mix.levels[layer] ?? 0) * LAYER_TRIM[layer]
    glide(g.layers[layer], target, mix.cut ? 0 : fade, now)
  }
  glide(g.cctvDry, 1 - (mix.levels.cctv ?? 0), mix.cut ? 0 : fade, now)
  glide(g.crushDry, 1 - (mix.levels.crush ?? 0), mix.cut ? 0 : fade, now)

  if (mix.muffle) glide(g.muffle.frequency, mix.muffle, 0, now)
  else if (!mix.timeline?.some((a) => a.target === 'muffle')) glide(g.muffle.frequency, 18000, mix.cut ? 0 : Math.max(fade, 0.05), now)

  glideMusic(g, next, abruptMove)

  // Réverbération de la pièce où l'on est.
  const sends = { corridor: mix.room === 'corridor' ? 0.2 : 0, tiles: mix.room === 'tiles' ? 0.28 : 0 }
  glide(g.roomSend.corridor.gain, sends.corridor, 0.08, now)
  glide(g.roomSend.tiles.gain, sends.tiles, 0.08, now)

  for (const step of mix.timeline ?? []) {
    const at = now + step.at
    if (step.target === 'muffle') g.muffle.frequency.exponentialRampToValueAtTime(step.to, at + step.fade)
    else g.layers[step.target].setTargetAtTime(step.to * LAYER_TRIM[step.target], at, step.fade)
  }
}

function stopAll(g: Graph, at: number): void {
  for (const source of g.active) {
    try {
      source.stop(at)
    } catch {
      // Déjà arrêtée.
    }
  }
  g.active.clear()
}

function applyBreathing(g: Graph, now: number): void {
  glide(g.breathLevel.gain, breathGain(danger) * (running ? 1.3 : 1), 0.6, now)
  if (g.breathing.source) glide(g.breathing.source.playbackRate, breathRate(danger, running), 0.8, now)
}

function applyDanger(g: Graph): void {
  const now = g.ctx.currentTime
  glide(g.droneLevel.gain, droneGain(danger), 0.9, now)
  glide(g.droneFilter.frequency, droneCutoff(danger), 0.9, now)
  const detune = droneDetune(danger)
  g.droneVoices.forEach((osc, i) => glide(osc.detune, i % 2 ? detune : -detune, 0.9, now))
  glide(g.heartLevel.gain, heartbeatGain(danger), 0.6, now)
  glide(g.hazeLevel.gain, hazeGain(danger), 0.9, now)
  applyBreathing(g, now)
}

// --- Cœur : planifié d'avance sur l'horloge audio. ---

let nextBeat = 0
let beatCount = 0
function scheduleHeartbeat(g: Graph): void {
  const now = g.ctx.currentTime
  if (heartbeatGain(danger) <= 0) {
    nextBeat = now
    return
  }
  if (nextBeat < now) nextBeat = now + 0.05
  while (nextBeat < now + 0.25) {
    const buffer = pickBuffer('heartbeat')
    if (buffer) {
      const source = g.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(g.heartLevel)
      source.start(nextBeat)
    }
    nextBeat += heartbeatInterval(danger, beatCount++)
  }
}

// --- API ---

/** À appeler dans le clic sur [ ENTRER ] : crée ou réveille le contexte audio. */
export function unlockAudio(): void {
  try {
    if (!graph) {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      graph = buildGraph(ctx)
      loadSamples(ctx)
      const g = graph
      window.setInterval(() => scheduleHeartbeat(g), 80)
      // Onglet caché : le temps audio s'arrête avec le rendu.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          void ctx.suspend()
          g.song.pause()
        } else {
          void ctx.resume()
          void g.song.play().catch(() => {})
        }
      })
    }
    void graph.ctx.resume()
    void graph.song.play().catch(() => {})
  } catch {
    // Pas d'audio dans ce navigateur : le jeu se joue en silence.
    graph = null
  }
}

/** Les nœuds dont la scène 3D a besoin pour y brancher ses sources. */
export function audioNodes() {
  return (
    graph && {
      ctx: graph.ctx,
      neon: graph.neon,
      monsters: graph.monsters,
      spatialEffects: graph.spatialEffects,
      radio: graph.radio,
      ambience: graph.buses.ambience,
    }
  )
}

/** Il court : il manque d'air. */
export function setRunning(value: boolean): void {
  if (running === value) return
  running = value
  if (graph) applyBreathing(graph, graph.ctx.currentTime)
}

export function setDanger(value: number): void {
  danger = value
  if (graph) applyDanger(graph)
}

export function enterMoment(next: Moment): void {
  if (moment === next) return
  moment = next
  openedAt = graph?.ctx.currentTime ?? 0
  if (graph) applyMoment(graph, next)
}

/** Le dossier a été refermé : silence jusqu'à la fin de la partie (voir `mixFor`). */
export function setHushed(value: boolean): void {
  if (hushed === value) return
  hushed = value
  if (graph) applyMoment(graph, moment)
}

/** Coupe les sons ponctuels en cours (passage d'une fin, rejouer). */
export function stopSounds(): void {
  if (!graph) return
  abrupt = true
  const now = graph.ctx.currentTime
  // Un creux très bref sur la scène masque le raccord.
  graph.scene.gain.cancelScheduledValues(now)
  graph.scene.gain.setTargetAtTime(0, now, 0.004)
  stopAll(graph, now + 0.03)
  if (!MIXES[moment].cut) graph.scene.gain.setTargetAtTime(1, now + 0.04, 0.012)
}

export interface PlayOptions {
  /** Délai (s) avant le son. */
  delay?: number
  gain?: number
  rate?: number
  bus?: Bus
}

function connectSource(g: Graph, name: SoundName, output: AudioNode, { delay = 0, gain = 1, rate = 1 }: PlayOptions): AudioBufferSourceNode | null {
  const buffer = pickBuffer(name)
  if (!buffer) return null
  const source = g.ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  const level = g.ctx.createGain()
  level.gain.value = gain
  source.connect(level)
  level.connect(output)
  const at = g.ctx.currentTime + delay
  source.start(at)
  g.active.add(source)
  source.onended = () => {
    g.active.delete(source)
    level.disconnect()
  }
  history.push({ sound: name, at: at - openedAt, moment })
  if (history.length > 400) history.shift()
  return source
}

/** Joue un son sans position (dans la tête, ou sur le mixage). */
export function playSound(name: SoundName, options: PlayOptions = {}): void {
  if (graph) connectSource(graph, name, graph.buses[options.bus ?? 'effects'], options)
}

/** Joue un son par le bulletin de l'intro. */
export function playOnTv(name: SoundName, options: PlayOptions = {}): void {
  if (graph) connectSource(graph, name, graph.tvInput, options)
}

/** Joue un son dans une entrée donnée (voix spatiale de la scène). */
export function playSoundInto(name: SoundName, output: AudioNode, options: PlayOptions = {}): AudioBufferSourceNode | null {
  return graph && connectSource(graph, name, output, options)
}

/** Crachotis du micro : passe après la chaîne, comme une surcharge de l'électronique. */
export function playMicCrackle(gain: number): void {
  if (graph) connectSource(graph, 'mic-crackle', graph.mic, { gain })
}

/** Baisse les autres bus le temps d'un son fort. */
export function duck(kind: keyof typeof DUCKS): void {
  if (!graph) return
  const spec = DUCKS[kind]
  const now = graph.ctx.currentTime
  for (const bus of ['ambience', 'effects', 'voices'] as const) {
    const param = graph.ducks[bus].gain
    glide(param, spec[bus], 0.015, now)
    param.setTargetAtTime(1, now + spec.hold, spec.release / 3)
  }
}

// --- Réglages ---

export const getSoundSettings = (): SoundSettings => settings

export function subscribeSoundSettings(listener: () => void): () => void {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

export function updateSoundSettings(change: Partial<SoundSettings>): void {
  settings = { ...settings, ...change }
  saveSettings(localStore(), settings)
  if (graph) glide(graph.user.gain, volumeGain(settings.volume, settings.muted), 0.02, graph.ctx.currentTime)
  settingsListeners.forEach((listener) => listener())
}

// --- Outils de test (dev) ---

/** Instantané de l'état audio, pour vérifier sans pouvoir écouter. */
export function audioDebug() {
  if (!graph) return null
  const g = graph
  let rms = 0
  let peak = 0
  let bands = { low: 0, mid: 0, high: 0 }
  if (g.analyser) {
    const data = new Float32Array(g.analyser.fftSize)
    g.analyser.getFloatTimeDomainData(data)
    for (const s of data) {
      rms += s * s
      peak = Math.max(peak, Math.abs(s))
    }
    rms = Math.sqrt(rms / data.length)
    // Énergie moyenne par bande (dB) : le grave, le médium, l'aigu.
    const spectrum = new Float32Array(g.analyser.frequencyBinCount)
    g.analyser.getFloatFrequencyData(spectrum)
    const hzPerBin = g.ctx.sampleRate / g.analyser.fftSize
    const band = (from: number, to: number) => {
      let sum = 0
      let count = 0
      for (let i = Math.ceil(from / hzPerBin); i <= Math.floor(to / hzPerBin) && i < spectrum.length; i++) {
        sum += 10 ** (spectrum[i] / 10)
        count++
      }
      return Math.round(10 * Math.log10(sum / Math.max(1, count) + 1e-12))
    }
    bands = { low: band(40, 300), mid: band(600, 2600), high: band(5000, 12000) }
  }
  const layers: Partial<Record<Layer, number>> = {}
  for (const layer of LAYERS) layers[layer] = Math.round(g.layers[layer].value * 1000) / 1000
  return {
    state: g.ctx.state,
    time: g.ctx.currentTime,
    sinceMoment: g.ctx.currentTime - openedAt,
    moment,
    hushed,
    danger,
    rms,
    peak,
    bands,
    active: g.active.size,
    scene: g.scene.gain.value,
    user: g.user.gain.value,
    muffle: g.muffle.frequency.value,
    song: { element: g.song, paused: g.song.paused, time: g.song.currentTime, rate: g.song.playbackRate, ready: g.song.readyState, error: g.song.error?.code ?? null },
    layers,
    bank: bankStatus(),
    history: history.slice(),
  }
}
