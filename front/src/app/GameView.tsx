import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameController } from '../game/controller'
import { toHudState, toWorldState } from '../game/render'
import type { GameSnapshot } from '../game/types'
import { generateCorridor } from '../maze/corridor'
import { generateExitRoom, reachedDoor } from '../maze/exitRoom'
import { generateMaze, tileCenter } from '../maze/generate'
import { canReachRadio, radioSpot } from '../maze/radioSpot'
import { scareLane, type ScareLane } from '../maze/scareLane'
import { entityDistanceMaps, nearestEntityDistance, signalStrength } from '../maze/physics'
import { MazeScene, type PlayerInfo } from '../scene/MazeScene'
import { canWalk, fileVanished, isPitchBlack } from '../scene/scareMotion'
import { readApiConfig } from '../api'
import { playSound } from '../audio/engine'
import { useSoundDirector } from '../audio/useSoundDirector'
import { mockCorrectAnswer } from '../api/mock'
import { directionFromTurn, readMazeLayout, readShowAnswers } from './config'
import { SCARE_TIMELINE, useTimeline, type DefeatStage, type ScareStage, type VictoryStage } from './sequence'
import { browserStore, loadScaredSession, saveScaredSession } from './session'
import { Hud } from './Hud'
import { VictimFileOverlay } from './FileOverlay'

// Vue de jeu : labyrinthe 3D + HUD + saisie (déplacement, aborder une entité,
// répondre sur son panneau). Chargée à la demande : c'est elle qui embarque Three.js.

const LAYOUT = readMazeLayout(import.meta.env.VITE_MAZE_LAYOUT, window.location.search)
const SHOW_ANSWERS = readShowAnswers(
  import.meta.env.DEV,
  readApiConfig().mock,
  import.meta.env.VITE_SHOW_ANSWERS,
  window.location.search,
)

const EXIT_ROOM = generateExitRoom()
const store = browserStore()
const NO_LANE: ScareLane = { yaw: 0, dir: { x: 0, z: -1 }, reach: 0 }

interface GameViewProps {
  game: GameController
  snapshot: GameSnapshot
  defeatStage: DefeatStage | null
  victoryStage: VictoryStage | null
  /** Le joueur est arrivé devant la porte de la pièce blanche. */
  onReachDoor: () => void
}

interface Pick {
  questionId: string
  choice: number
}

function usePointerLocked(): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const update = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', update)
    return () => document.removeEventListener('pointerlockchange', update)
  }, [])
  return locked
}

export default function GameView({ game, snapshot, defeatStage, victoryStage, onReachDoor }: GameViewProps) {
  const { question, phase, sessionId, totalIntersections } = snapshot

  // Le dossier refermé, une fois par partie : mémorisé pour survivre à une reprise,
  // oublié à la partie suivante (autre session).
  const [scaredSession, setScaredSession] = useState(() => loadScaredSession(store))
  const scared = scaredSession !== null && scaredSession === sessionId
  const [scareRun, setScareRun] = useState<string | null>(null)
  const scareKey = scareRun !== null && scareRun === sessionId ? scareRun : null
  const { stage: scareStage, jump: jumpScare } = useTimeline(SCARE_TIMELINE, scareKey)
  const scaring = scareStage !== null && scareStage !== 'done'

  // Outil de test, absent du build de production : rejouer une étape de la scène du dossier.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhScare?: (stage: ScareStage) => void }
    debug.__qhScare = jumpScare
    return () => {
      delete debug.__qhScare
    }
  }, [jumpScare])

  useSoundDirector(snapshot, defeatStage, victoryStage, scaring ? scareStage : null, scared)

  // Noir total : même le réglage du son disparaît de l'image.
  const pitchBlack = isPitchBlack(scareStage)
  useEffect(() => {
    document.body.classList.toggle('qh-blackout', pitchBlack)
    return () => document.body.classList.remove('qh-blackout')
  }, [pitchBlack])
  // Le même sessionId redonne le même labyrinthe : une partie reprise retrouve ses lieux.
  const maze = useMemo(() => {
    const options = { seed: sessionId ?? 'local', entityCount: Math.max(1, totalIntersections) }
    return LAYOUT === 'corridor' ? generateCorridor(options) : generateMaze(options)
  }, [sessionId, totalIntersections])
  const distanceMaps = useMemo(() => entityDistanceMaps(maze), [maze])
  const radio = useMemo(() => radioSpot(maze), [maze])

  const [near, setNear] = useState<number | null>(null)
  // Tuile du joueur (signal du HUD) en état ; son regard, lu seulement à la
  // réponse, dans une référence : tourner la tête ne re-rend pas la scène.
  const [tile, setTile] = useState<PlayerInfo['tile'] | null>(null)
  const yaw = useRef(0)
  const [hover, setHover] = useState<number | null>(null)
  // Choix visé au clavier, valable pour la question courante seulement.
  const [pick, setPick] = useState<Pick | null>(null)
  const keyPick = pick && question && pick.questionId === question.id ? pick.choice : null
  const lastAnswerYaw = useRef<number | null>(null)
  const mouseLook = usePointerLocked()
  const [paperOpen, setPaperOpen] = useState(false)
  const canRead = phase === 'exploring' && !defeatStage && !victoryStage && !scared && canReachRadio(maze, radio, tile)
  // S'il n'est plus à portée (la partie a pu changer), le dossier se referme.
  const reading = paperOpen && canRead

  const engage = useCallback((entity: number) => game.engage(entity), [game])

  const playerMoved = useCallback(
    (info: PlayerInfo) => {
      yaw.current = info.yaw
      setTile((prev) => (prev && prev.x === info.tile.x && prev.y === info.tile.y ? prev : info.tile))
      if (victoryStage === 'room' && reachedDoor(EXIT_ROOM, info.tile)) onReachDoor()
    },
    [victoryStage, onReachDoor],
  )

  const answer = useCallback(
    (choice: number) => {
      if (!question) return
      setPick({ questionId: question.id, choice })
      const now = yaw.current
      // Le contrat exige une direction ; on envoie le sens du dernier virage du joueur.
      void game.answer(choice, directionFromTurn(lastAnswerYaw.current ?? now, now))
      lastAnswerYaw.current = now
    },
    [game, question],
  )

  // Le dossier s'ouvre : la souris sert à tourner les pages, et reprend le regard ensuite.
  const pointerWas = useRef<Element | null>(null)
  const openFile = useCallback(() => {
    playSound('paper', { gain: 0.6 })
    setPaperOpen(true)
    pointerWas.current = document.pointerLockElement
    if (pointerWas.current) document.exitPointerLock()
  }, [])

  const closeFile = useCallback(() => {
    playSound('paper', { gain: 0.5, rate: 0.9 })
    setPaperOpen(false)
    void (pointerWas.current?.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => {})
    pointerWas.current = null
    if (!sessionId) return
    saveScaredSession(store, sessionId)
    setScaredSession(sessionId)
    setScareRun(sessionId)
  }, [sessionId])

  // Il marche encore quand le noir tombe : le couloir d'où vient le médecin suit sa position.
  const lane = useMemo(() => {
    if (!tile) return null
    const avoid = maze.entities.map((e) => ({ ...tileCenter(e), radius: 0.4 }))
    if (radio) avoid.push(radio.obstacle)
    return scareLane(maze, tile, avoid)
  }, [maze, radio, tile])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (scaring) return
      if (phase === 'exploring') {
        if (reading) {
          if (e.code === 'KeyE' || e.key === 'Escape') {
            e.preventDefault()
            closeFile()
          }
        } else if (e.code === 'KeyE' && near !== null) {
          e.preventDefault()
          engage(near)
        } else if (e.code === 'KeyE' && canRead) {
          e.preventDefault()
          openFile()
        }
        return
      }
      if (phase !== 'question' || !question) return
      const count = question.choices.length
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault()
        answer(n - 1)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        const current = keyPick ?? hover ?? (step === 1 ? -1 : 0)
        setPick({ questionId: question.id, choice: (current + step + count) % count })
      } else if ((e.key === 'Enter' || e.key === ' ') && (keyPick ?? hover) !== null) {
        e.preventDefault()
        answer((keyPick ?? hover)!)
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        game.disengage()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, question, near, engage, answer, keyPick, hover, game, reading, canRead, scaring, openFile, closeFile])

  const highlight =
    phase === 'question'
      ? (hover ?? keyPick)
      : phase === 'submitting'
        ? keyPick
        : (snapshot.lastAnswer?.choice ?? null)

  const resolved = (id: number) => snapshot.encounters.some((e) => e.entity === id) || snapshot.engagedEntity === id
  const distance = tile ? nearestEntityDistance(maze, distanceMaps, tile, (id) => !resolved(id)) : null

  return (
    <>
      <MazeScene
        maze={maze}
        radio={radio}
        frozen={reading || !canWalk(scareStage)}
        scare={scaring ? { stage: scareStage, lane: lane ?? NO_LANE } : null}
        paperGone={scared && (!scaring || fileVanished(scareStage))}
        exitRoom={EXIT_ROOM}
        snapshot={snapshot}
        defeatStage={defeatStage}
        victoryStage={victoryStage}
        highlight={highlight}
        answer={SHOW_ANSWERS && question ? mockCorrectAnswer(question.id) : null}
        onNearEntity={setNear}
        onPlayerMoved={playerMoved}
        onHoverChoice={setHover}
        onPickChoice={phase === 'question' ? answer : undefined}
      />
      {canWalk(scareStage) && (
        <Hud
          hud={toHudState(snapshot)}
          snapshot={snapshot}
          danger={toWorldState(snapshot).danger}
          signal={signalStrength(distance)}
          canEngage={phase === 'exploring' && near !== null && !scaring}
          canRead={canRead && near === null}
          mouseLook={mouseLook}
        />
      )}
      {reading && <VictimFileOverlay pseudo={snapshot.pseudo} />}
    </>
  )
}
