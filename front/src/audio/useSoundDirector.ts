import { useEffect, useRef } from 'react'
import type { DefeatStage, IntroStage, VictoryStage } from '../app/sequence'
import { dangerLevel } from '../game/render'
import type { GameSnapshot } from '../game/types'
import { CUES, type Cue } from './cues'
import { duck, enterMoment, playOnTv, playSound, setDanger } from './engine'
import { introMoment, momentFor, type Moment } from './mix'
import { playAt, playEntityAnger, playEntityRelease } from './stage'

function playCues(moment: Moment): void {
  for (const cue of CUES[moment] ?? []) playCue(cue)
}

function playCue(cue: Cue): void {
  const options = { delay: cue.at, gain: cue.gain, rate: cue.rate }
  if (cue.tv) playOnTv(cue.sound, options)
  else if (cue.where) playAt(cue.sound, cue.where, options)
  else playSound(cue.sound, options)
  const kind = cue.duck
  if (kind) window.setTimeout(() => duck(kind), cue.at * 1000)
}

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
    playCues(moment)
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

/** Le son de l'intro, avant la vue de jeu. Tout s'arrête net si elle est passée. */
export function useIntroSound(stage: IntroStage | null): void {
  // Une étape ne joue ses sons qu'une fois, même si l'effet est rejoué (mode strict de React).
  const played = useRef<IntroStage | null>(null)
  useEffect(() => {
    if (!stage || stage === 'done') return
    const moment = introMoment(stage)
    enterMoment(moment)
    if (played.current === stage) return
    played.current = stage
    playCues(moment)
  }, [stage])
  const running = stage !== null && stage !== 'done'
  useEffect(() => {
    if (!running) return
    return () => enterMoment('silent')
  }, [running])
}
