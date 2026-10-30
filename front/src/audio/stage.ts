import { AudioContext as ThreeAudioContext, AudioListener, PositionalAudio, type Camera } from 'three'
import { neonIntensity } from '../scene/flicker'
import type { Maze } from '../maze/generate'
import { TILE_SIZE } from '../maze/generate'
import type { Archetype } from '../scene/entities/archetypes'
import type { CuePoint } from './cues'
import { audioNodes, duck, playMicCrackle, playSound, playSoundInto, type PlayOptions } from './engine'
import { pickBuffer } from './bank'
import { neonBuzzGain } from './mix'
import type { SoundName } from './recipes'
import { moodGain, moodRate, nearest, occlusionFor, VOICES, wallDepth, type VoiceMood } from './spatial'
import { collapseSounds, isBoneHit } from './cues'

// Le son dans le monde 3D : l'écouteur sur la caméra (l'oreille suit donc aussi
// la caméra de surveillance), et trois réserves de `PositionalAudio` créées une
// fois pour toutes. Les sources du monde se partagent ces voix : les plus
// proches sonnent, sans jamais créer ni détruire de nœud à chaque image.

const NEON_VOICES = 4
const MONSTER_VOICES = 4
const SHOT_VOICES = 14
const NEON_RANGE = 14
const MONSTER_RANGE = 22
const NEON_HEIGHT = 2.75
/** Tous les combien réattribuer les voix et recalculer les murs (s). */
const RESCAN = 0.14
/** Une entité qui ne donne plus de nouvelles (autre monde) se tait, sans couper sur un simple à-coup (s). */
const ENTITY_STALE = 1.2
/** La voix de néon 0 est prise par un néon tenu par la scène. */
const PINNED = -2

interface Voice {
  audio: PositionalAudio
  filter: BiquadFilterNode
  level: GainNode
  input: GainNode
}

interface NeonVoice extends Voice {
  light: number
  lastLevel: number
  source: AudioBufferSourceNode | null
}

interface MonsterVoice extends Voice {
  entity: number | null
  bed: SoundName | null
  fade: GainNode | null
  source: AudioBufferSourceNode | null
  rate: number
}

interface ShotVoice extends Voice {
  freeAt: number
}

interface LiveEntity {
  archetype: Archetype
  x: number
  z: number
  mood: VoiceMood
  present: boolean
  seenAt: number
}

/** Entités du monde courant : écrites par `Entity`, lues ici, jamais de re-rendu. */
const entities = new Map<number, LiveEntity>()
/** Néon « tenu » à la main par la scène (le dernier de la défaite, l'ampoule du réveil). */
const pinned = { x: 0, y: 0, z: 0, level: 0, fresh: false }

interface Stage {
  listener: AudioListener
  neons: NeonVoice[]
  monsters: MonsterVoice[]
  shots: ShotVoice[]
  rescanAt: number
  dispose: () => void
}

let stage: Stage | null = null

function createVoice(listener: AudioListener, output: AudioNode, model: PanningModelType, ref: number, rolloff: number): Voice {
  const ctx = listener.context
  const audio = new PositionalAudio(listener)
  audio.panner.panningModel = model
  audio.setDistanceModel('inverse')
  audio.setRefDistance(ref)
  audio.setRolloffFactor(rolloff)
  audio.setMaxDistance(60)
  // Chaque voix va dans son bus, pas dans l'entrée unique de l'écouteur.
  audio.gain.disconnect()
  audio.gain.connect(output)
  const input = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 16000
  filter.Q.value = 0.6
  const level = ctx.createGain()
  level.gain.value = 0
  input.connect(filter)
  filter.connect(level)
  audio.setNodeSource(level as unknown as AudioBufferSourceNode)
  // Hors de la scène : c'est nous qui plaçons le panoramique, seulement quand la
  // source bouge, plutôt que neuf rampes par voix à chaque image.
  return { audio, filter, level, input }
}

/** Place une source dans le monde, tout de suite. */
function place({ audio: { panner } }: Voice, x: number, y: number, z: number, at: number): void {
  if (panner.positionX) {
    panner.positionX.setValueAtTime(x, at)
    panner.positionY.setValueAtTime(y, at)
    panner.positionZ.setValueAtTime(z, at)
  } else {
    panner.setPosition(x, y, z)
  }
}

/** Monte l'écouteur et les voix. Rien ne se monte ensuite : on ne touche plus qu'aux gains. */
export function createSoundStage(camera: Camera): () => void {
  const nodes = audioNodes()
  if (!nodes || stage) return () => {}
  ThreeAudioContext.setContext(nodes.ctx)
  const listener = new AudioListener()
  camera.add(listener)

  const neons: NeonVoice[] = Array.from({ length: NEON_VOICES }, () => ({
    ...createVoice(listener, nodes.neon, 'equalpower', 1.6, 1.35),
    light: -1,
    lastLevel: -1,
    source: null,
  }))
  const monsters: MonsterVoice[] = Array.from({ length: MONSTER_VOICES }, () => ({
    ...createVoice(listener, nodes.monsters, 'HRTF', 1.6, 1.05),
    entity: null,
    bed: null,
    fade: null,
    source: null,
    rate: 1,
  }))
  const shots: ShotVoice[] = Array.from({ length: SHOT_VOICES }, () => ({
    ...createVoice(listener, nodes.spatialEffects, 'equalpower', 1.4, 1.05),
    freeAt: 0,
  }))
  for (const shot of shots) shot.level.gain.value = 1

  // Une boucle de bourdonnement par voix de néon, à des décalages différents.
  let buzzStarted = false
  const startBuzz = () => {
    if (buzzStarted || !pickBuffer('neon-buzz')) return
    buzzStarted = true
    neons.forEach((voice, i) => {
      const buffer = pickBuffer('neon-buzz')!
      const source = nodes.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.playbackRate.value = 1 + i * 0.003
      source.connect(voice.input)
      source.start(0, (i * buffer.duration) / NEON_VOICES)
      voice.source = source
    })
  }

  const created: Stage & { startBuzz: () => void } = {
    listener,
    neons,
    monsters,
    shots,
    rescanAt: 0,
    startBuzz,
    dispose: () => {
      camera.remove(listener)
      for (const voice of [...neons, ...monsters, ...shots]) {
        voice.level.disconnect()
        voice.audio.panner.disconnect()
        voice.audio.gain.disconnect()
      }
      for (const voice of monsters) silenceVoice(voice, nodes.ctx.currentTime)
      for (const voice of neons) voice.source?.stop()
      listener.gain.disconnect()
      entities.clear()
      stage = null
    },
  }
  stage = created
  return created.dispose
}

function silenceVoice(voice: MonsterVoice, now: number): void {
  if (voice.fade) voice.fade.gain.setTargetAtTime(0, now, 0.05)
  voice.source?.stop(now + 0.25)
  voice.fade = null
  voice.source = null
  voice.entity = null
  voice.bed = null
}

function assignMonster(voice: MonsterVoice, id: number, entity: LiveEntity, ctx: BaseAudioContext, now: number): void {
  silenceVoice(voice, now)
  const profile = VOICES[entity.archetype]
  const buffer = pickBuffer(profile.bed)
  if (!buffer) return
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.playbackRate.value = moodRate(entity.mood)
  const fade = ctx.createGain()
  fade.gain.value = 0
  source.connect(fade)
  fade.connect(voice.input)
  source.start(0, (id * 1.37) % buffer.duration)
  fade.gain.setTargetAtTime(1, now, 0.12)
  voice.entity = id
  voice.bed = profile.bed
  voice.source = source
  voice.fade = fade
  voice.audio.setRefDistance(profile.ref)
}

/** À chaque image : place les voix, suit les néons, réattribue de temps en temps. */
export function updateSoundStage(maze: Maze | null, camera: Camera, time: number, danger: number, dark: boolean, surge: number): void {
  const s = stage as (Stage & { startBuzz: () => void }) | null
  if (!s) return
  s.startBuzz()
  const ctx = s.listener.context
  const now = ctx.currentTime
  const here = { x: camera.position.x, z: camera.position.z }

  // Réattribution des voix : pas à chaque image.
  const rescan = time >= s.rescanAt || time < s.rescanAt - RESCAN * 2
  if (rescan) s.rescanAt = time + RESCAN

  // --- Néons ---
  if (rescan && maze) {
    const centers = maze.lights.map((l) => ({ x: (l.x + 0.5) * TILE_SIZE, z: (l.y + 0.5) * TILE_SIZE }))
    const wanted = dark ? [] : nearest(centers, here, NEON_VOICES, NEON_RANGE)
    s.neons.forEach((voice) => {
      if (voice.light >= 0 && !wanted.includes(voice.light)) voice.light = -1
    })
    for (const light of wanted) {
      if (s.neons.some((voice) => voice.light === light)) continue
      const free = s.neons.find((voice) => voice.light < 0)
      if (!free) continue
      free.light = light
      free.lastLevel = -1
      free.level.gain.setValueAtTime(0, now)
      place(free, centers[light].x, NEON_HEIGHT, centers[light].z, now)
    }
    for (const voice of s.neons) {
      if (voice.light < 0) continue
      const a = centers[voice.light]
      const { cutoff, gain } = occlusionFor(wallDepth(maze, here, a))
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.08)
      voice.input.gain.setTargetAtTime(gain, now, 0.08)
    }
  }
  s.neons.forEach((voice, i) => {
    let level = 0
    if (i === 0 && pinned.fresh) {
      // Le néon tenu par la scène prend la première voix.
      if (voice.light !== PINNED) place(voice, pinned.x, pinned.y, pinned.z, now)
      voice.light = PINNED
      level = pinned.level
    } else if (voice.light >= 0 && maze) {
      const light = maze.lights[voice.light]
      if (light) level = neonIntensity(light, voice.light, time, danger, dark, surge)
    } else {
      voice.light = -1
    }
    const target = neonBuzzGain(level)
    if (Math.abs(target - voice.lastLevel) > 0.015) {
      voice.lastLevel = target
      voice.level.gain.setTargetAtTime(target, now, 0.006)
    }
  })
  pinned.fresh = false

  // --- Monstres ---
  if (rescan) {
    const ids: number[] = []
    const positions: { x: number; z: number }[] = []
    entities.forEach((entity, id) => {
      if (entity.present && time - entity.seenAt < ENTITY_STALE) {
        ids.push(id)
        positions.push(entity)
      }
    })
    const wanted = nearest(positions, here, MONSTER_VOICES, MONSTER_RANGE).map((i) => ids[i])
    for (const voice of s.monsters) {
      // Une nouvelle partie réutilise les mêmes identifiants, pas les mêmes monstres.
      const entity = voice.entity === null ? null : entities.get(voice.entity)
      if (voice.entity !== null && (!wanted.includes(voice.entity) || voice.bed !== (entity && VOICES[entity.archetype].bed))) silenceVoice(voice, now)
    }
    for (const id of wanted) {
      if (s.monsters.some((voice) => voice.entity === id)) continue
      const free = s.monsters.find((voice) => voice.entity === null)
      const entity = entities.get(id)
      if (free && entity) assignMonster(free, id, entity, ctx, now)
    }
  }
  for (const voice of s.monsters) {
    if (voice.entity === null) continue
    const entity = entities.get(voice.entity)
    if (!entity) continue
    const profile = VOICES[entity.archetype]
    place(voice, entity.x, profile.height, entity.z, now)
    if (rescan) {
      const { cutoff, gain } = maze ? occlusionFor(wallDepth(maze, here, entity)) : { cutoff: 16000, gain: 1 }
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.09)
      voice.level.gain.setTargetAtTime(gain * profile.gain * moodGain(entity.mood), now, 0.12)
      voice.source?.playbackRate.setTargetAtTime(moodRate(entity.mood), now, 0.5)
    }
  }
}

/** État des voix, pour les outils de test (`import('/src/audio/stage.ts')`). */
export function soundStageDebug() {
  if (!stage) return null
  return {
    neons: stage.neons.map((v) => ({ light: v.light, level: v.lastLevel, gain: v.level.gain.value, cutoff: v.filter.frequency.value, x: v.audio.panner.positionX.value, z: v.audio.panner.positionZ.value })),
    monsters: stage.monsters.map((v) => ({ entity: v.entity, bed: v.bed, gain: v.level.gain.value, cutoff: v.filter.frequency.value, x: v.audio.panner.positionX.value, z: v.audio.panner.positionZ.value })),
    listener: { x: stage.listener.context.listener.positionX.value, z: stage.listener.context.listener.positionZ.value },
  }
}

/** Écrit l'état vivant d'une entité (appelé par `Entity` à chaque image). */
export function reportEntity(id: number, archetype: Archetype, x: number, z: number, mood: VoiceMood, present: boolean, time: number): void {
  const entity = entities.get(id)
  if (entity) {
    entity.archetype = archetype
    entity.x = x
    entity.z = z
    entity.mood = mood
    entity.present = present
    entity.seenAt = time
  } else {
    entities.set(id, { archetype, x, z, mood, present, seenAt: time })
  }
}

/** L'entité que le joueur lit, pour y placer sa réaction. */
export function entityPosition(id: number): LiveEntity | null {
  return entities.get(id) ?? null
}

/** Un néon qui n'appartient pas au labyrinthe (appelé à chaque image tant qu'il sonne). */
export function pinNeon(x: number, y: number, z: number, level: number): void {
  pinned.x = x
  pinned.y = y
  pinned.z = z
  pinned.level = level
  pinned.fresh = true
}

/** Joue un son à une position du monde, dans la voix ponctuelle qui se libère le plus tôt. */
export function playAt(sound: SoundName, [x, y, z]: CuePoint, options: PlayOptions = {}): void {
  if (!stage) {
    playSound(sound, options)
    return
  }
  const now = stage.listener.context.currentTime
  const voice = stage.shots.reduce((best, shot) => (shot.freeAt < best.freeAt ? shot : best))
  const delay = options.delay ?? 0
  place(voice, x, y, z, now + delay)
  const source = playSoundInto(sound, voice.input, options)
  if (source) voice.freeAt = now + delay + (source.buffer?.duration ?? 0) / (options.rate ?? 1)
}

/** Pas d'un monstre, à sa position : signature de chaque archétype. */
export function playEntityStep(archetype: Archetype, x: number, z: number): void {
  const weight = archetype === 'tall' ? 1 : 0.55
  playAt(VOICES[archetype].step, [x, 0.1, z], { gain: weight, rate: 0.94 + Math.random() * 0.12 })
}

/** Réaction d'une entité à une mauvaise réponse. */
export function playEntityAnger(id: number): void {
  const entity = entities.get(id)
  if (entity) playAt(VOICES[entity.archetype].anger, [entity.x, VOICES[entity.archetype].height, entity.z], { gain: 1 })
}

/** Bonne réponse : elle se défait en poussière, là où elle se tient. */
export function playEntityRelease(id: number): void {
  const entity = entities.get(id)
  if (entity) playAt('release', [entity.x, 1.2, entity.z], { gain: 1 })
  else playSound('release', { gain: 0.9 })
}

/** Un coup du passage à tabac, à la position du corps, au moment exact où il encaisse. */
export function playBeatingHit(hit: number, total: number, x: number, z: number): void {
  const at: CuePoint = [x, 1.2, z]
  playAt('hit-flesh', at, { gain: 0.95, rate: 0.92 + Math.random() * 0.16 })
  if (isBoneHit(hit, total)) playAt('hit-bone', at, { gain: 0.85, rate: 0.95 + Math.random() * 0.1 })
  // Le sang retombe sur la moquette un instant après.
  playAt('splat', [x, 0.05, z], { gain: 0.3 + 0.5 * (hit / total), delay: 0.26 + Math.random() * 0.14 })
  playMicCrackle(0.4 + 0.5 * (hit / total))
  duck('hit')
  const { knees, fall } = collapseSounds(hit, total)
  if (knees) playAt('body-fall', [x, 0.3, z], { gain: 0.5, delay: 0.1 })
  if (fall) playAt('body-fall', [x, 0.2, z], { gain: 1, delay: 0.3, rate: 0.85 })
}
