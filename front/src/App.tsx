import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createGameApi, readApiConfig } from './api'
import { preloadSounds } from './audio/bank'
import { audioDebug, stopSounds, unlockAudio } from './audio/engine'
import './app/app.css'
import { DEV_TOKEN, TIMING } from './app/config'
import { DefeatOverlay, GameOverOverlay, VictoryOverlay, VictoryScreen } from './app/endings'
import { SoundControl } from './app/SoundControl'
import { beatSchedule, DEFEAT_TIMELINE, DOOR_TIMELINE, useTimeline, VICTORY_TIMELINE, type DefeatStage } from './app/sequence'
import { ErrorScreen, LoadingScreen, TitleScreen } from './app/screens'
import {
  browserStore,
  clearSessionId,
  enterGame,
  NO_TOKEN_ERROR,
  readLaunch,
  saveSessionId,
} from './app/session'
import { createGameController } from './game/controller'
import { toScreen, upsetEntities } from './game/render'
import type { GameError } from './game/types'

// La vue 3D (Three.js) est chargée à part : l'écran-titre s'affiche tout de suite.
const loadGameView = () => import('./app/GameView')
const GameView = lazy(loadGameView)

const apiConfig = readApiConfig()
// Lu une seule fois au chargement ; le jeton est retiré de la barre d'adresse.
const launch = readLaunch(window.location.href, apiConfig.mock ? DEV_TOKEN : null)
if (launch.cleanUrl) window.history.replaceState(window.history.state, '', launch.cleanUrl)
const store = browserStore()

function requestFullscreen() {
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {
    // Refusé (iframe, navigateur) : on joue en fenêtre.
  })
}

export default function App() {
  const [game] = useState(() => createGameController(createGameApi(apiConfig)))
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot)
  const [entered, setEntered] = useState(false)
  const [launchError, setLaunchError] = useState<GameError | null>(null)
  const screen = toScreen(snapshot)

  // Mises en scène des fins, rejouées à chaque nouvelle partie terminée.
  const defeat = useTimeline(DEFEAT_TIMELINE, snapshot.phase === 'gameOver' ? `${snapshot.sessionId}:over` : null)
  const defeatStage = defeat.stage
  const hits = useMemo(() => beatSchedule(upsetEntities(snapshot).length).map((h) => h.at), [snapshot])
  const victoryKey = snapshot.phase === 'victory' ? `${snapshot.sessionId}:win` : null
  const victory = useTimeline(VICTORY_TIMELINE, victoryKey)
  // La porte : déclenchée quand le joueur l'atteint.
  const [doorKey, setDoorKey] = useState<string | null>(null)
  const door = useTimeline(DOOR_TIMELINE, doorKey !== null && doorKey === victoryKey ? doorKey : null)
  const [skippedVictory, setSkippedVictory] = useState<string | null>(null)
  const victoryStage = victoryKey && skippedVictory === victoryKey ? 'screen' : (door.stage ?? victory.stage)

  const reachDoor = useCallback(() => {
    if (victoryKey && victory.stage === 'room' && doorKey !== victoryKey) setDoorKey(victoryKey)
  }, [victoryKey, victory.stage, doorKey])

  // [ESPACE] / [ENTRÉE] : passer directement à l'écran final.
  const skippable = (defeatStage !== null && defeatStage !== 'over') || (victoryStage !== null && victoryStage !== 'screen')
  useEffect(() => {
    if (!skippable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return
      e.preventDefault()
      stopSounds()
      if (defeatStage) defeat.skip()
      else if (victoryKey) setSkippedVictory(victoryKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [skippable, defeatStage, defeat, victoryKey])

  useEffect(() => {
    void loadGameView()
    preloadSounds()
  }, [])

  // Outil de test, absent du build de production : rejouer une étape de la défaite.
  const jumpDefeat = defeat.jump
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhDefeat?: (stage: string) => void }
    debug.__qhDefeat = (stage) => {
      stopSounds()
      jumpDefeat(stage as DefeatStage)
    }
    return () => {
      delete debug.__qhDefeat
    }
  }, [jumpDefeat])

  // Outil de test, absent du build de production : l'état du son, sans pouvoir l'écouter.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhAudio?: typeof audioDebug }
    debug.__qhAudio = audioDebug
    return () => {
      delete debug.__qhAudio
    }
  }, [])

  // Mémorise la session en cours pour la reprendre après un rechargement.
  useEffect(() => {
    if (!snapshot.sessionId || !snapshot.gameStatus) return
    if (snapshot.gameStatus === 'IN_PROGRESS') saveSessionId(store, snapshot.sessionId)
    else clearSessionId(store)
  }, [snapshot.sessionId, snapshot.gameStatus])

  // L'entité réagit un instant, puis le joueur reprend l'exploration.
  useEffect(() => {
    if (snapshot.phase !== 'feedback') return
    const ms = snapshot.lastAnswer?.isCorrect ? TIMING.feedbackCorrectMs : TIMING.feedbackWrongMs
    const id = setTimeout(game.continueExploring, ms)
    return () => clearTimeout(id)
  }, [game, snapshot.phase, snapshot.lastAnswer])

  const enter = async () => {
    // Dans le clic : les navigateurs n'autorisent le son qu'après un geste du joueur.
    unlockAudio()
    requestFullscreen()
    setEntered(true)
    setLaunchError(null)
    if ((await enterGame(game, launch.token, store)) === 'no-token') setLaunchError(NO_TOKEN_ERROR)
  }

  const replay = () => {
    if (!launch.token) {
      setLaunchError(NO_TOKEN_ERROR)
      return
    }
    stopSounds()
    void game.start(launch.token)
  }

  const retry = () => {
    const { sessionId, error } = snapshot
    if (sessionId && error?.code !== 'SESSION_NOT_FOUND') void game.resume(sessionId)
    else if (sessionId) replay()
    else void enter()
  }

  const inGame = screen === 'explore' || screen === 'question' || screen === 'victory' || screen === 'defeat'
  // Curseur visible pour viser le panneau et sur les écrans 2D ; caché en exploration
  // (réticule) et pendant les fins (les écrans finaux le rétablissent).
  const cursorHidden = entered && !launchError && inGame && snapshot.phase !== 'question'

  let content
  if (!entered) {
    content = <TitleScreen onEnter={() => void enter()} />
  } else if (launchError) {
    content = <ErrorScreen error={launchError} />
  } else if (screen === 'error' && snapshot.error) {
    content = <ErrorScreen error={snapshot.error} onRetry={snapshot.error.code === 'NO_TOKEN' ? undefined : retry} />
  } else if (!inGame) {
    content = <LoadingScreen />
  } else {
    content = (
      <Suspense fallback={<LoadingScreen />}>
        <GameView
          game={game}
          snapshot={snapshot}
          defeatStage={defeatStage}
          victoryStage={victoryStage}
          onReachDoor={reachDoor}
        />
        {defeatStage && <DefeatOverlay stage={defeatStage} hits={hits} />}
        {defeatStage === 'over' && <GameOverOverlay key={snapshot.sessionId} snapshot={snapshot} onReplay={replay} />}
        {victoryStage && <VictoryOverlay stage={victoryStage} />}
        {victoryStage === 'screen' && <VictoryScreen key={snapshot.sessionId} snapshot={snapshot} onReplay={replay} />}
        {skippable && <div className="skip-hint">[ESPACE] PASSER</div>}
      </Suspense>
    )
  }

  return (
    <div
      className={[
        'app',
        cursorHidden && 'app--no-cursor',
        defeatStage === 'freeze' && 'app--dread',
        defeatStage === 'wake' && 'app--waking',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={(e) => e.preventDefault()}
    >
      {content}
      <SoundControl />
    </div>
  )
}
