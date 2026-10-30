import { describe, expect, it } from 'vitest'
import { SCARE_TIMELINE, stageAt } from '../app/sequence'
import {
  canWalk,
  caughtByBeam,
  DOCTOR_WAITS,
  doctorDistance,
  doctorLeap,
  fileVanished,
  GLIMPSE,
  isPitchBlack,
  JUMP_AT,
  KICK_IMPACT,
  kickReach,
  lampDeaths,
  pickReach,
  PICK_GRAB,
  SCARE_SECONDS,
  scareHalo,
  scareLampLevel,
  scareLook,
  TORCH_REST,
  torchFall,
  torchHold,
  torchLevel,
  torchRaise,
} from './scareMotion'

describe('le dossier refermé : le fil des étapes', () => {
  it('garde l’ordre annoncé', () => {
    expect(SCARE_TIMELINE.map(([s]) => s)).toEqual(['dim', 'dark', 'torch', 'jump', 'kick', 'drop', 'pick', 'search', 'restore', 'done'])
    expect(stageAt(SCARE_TIMELINE, 0)).toBe('dim')
    expect(stageAt(SCARE_TIMELINE, 99999)).toBe('done')
  })

  it('lui laisse la main pendant que les lampes meurent, tout est écrit une fois le noir tombé', () => {
    expect(canWalk('dim')).toBe(true)
    for (const stage of ['dark', 'torch', 'jump', 'kick', 'drop', 'pick', 'search', 'restore'] as const) expect(canWalk(stage), stage).toBe(false)
    expect(canWalk('done')).toBe(true)
    expect(canWalk(null)).toBe(true)
  })

  it('fait disparaître le dossier dans le noir, jamais sous ses yeux', () => {
    expect(fileVanished('dim')).toBe(false)
    expect(fileVanished('dark')).toBe(true)
    expect(isPitchBlack('dim')).toBe(false)
    for (const stage of ['dark', 'torch', 'jump', 'kick', 'drop', 'pick', 'search'] as const) expect(isPitchBlack(stage), stage).toBe(true)
    expect(isPitchBlack('restore')).toBe(false)
  })
})

describe('les lampes', () => {
  const distances = [40, 3, 22, 9, 15, 30, 6, 12, 18, 26, 34, 50]

  it('meurent une à une : la plus proche en dernier, toutes avant le noir', () => {
    const deaths = lampDeaths(distances)
    const byDistance = distances.map((d, i) => ({ d, death: deaths[i] })).sort((a, b) => b.d - a.d)
    for (let i = 1; i < byDistance.length; i++) expect(byDistance[i].death).toBeGreaterThan(byDistance[i - 1].death)
    expect(Math.max(...deaths)).toBeLessThan(SCARE_SECONDS.dim)
  })

  it('laissent plus d’une demi-seconde entre les dernières', () => {
    const deaths = lampDeaths(distances).sort((a, b) => a - b).slice(-9)
    for (let i = 1; i < deaths.length; i++) expect(deaths[i] - deaths[i - 1]).toBeGreaterThan(0.4)
  })

  it('sont toutes éteintes pendant tout le noir, et reviennent seulement au bout', () => {
    expect(scareLampLevel('dim', 0, 5, 3, 0)).toBe(1)
    expect(scareLampLevel('dim', 6, 5, 3, 0)).toBe(0)
    for (const stage of ['dark', 'torch', 'jump', 'kick', 'drop', 'pick', 'search'] as const) expect(scareLampLevel(stage, 0.5, 0, 3, 0), stage).toBe(0)
    expect(scareLampLevel('restore', SCARE_SECONDS.restore, 0, 3, 0)).toBe(1)
    expect(scareLampLevel(null, 0, 0, 0, 0)).toBe(1)
  })

  it('éteint le halo en dernier, et ne le rallume qu’avec elles', () => {
    expect(scareHalo('dim', 0)).toBe(1)
    expect(scareHalo('dim', SCARE_SECONDS.dim - 0.05)).toBe(0)
    for (const stage of ['dark', 'torch', 'jump', 'kick', 'drop', 'pick', 'search'] as const) expect(scareHalo(stage, 0.5), stage).toBe(0)
    expect(scareHalo('restore', 1)).toBe(1)
  })
})

describe('la lampe torche', () => {
  it('reste éteinte et baissée avant le noir', () => {
    expect(torchLevel('dim', 3)).toBe(0)
    expect(torchRaise('dim', 3)).toBe(0)
    expect(torchHold('dim', 3)).toBe('none')
    expect(torchLevel('torch', 0.1)).toBe(0)
    expect(torchLevel('torch', 1.5)).toBe(1)
    expect(torchRaise('torch', 1)).toBe(1)
  })

  it('lui échappe à l’impact, reste par terre, revient quand il la ramasse', () => {
    expect(torchHold('kick', KICK_IMPACT - 0.01)).toBe('held')
    expect(torchHold('kick', KICK_IMPACT + 0.01)).toBe('free')
    expect(torchHold('drop', 1)).toBe('free')
    expect(torchHold('pick', PICK_GRAB - 0.01)).toBe('free')
    expect(torchHold('pick', PICK_GRAB + 0.01)).toBe('held')
    expect(torchHold('search', 1)).toBe('held')
  })

  it('reste allumée par terre : c’est la seule lumière', () => {
    for (const t of [0.6, 1, 1.5]) expect(torchLevel('drop', t), `${t}`).toBeGreaterThan(0.5)
    expect(torchLevel('pick', 0.5)).toBeGreaterThan(0.5)
    expect(torchLevel('search', 1)).toBeGreaterThan(0.5)
    expect(torchLevel('restore', 2)).toBe(0)
  })

  it('tombe, rebondit, roule et s’arrête en éclairant le mur', () => {
    const start = torchFall(0, 1.3)
    expect(start.height).toBeCloseTo(1.3)
    expect(start.along).toBe(0)
    const landed = torchFall(0.43, 1.3)
    expect(landed.height).toBeLessThan(0.1)
    const rest = torchFall(5, 1.3)
    expect(rest.height).toBeCloseTo(0.06)
    expect(rest.along).toBe(1)
    // Elle penche vers le sol : sa lumière y fait une flaque.
    expect(rest.tumble).toBeGreaterThan(0)
    expect(rest.tumble).toBeLessThan(0.4)
    // Perpendiculaire au couloir, ou presque : le fond reste dans le noir.
    expect(Math.cos(rest.heading)).toBeLessThan(0.2)
    expect(Math.abs(torchFall(0.05, 1.3).heading - rest.heading)).toBeGreaterThan(Math.PI)
  })

  it('ne saute pas d’une image à l’autre en tombant', () => {
    let previous = torchFall(0, 1.3)
    for (let t = 1 / 60; t < 3; t += 1 / 60) {
      const fall = torchFall(t, 1.3)
      expect(Math.abs(fall.height - previous.height), `t=${t}`).toBeLessThan(0.2)
      expect(Number.isFinite(fall.tumble), `t=${t}`).toBe(true)
      expect(Math.abs(fall.heading - previous.heading), `t=${t}`).toBeLessThan(0.4)
      previous = fall
    }
  })

  it('tend la main vers elle, la referme, puis remonte', () => {
    expect(pickReach('drop', 1)).toBe(0)
    expect(pickReach('pick', 0)).toBe(0)
    expect(pickReach('pick', PICK_GRAB)).toBe(1)
    expect(pickReach('pick', SCARE_SECONDS.pick)).toBe(2)
    expect(pickReach('search', 0)).toBe(2)
  })

  it('accroche seulement ce qui est dans son axe', () => {
    expect(caughtByBeam(1)).toBe(1)
    expect(caughtByBeam(0.88)).toBe(0)
    expect(caughtByBeam(0)).toBe(0)
  })
})

describe('son regard', () => {
  it('va à droite, à gauche, puis droit devant lui avant de le voir', () => {
    expect(scareLook('torch', 0).yaw).toBe(0)
    expect(scareLook('torch', 2).yaw).toBeLessThan(-1)
    expect(scareLook('torch', 3.5).yaw).toBeGreaterThan(1)
    expect(Math.abs(scareLook('torch', GLIMPSE).yaw)).toBeLessThan(1e-6)
    expect(scareLook('dark', 0.5).yaw).toBe(0)
  })

  it('descend vers la lampe tombée, et le fait se baisser pour la prendre', () => {
    const toward = -Math.atan2(TORCH_REST.right, TORCH_REST.forward)
    expect(scareLook('drop', 2).yaw).toBeCloseTo(toward)
    expect(scareLook('drop', 2).pitch).toBeLessThan(-0.7)
    expect(scareLook('pick', PICK_GRAB).crouch).toBeGreaterThan(0.5)
    expect(scareLook('pick', SCARE_SECONDS.pick).crouch).toBe(0)
    expect(scareLook('pick', SCARE_SECONDS.pick).pitch).toBe(0)
  })

  it('finit de fouiller le couloir face à lui', () => {
    expect(scareLook('search', 0).yaw).toBe(0)
    expect(scareLook('search', SCARE_SECONDS.search).yaw).toBe(0)
  })
})

describe('le médecin', () => {
  it('n’est là que dans le noir, avant que la lampe revienne sur lui', () => {
    expect(doctorDistance('dim', 2, 6)).toBeNull()
    expect(doctorDistance('dark', 0.5, 6)).toBeNull()
    expect(doctorDistance('torch', DOCTOR_WAITS - 0.1, 6)).toBeNull()
    expect(DOCTOR_WAITS).toBeLessThan(GLIMPSE)
    expect(doctorDistance('torch', DOCTOR_WAITS, 6)).toBeGreaterThanOrEqual(3)
  })

  it('apparaît d’un coup, après le noir d’un instant, sans jamais toucher l’objectif', () => {
    expect(doctorDistance('jump', JUMP_AT - 0.01, 6)).toBeNull()
    expect(doctorDistance('jump', JUMP_AT + 0.01, 6)).toBeLessThan(1.7)
    expect(doctorDistance('jump', 1.5, 6)).toBeGreaterThan(1)
    expect(doctorLeap('jump', JUMP_AT + 0.01)).toBeGreaterThan(0.2)
    expect(doctorLeap('jump', 1)).toBe(0)
  })

  it('part en arrière au coup de pied, dans la longueur du couloir', () => {
    const reach = 3
    expect(doctorDistance('kick', 0.1, reach)).toBe(doctorDistance('jump', 1.5, reach))
    let previous = doctorDistance('kick', KICK_IMPACT, reach)!
    for (let t = KICK_IMPACT + 0.05; t < SCARE_SECONDS.kick; t += 0.05) {
      const d = doctorDistance('kick', t, reach)!
      expect(d).toBeGreaterThan(previous)
      expect(d).toBeLessThanOrEqual(reach)
      previous = d
    }
  })

  it('n’est plus là quand il ramasse la lampe', () => {
    expect(doctorDistance('drop', SCARE_SECONDS.drop, 6)).toBeNull()
    for (const stage of ['pick', 'search', 'restore', 'done'] as const) expect(doctorDistance(stage, 0.5, 6), stage).toBeNull()
  })

  it('reçoit le pied à l’instant où la jambe est tendue', () => {
    expect(kickReach(KICK_IMPACT)).toBe(1)
    expect(kickReach(0)).toBe(0)
    expect(kickReach(1)).toBe(0)
  })
})
