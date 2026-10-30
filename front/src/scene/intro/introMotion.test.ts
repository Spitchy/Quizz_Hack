import { describe, expect, it } from 'vitest'
import { headlineAt, NEWS_LINES, newsLineAt } from '../../app/newsBroadcast'
import { INTRO_TIMELINE, stageAt } from '../../app/sequence'
import { chaserPose, doorOpen, fillDistance, headPose, introTime, phonePose, SCREEN, T, vanDip, vanX } from './introMotion'

const FRAME = 1 / 60

describe('intro : le fil des étapes', () => {
  it('garde l’ordre et finit par laisser la place au jeu', () => {
    expect(INTRO_TIMELINE.map(([s]) => s)).toEqual(['news', 'pull', 'watch', 'pocket', 'look', 'van', 'door', 'run', 'swing', 'black', 'done'])
    expect(stageAt(INTRO_TIMELINE, 99999)).toBe('done')
  })

  it('ne dépasse jamais l’étape suivante, même si une image est en retard', () => {
    expect(introTime('news', 500)).toBe(T.pull)
    expect(introTime('done', 3)).toBe(T.done)
    expect(introTime('run', 0.5)).toBeCloseTo(T.run + 0.5)
  })

  it('tient les sous-titres dans le bulletin, sans chevauchement', () => {
    let last = 0
    for (const line of NEWS_LINES) {
      expect(line.at).toBeGreaterThanOrEqual(last)
      expect(line.end).toBeGreaterThan(line.at)
      last = line.end
    }
    expect(last).toBeLessThanOrEqual(T.pocket)
    expect(newsLineAt(3)).toBe('Neuf développeurs disparus cette semaine.')
    expect(newsLineAt(1.9)).toBeNull()
    expect(headlineAt(0)).toContain('DISPARUS')
  })
})

describe('intro : le recul depuis le plein écran', () => {
  it('commence avec un écran qui recouvre toute l’image, quel que soit le format', () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      const d = fillDistance(aspect, 70)
      const tan = Math.tan((70 * Math.PI) / 360)
      expect(d * tan * 2).toBeLessThan(SCREEN.height)
      expect(d * tan * 2 * aspect).toBeLessThan(SCREEN.width)
      expect(d).toBeGreaterThan(0.02)
    }
  })

  it('ne saute jamais : le téléphone glisse d’un seul mouvement jusqu’à la poche', () => {
    const fill = fillDistance(16 / 9, 70)
    let previous = phonePose(0, fill)
    for (let t = FRAME; t < T.look; t += FRAME) {
      const pose = phonePose(t, fill)
      expect(Math.abs(pose.z - previous.z), `t=${t}`).toBeLessThan(0.02)
      expect(Math.abs(pose.y - previous.y), `t=${t}`).toBeLessThan(0.03)
      previous = pose
    }
  })

  it('reste plein cadre pendant le bulletin, et verrouille l’écran avant la poche', () => {
    const fill = fillDistance(16 / 9, 70)
    expect(phonePose(T.pull - 0.01, fill).z).toBeCloseTo(-fill)
    expect(phonePose(T.pocket - 0.01, fill).screenOn).toBe(true)
    expect(phonePose(T.pocket + 0.01, fill).screenOn).toBe(false)
    expect(phonePose(T.look + 0.01, fill).present).toBe(false)
  })
})

describe('intro : la rue', () => {
  it('fait arriver la camionnette vite, et l’arrête en douceur devant lui', () => {
    expect(vanX(T.van)).toBeLessThan(-60)
    let previous = vanX(T.van)
    for (let t = T.van; t < T.door; t += FRAME) {
      const x = vanX(t)
      expect(x).toBeGreaterThanOrEqual(previous)
      expect(x - previous, `t=${t}`).toBeLessThan(0.6)
      previous = x
    }
    expect(vanX(T.door)).toBe(0)
    expect(Math.abs(vanDip(T.door + 3))).toBeLessThan(0.002)
  })

  it('n’ouvre la porte qu’à son arrêt', () => {
    expect(doorOpen(T.door)).toBe(0)
    expect(doorOpen(T.run)).toBe(1)
  })

  it('ne fait jamais sauter la tête d’une image à l’autre', () => {
    let previous = headPose(0)
    for (let t = FRAME; t < T.black; t += FRAME) {
      const pose = headPose(t)
      // Le regard par-dessus l'épaule est très vif, mais reste un mouvement.
      expect(Math.abs(pose.yaw - previous.yaw), `t=${t}`).toBeLessThan(0.35)
      expect(Math.abs(pose.x - previous.x), `t=${t}`).toBeLessThan(0.15)
      previous = pose
    }
  })

  it('le fait rattraper : la batte n’arrive sur lui qu’au noir', () => {
    expect(chaserPose(T.door).visible).toBe(false)
    expect(chaserPose(T.run).visible).toBe(true)
    expect(chaserPose(T.swing - 0.01).strike).toBe(0)
    expect(chaserPose(T.black).strike).toBeCloseTo(1)
    const gap = Math.abs(headPose(T.swing + 0.1).x - chaserPose(T.swing + 0.1).x)
    expect(gap).toBeLessThan(1.3)
  })
})
