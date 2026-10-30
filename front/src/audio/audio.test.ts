import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { beatSchedule, DEFEAT_TIMELINE, DOOR_TIMELINE, VICTORY_TIMELINE } from '../app/sequence'
import type { Phase } from '../game/types'
import { generateCorridor } from '../maze/corridor'
import { isFloor, TILE_SIZE } from '../maze/generate'
import { ARCHETYPES } from '../scene/entities/archetypes'
import { neonFlicker, neonIntensity } from '../scene/flicker'
import { collapseSounds, CUES, isBoneHit, MOMENT_SECONDS } from './cues'
import { advanceStride, createStride } from './footsteps'
import {
  breathGain,
  breathRate,
  droneCutoff,
  droneGain,
  hazeGain,
  heartbeatBpm,
  heartbeatGain,
  LAYER_TRIM,
  LAYERS,
  MIXES,
  momentFor,
  musicSpeed,
  neonBuzzGain,
  volumeGain,
  type Moment,
} from './mix'
import { RECIPES } from './recipes'
import { SAMPLE_FILES, SOUNDTRACK } from './samples'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import { moodGain, moodRate, nearest, occlusionFor, VOICES, wallDepth } from './spatial'

describe('moments', () => {
  it('suit la phase, puis les étapes des fins', () => {
    const phases: [Phase, Moment][] = [
      ['idle', 'silent'],
      ['starting', 'silent'],
      ['error', 'silent'],
      ['exploring', 'corridor'],
      ['question', 'reading'],
      ['submitting', 'answering'],
      ['feedback', 'reacting'],
    ]
    for (const [phase, moment] of phases) expect(momentFor(phase, null, null)).toBe(moment)
    expect(momentFor('gameOver', 'beat', null)).toBe('beat')
    expect(momentFor('victory', null, 'screen')).toBe('outside')
    expect(momentFor('victory', null, 'room')).toBe('room')
  })

  it('a une balance pour chaque étape de chaque fin', () => {
    for (const [stage] of [...DEFEAT_TIMELINE, ...VICTORY_TIMELINE, ...DOOR_TIMELINE]) {
      expect(MIXES[momentFor('gameOver', null, null)], stage).toBeDefined()
      expect(MIXES[stage === 'screen' ? 'outside' : (stage as Moment)], stage).toBeDefined()
    }
  })

  it('fait passer tout le monde par le micro de surveillance à la caméra, et seulement là', () => {
    const filmed = (Object.keys(MIXES) as Moment[]).filter((m) => (MIXES[m].levels.cctv ?? 0) > 0)
    expect(filmed.sort()).toEqual(['approach', 'beat'])
    for (const m of filmed) expect(MIXES[m].levels.tape).toBeGreaterThan(0)
  })

  it('coupe net au knockout et à l\'éblouissement', () => {
    for (const m of ['knockout', 'whiteout'] as const) {
      expect(MIXES[m].cut).toBe(true)
      expect(Object.values(MIXES[m].levels).every((v) => !v)).toBe(true)
    }
  })

  it('ne garde que le vent et l\'herbe dehors', () => {
    expect(Object.keys(MIXES.outside.levels).sort()).toEqual(['grass', 'wind'])
    expect(Object.keys(MIXES.through.levels).sort()).toEqual(['grass', 'wind'])
  })

  it('laisse un quasi-silence avant les grands moments', () => {
    const loudness = (m: Moment) =>
      LAYERS.filter((l) => !['cctv', 'crush', 'gate'].includes(l)).reduce((sum, l) => sum + (MIXES[m].levels[l] ?? 0) * LAYER_TRIM[l], 0)
    expect(loudness('answering')).toBeLessThan(loudness('corridor') * 0.5)
    expect(loudness('freeze')).toBeLessThan(loudness('corridor') * 1.2)
    expect(MIXES.freeze.levels.drone ?? 0).toBe(0)
    expect(MIXES.room.levels.wind ?? 0).toBe(0)
  })

  it('n\'utilise que des couches connues', () => {
    for (const mix of Object.values(MIXES)) {
      for (const layer of Object.keys(mix.levels)) expect(LAYERS).toContain(layer)
      for (const step of mix.timeline ?? []) expect([...LAYERS, 'muffle']).toContain(step.target)
    }
  })
})

describe('la radio et le vieux disque', () => {
  const song = (m: Moment) => (MIXES[m].levels.music ?? 0) + (MIXES[m].levels.radio ?? 0)

  it('vient de la radio dans le labyrinthe, pas de partout', () => {
    expect(MIXES.corridor.levels.radio).toBeGreaterThan(0)
    for (const m of ['corridor', 'reading', 'answering', 'reacting'] as const) expect(MIXES[m].levels.music ?? 0).toBe(0)
  })

  it('reste en fond : plus discrète que l\'ambiance de la pièce', () => {
    expect(LAYER_TRIM.radio).toBeLessThanOrEqual(0.3)
    expect(LAYER_TRIM.music).toBeLessThanOrEqual(0.2)
  })

  it('ne joue jamais devant la caméra', () => {
    for (const m of ['approach', 'beat', 'knockout', 'wake'] as const) expect(song(m)).toBe(0)
  })

  it('se tait dès la lumière de la victoire', () => {
    for (const m of ['whiteout', 'room', 'door', 'through', 'outside'] as const) expect(song(m)).toBe(0)
  })

  it('presque muet juste avant le verdict', () => {
    expect(MIXES.answering.levels.radio!).toBeLessThan(MIXES.corridor.levels.radio! * 0.2)
  })

  it('ralentit quand tout s\'effondre', () => {
    expect(musicSpeed('freeze').rate).toBeLessThan(musicSpeed('over').rate)
    expect(musicSpeed('over').rate).toBeLessThan(musicSpeed('corridor').rate)
    expect(musicSpeed('freeze').rate).toBeGreaterThanOrEqual(0.25)
  })
})

describe('danger', () => {
  it('fait monter drone, cœur et bruit de fond avec les erreurs', () => {
    for (const fn of [droneGain, droneCutoff, heartbeatGain, heartbeatBpm, hazeGain]) {
      expect(fn(1)).toBeGreaterThan(fn(0.5))
      expect(fn(0.5)).toBeGreaterThanOrEqual(fn(0))
    }
  })

  it('fait entendre le cœur et la respiration dès le début', () => {
    expect(heartbeatGain(0)).toBeGreaterThan(0.1)
    expect(heartbeatGain(1)).toBeGreaterThan(1)
    expect(breathGain(0)).toBeGreaterThan(0.2)
    expect(MIXES.corridor.levels.breath).toBeGreaterThan(0)
    expect(hazeGain(0)).toBe(0)
  })

  it('accélère la respiration avec le danger et la course', () => {
    expect(breathRate(1, false)).toBeGreaterThan(breathRate(0, false))
    expect(breathRate(0, true)).toBeGreaterThan(breathRate(0, false))
  })

  it('fait retenir son souffle juste avant le verdict', () => {
    expect(MIXES.answering.levels.breath!).toBeLessThan(MIXES.corridor.levels.breath! * 0.5)
  })

  it('reste borné hors de 0..1', () => {
    expect(droneGain(5)).toBe(droneGain(1))
    expect(heartbeatBpm(-3)).toBe(heartbeatBpm(0))
  })
})

describe('volume', () => {
  it('coupe au mute, suit une courbe perçue', () => {
    expect(volumeGain(0.8, true)).toBe(0)
    expect(volumeGain(0, false)).toBe(0)
    expect(volumeGain(1, false)).toBe(1)
    expect(volumeGain(0.5, false)).toBeLessThan(0.5)
  })

  it('mémorise les réglages, sans jamais faire planter le jeu', () => {
    const data = new Map<string, string>()
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
    saveSettings(store, { volume: 0.3, muted: true })
    expect(loadSettings(store)).toEqual({ volume: 0.3, muted: true })

    const broken = {
      getItem: () => {
        throw new Error('stockage bloqué')
      },
      setItem: () => {
        throw new Error('stockage bloqué')
      },
    }
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow()
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('rejette un stockage corrompu', () => {
    const store = (raw: string) => ({ getItem: () => raw, setItem: () => {} })
    expect(loadSettings(store('{pas du json'))).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(store('42'))).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(store('{"volume":9,"muted":"oui"}'))).toEqual({ volume: 1, muted: false })
    expect(loadSettings(store('{"volume":"fort"}')).volume).toBe(DEFAULT_SETTINGS.volume)
  })
})

describe('pas', () => {
  const walk = (seconds: number, speed: number, running = false) => {
    const stride = createStride()
    let steps = 0
    for (let t = 0; t < seconds; t += 1 / 60) if (advanceStride(stride, speed / 60, 1 / 60, running)) steps++
    return steps
  }

  it('suit à peu près le rythme du balancement de tête en marchant', () => {
    expect(walk(10, 2.8)).toBeGreaterThanOrEqual(20)
    expect(walk(10, 2.8)).toBeLessThanOrEqual(22)
  })

  it('accélère en courant', () => {
    expect(walk(10, 4.6, true)).toBeGreaterThan(walk(10, 2.8))
  })

  it('ne fait pas de rafale quand le joueur est déplacé d\'un coup', () => {
    const stride = createStride()
    let steps = 0
    for (let i = 0; i < 6; i++) if (advanceStride(stride, 3, 1 / 60, false)) steps++
    expect(steps).toBe(1)
  })

  it('reste muet à l\'arrêt et contre un mur', () => {
    const stride = createStride()
    for (let i = 0; i < 300; i++) expect(advanceStride(stride, 0, 1 / 60, false)).toBe(false)
  })

  it('pose le premier pas peu après le départ, en alternant les pieds', () => {
    const stride = createStride()
    let travelled = 0
    while (!advanceStride(stride, 0.02, 1 / 60, false)) travelled += 0.02
    expect(travelled).toBeLessThan(0.5)
    const first = stride.foot
    while (!advanceStride(stride, 0.02, 1 / 60, false));
    expect(stride.foot).not.toBe(first)
  })
})

describe('espace', () => {
  const maze = generateCorridor({ seed: 'test-son', entityCount: 6 })
  const center = (x: number, y: number) => ({ x: (x + 0.5) * TILE_SIZE, z: (y + 0.5) * TILE_SIZE })

  it('ne trouve aucun mur le long du couloir, et en trouve à travers', () => {
    const floor: { x: number; y: number }[] = []
    for (let y = 0; y < maze.height; y++) for (let x = 0; x < maze.width; x++) if (isFloor(maze, x, y)) floor.push({ x, y })
    const a = floor[0]
    const b = floor.find((f) => f.y === a.y && f.x > a.x + 2) ?? floor.find((f) => f.x === a.x && f.y > a.y + 2)!
    expect(wallDepth(maze, center(a.x, a.y), center(b.x, b.y))).toBe(0)
    expect(wallDepth(maze, center(a.x, a.y), { x: -TILE_SIZE * 2, z: -TILE_SIZE * 2 })).toBeGreaterThan(0)
  })

  it('étouffe le son derrière un mur, d\'autant plus qu\'il est épais', () => {
    expect(occlusionFor(0)).toEqual({ cutoff: 16000, gain: 1 })
    expect(occlusionFor(2).cutoff).toBeLessThan(1000)
    expect(occlusionFor(6).cutoff).toBeLessThan(occlusionFor(2).cutoff)
    expect(occlusionFor(6).gain).toBeLessThan(occlusionFor(2).gain)
    expect(occlusionFor(100).cutoff).toBeGreaterThan(100)
  })

  it('ne garde que les sources proches, de la plus proche à la plus lointaine', () => {
    const points = [
      { x: 10, z: 0 },
      { x: 1, z: 0 },
      { x: 50, z: 0 },
      { x: 3, z: 0 },
    ]
    expect(nearest(points, { x: 0, z: 0 }, 2, 20)).toEqual([1, 3])
    expect(nearest(points, { x: 0, z: 0 }, 9, 20)).toEqual([1, 3, 0])
    expect(nearest([], { x: 0, z: 0 }, 2, 20)).toEqual([])
  })

  it('donne une signature distincte à chacun des six monstres, avec des sons qui existent', () => {
    const beds = ARCHETYPES.map((a) => VOICES[a].bed)
    const angers = ARCHETYPES.map((a) => VOICES[a].anger)
    expect(new Set(beds).size).toBe(6)
    expect(new Set(angers).size).toBe(6)
    for (const a of ARCHETYPES) {
      expect(RECIPES[VOICES[a].bed]).toBeDefined()
      expect(RECIPES[VOICES[a].anger]).toBeDefined()
      expect(RECIPES[VOICES[a].step]).toBeDefined()
    }
  })

  it('fait hurler certains monstres, pas tous, avec un son qui existe', () => {
    const screamers = ARCHETYPES.filter((a) => VOICES[a].scream)
    expect(screamers.length).toBeGreaterThanOrEqual(3)
    expect(screamers.length).toBeLessThan(ARCHETYPES.length)
    for (const a of screamers) expect(RECIPES[VOICES[a].scream!]).toBeDefined()
  })

  it('fait enfler et ralentir la voix avec la colère', () => {
    expect(moodGain('menace')).toBeGreaterThan(moodGain('calm'))
    expect(moodRate('menace')).toBeLessThan(moodRate('calm'))
  })
})

describe('néons', () => {
  it('coupe le son avec la lumière : même valeur pour les deux', () => {
    for (let t = 0; t < 30; t += 0.06) {
      expect(neonIntensity({ broken: false }, 2, t, 0.4, false)).toBe(neonFlicker(t, 0.4, 2))
      expect(neonIntensity({ broken: true }, 2, t, 0.4, false)).toBe(neonFlicker(t, 1, 2) * 0.55)
    }
    expect(neonIntensity({ broken: false }, 2, 3, 0.4, true)).toBe(0)
  })

  it('fait tomber le bourdonnement pendant les coupures', () => {
    expect(neonBuzzGain(0)).toBe(0)
    expect(neonBuzzGain(0.3)).toBeLessThan(0.1)
    expect(neonBuzzGain(0.95)).toBeCloseTo(0.95)
    expect(neonBuzzGain(4)).toBeLessThanOrEqual(1.4)
  })
})

describe('enregistrements', () => {
  const folder = new URL('../../public/audio/', import.meta.url)
  const listed = Object.values(SAMPLE_FILES).flat() as string[]
  const credits = readFileSync(new URL('CREDITS.md', folder), 'utf8')

  it('sont tous présents sur le disque, et rien d\'autre', () => {
    const onDisk = readdirSync(folder).filter((f) => f.endsWith('.wav'))
    expect(onDisk.sort()).toEqual([...listed].sort())
  })

  it('sont tous crédités, avec leur licence', () => {
    for (const file of listed) {
      const line = credits.split('\n').find((l) => l.includes(`\`${file}\``))
      expect(line, file).toBeDefined()
      expect(line, file).toMatch(/CC0 1\.0|CC BY-NC-SA 4\.0/)
    }
  })

  it('comptent la bande-son, présente et créditée', () => {
    expect(statSync(new URL(SOUNDTRACK, folder)).size).toBeGreaterThan(1024 * 1024)
    expect(credits).toContain(SOUNDTRACK)
  })

  it('remplacent des sons du catalogue et restent légers', () => {
    for (const name of Object.keys(SAMPLE_FILES)) expect(RECIPES).toHaveProperty(name)
    const bytes = listed.reduce((sum, file) => sum + statSync(new URL(file, folder)).size, 0)
    expect(bytes).toBeLessThan(3.5 * 1024 * 1024)
  })
})

describe('sons datés', () => {
  it('n\'utilise que des sons du catalogue', () => {
    for (const list of Object.values(CUES)) for (const cue of list ?? []) expect(RECIPES[cue.sound], cue.sound).toBeDefined()
  })

  it('ne programme aucun son après la fin de son étape', () => {
    for (const [moment, seconds] of Object.entries(MOMENT_SECONDS)) {
      for (const cue of CUES[moment as Moment] ?? []) expect(cue.at, `${moment}:${cue.sound}`).toBeLessThan(seconds!)
    }
  })

  it('place l\'aiguille et le piston au moment du jeu de scène', () => {
    const inject = CUES.inject!
    const needle = inject.find((c) => c.sound === 'needle')!
    const plunger = inject.find((c) => c.sound === 'plunger')!
    expect(needle.at).toBeCloseTo(4.02)
    expect(plunger.at).toBeGreaterThan(needle.at)
    expect(CUES.infected!.some((c) => c.sound === 'laugh')).toBe(true)
  })

  it('fait céder le corps une seule fois à chaque seuil', () => {
    for (const attackers of [1, 3, 5]) {
      const total = beatSchedule(attackers).length
      const results = Array.from({ length: total }, (_, i) => collapseSounds(i, total))
      expect(results.filter((r) => r.knees).length).toBe(1)
      expect(results.filter((r) => r.fall).length).toBe(1)
      expect(results.findIndex((r) => r.knees)).toBeLessThan(results.findIndex((r) => r.fall))
    }
  })

  it('casse des os, surtout à la fin', () => {
    expect(isBoneHit(11, 12)).toBe(true)
    expect(isBoneHit(0, 12)).toBe(false)
    expect(isBoneHit(2, 12)).toBe(true)
  })
})
