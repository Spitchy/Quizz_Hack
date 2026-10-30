import { useEffect, useRef } from 'react'
import type { DefeatStage, VictoryStage } from '../app/sequence'
import { dangerLevel } from '../game/render'
import type { GameSnapshot } from '../game/types'
import { CUES } from './cues'
import { duck, enterMoment, playSound, setDanger } from './engine'
import { momentFor } from './mix'
import { playAt, playEntityAnger, playEntityRelease } from './stage'

/**
 * Le chef d'orchestre : traduit l'état du jeu (déjà dérivé du serveur) en
 * moments sonores et en sons datés. Ne décide jamais d'une règle : il écoute.
 */
export function useSoundDirector(snapshot: GameSnapshot, defeat: DefeatStage | null, victory: VictoryStage | null): void {
  const moment = momentFor(snapshot.phase, defeat, victory)
  const danger = dangerLevel(snapshot)

  useEffect(() => {
    setDanger(danger)
  }, [danger])

  useEffect(() => {
    enterMoment(moment)
    for (const cue of CUES[moment] ?? []) {
      const options = { delay: cue.at, gain: cue.gain, rate: cue.rate }
      if (cue.where) playAt(cue.sound, cue.where, options)
      else playSound(cue.sound, options)
      if (cue.duck) setTimeoutDuck(cue.duck, cue.at)
    }
  }, [moment])

  // Le silence revient si la vue de jeu disparaît (écran d'erreur).
  useEffect(() => () => enterMoment('silent'), [])

  // Verdict : une seule fois par réponse, à l'instant où le serveur l'a rendu.
  const { lastAnswer, engagedEntity } = snapshot
  const verdict = useRef<typeof lastAnswer>(null)
  useEffect(() => {
    if (!lastAnswer || verdict.current === lastAnswer) {
      verdict.current = lastAnswer
      return
    }
    verdict.current = lastAnswer
    if (lastAnswer.isCorrect) {
      duck('release')
      if (engagedEntity !== null) playEntityRelease(engagedEntity)
      else playSound('release')
    } else {
      duck('stinger')
      playSound('stinger', { gain: 0.72 })
      if (engagedEntity !== null) playEntityAnger(engagedEntity)
    }
  }, [lastAnswer, engagedEntity])
}

function setTimeoutDuck(kind: 'laugh', delay: number) {
  window.setTimeout(() => duck(kind), delay * 1000)
}
